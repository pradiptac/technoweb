<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Setting;
use App\Notifications\OrderDispatched;
use App\Support\Store\Fulfilment;
use App\Support\Store\Returns\ReturnPolicy;
use App\Support\Store\Shipping\CourierSettings;
use App\Support\Store\Shipping\Shipments;
use App\Support\Store\Shipping\Shiprocket;
use App\Support\Store\Shipping\ShiprocketRefused;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Route;
use Tests\Support\FakesShiprocket;
use Tests\TestCase;

/**
 * Courier booking and tracking through Shiprocket (docs/store.md
 * "Shiprocket", 0.143.0).
 *
 * **Shiprocket is never reached.** There is no sandbox — every real call acts
 * on a live account — so the whole service is one `Http::fake()` router
 * (`FakesShiprocket`) under `Http::preventStrayRequests()`: a call this
 * suite did not expect fails the test instead of leaving the machine.
 *
 * What it rests on, each asserted on its own:
 *
 *   1. **The sign-in is cached and redone once.** One login serves many
 *      calls; a 401 signs in again; a second 401 gives up.
 *   2. **The body says what a courier needs, in a courier's units.** Weight
 *      in kilograms as a three-place string, money in rupees, COD or Prepaid
 *      — and nothing the customer typed beyond what a parcel requires.
 *   3. **Book once.** A second press while the first is in flight, or after
 *      it, creates nothing.
 *   4. **Refusals are Shiprocket's words**, including the ones it sends with
 *      a 200.
 *   5. **The webhook fails closed, answers 200 and never moves an order
 *      backwards.**
 *   6. **Manual stays untouched**: with the provider on `manual` nothing is
 *      asked of anybody.
 */
class ShiprocketTest extends TestCase
{
    use FakesShiprocket;
    use RefreshDatabase;

    private const WEBHOOK = '/api/v1/store/shipping/webhooks/courier';

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpShiprocket();
    }

    private function bookUrl(Order $order, string $action = 'book'): string
    {
        return "/api/v1/admin/store/orders/{$order->order_number}/shipment/{$action}";
    }

    private function scan(array $overrides = [], ?string $token = 'a-long-shared-secret-token')
    {
        $headers = $token !== null ? ['x-api-key' => $token] : [];

        return $this->withHeaders($headers)->postJson(self::WEBHOOK, array_replace([
            'awb' => '321055706540', 'courier_name' => 'Delhivery Surface',
            'shipment_status' => 'PICKED UP', 'shipment_status_id' => 42, 'current_status_id' => 20,
            'current_timestamp' => '12 10 2026 15:30:00',
            'order_id' => 'ORD-2026-00001_150876814', 'sr_order_id' => 16161616, 'is_return' => 0,
        ], $overrides));
    }

    /* ------------------------------------------------------------ sign-in */

    public function test_the_sign_in_is_cached_and_redone_once_on_a_401(): void
    {
        $client = new Shiprocket;
        $client->pickupLocations();
        $client->pickupLocations();

        $this->assertSame(1, $this->srLogins, 'One sign-in serves both calls.');
        $this->assertSame(['email' => 'api-user@technoware.test', 'password' => 'api-password'], $this->srCalled('POST', '/auth/login')[0]['body']);
        $this->assertTrue(Cache::has('shiprocket.token.'.sha1('api-user@technoware.test')));

        // The token expires: one 401, one fresh sign-in, one retry that works.
        $this->srRevoked = ['tok-1'];
        $client->pickupLocations();

        $this->assertSame(2, $this->srLogins);
        $gets = $this->srCalled('GET', '/settings/company/pickup');
        $this->assertSame(['tok-1', 'tok-1', 'tok-1', 'tok-2'], array_column($gets, 'token'));
    }

    public function test_a_second_401_gives_up_instead_of_looping(): void
    {
        $this->srRevoked = ['tok-1'];
        $this->srAnswers['POST /auth/login'] = [['token' => 'tok-1']];

        try {
            (new Shiprocket)->pickupLocations();
            $this->fail('A token that is refused twice must be reported.');
        } catch (ShiprocketRefused $e) {
            $this->assertSame('Unauthenticated.', $e->getMessage());
            $this->assertTrue($e->isAuthorisation());
        }

        $this->assertCount(2, $this->srCalled('GET', '/settings/company/pickup'));
        $this->assertFalse(Cache::has('shiprocket.token.'.sha1('api-user@technoware.test')), 'A refused token is forgotten.');
        $this->assertSame('Unauthenticated.', Setting::get('shiprocket_error'));
    }

    public function test_a_refused_sign_in_is_reported_in_shiprocket_s_words(): void
    {
        $this->srAnswers['POST /auth/login'] = [['message' => 'These credentials do not match our records.', 'status_code' => 400], 400];

        $this->srAs(RoleEnum::Admin)->postJson('/api/v1/admin/settings/shiprocket/test')
            ->assertStatus(422)->assertJsonPath('message', 'These credentials do not match our records.');

        $this->assertSame('These credentials do not match our records.', Setting::get('shiprocket_error'));

        // …and a success clears it.
        unset($this->srAnswers['POST /auth/login']);
        $this->srAs(RoleEnum::Admin)->postJson('/api/v1/admin/settings/shiprocket/test')->assertOk();
        $this->assertNull(Setting::get('shiprocket_error'));
    }

    /* --------------------------------------------------------- the body */

    public function test_a_paid_order_is_booked_with_the_documented_body_and_units(): void
    {
        $order = $this->paidOrder();

        $booked = Shipments::book($order);

        $body = $this->srCalled('POST', '/orders/create/adhoc')[0]['body'];

        $this->assertSame($order->order_number, $body['order_id']);
        $this->assertSame('Prepaid', $body['payment_method']);
        $this->assertSame('1.750', $body['weight'], 'Kilograms, three places, a string — 1750 g.');
        $this->assertSame([20.0, 15.0, 10.0], [(float) $body['length'], (float) $body['breadth'], (float) $body['height']]);
        $this->assertSame('Warehouse', $body['pickup_location']);
        $this->assertSame('2026-10-12 11:00', $body['order_date']);

        $this->assertSame('Priya Das', $body['billing_customer_name']);
        $this->assertSame(9800000000, $body['billing_phone'], 'Digits only, no +91.');
        $this->assertSame('priya@acme.co.in', $body['billing_email']);
        $this->assertSame('1 Park Street', $body['billing_address']);
        $this->assertSame('Floor 2', $body['billing_address_2']);
        $this->assertSame('Kolkata', $body['billing_city']);
        $this->assertSame(700016, $body['billing_pincode']);
        $this->assertSame('West Bengal', $body['billing_state']);
        $this->assertTrue($body['shipping_is_billing']);

        $this->assertCount(1, $body['order_items']);
        $this->assertSame([
            'name' => 'Aruba 2930F switch — 24 port', 'sku' => 'JL253A', 'units' => 2, 'selling_price' => 10000, 'tax' => 18,
        ], $body['order_items'][0]);
        $this->assertSame(20000, $body['sub_total'], 'Rupees, from 2000000 paise.');
        $this->assertSame(0, $body['shipping_charges']);

        // Nothing the courier does not need leaves the building.
        $wire = json_encode($body);
        $this->assertStringNotContainsString('private note', $wire);
        $this->assertStringNotContainsString('19ABCDE1234F1Z5', $wire);
        $this->assertStringNotContainsString('9 Billing Lane', $wire);

        // Both of Shiprocket's ids are kept, and the AWB lands where a typed one goes.
        $this->assertSame('created', $booked->shipment_booking);
        $this->assertSame('16161616', $booked->shipment_order_id);
        $this->assertSame('15151515', $booked->shipment_id);
        $this->assertSame('Delhivery Surface', $booked->courier);
        $this->assertSame('321055706540', $booked->tracking_number);
        $this->assertStringContainsString('321055706540', $booked->tracking_url);
        $this->assertNotNull($booked->shipment_awb_at);
        $this->assertSame(1, $booked->shipment_attempts);

        $assign = $this->srCalled('POST', '/courier/assign/awb')[0]['body'];
        $this->assertSame(15151515, $assign['shipment_id']);
        $this->assertArrayNotHasKey('courier_id', $assign, 'Shiprocket picks its default courier.');
    }

    public function test_a_cod_order_is_booked_as_cod_with_the_discount_taken_off(): void
    {
        $order = $this->codOrder(['discount_paise' => 100000, 'shipping_paise' => 15000]);

        Shipments::book($order, parcel: ['weight_grams' => 2500, 'length' => 30]);

        $body = $this->srCalled('POST', '/orders/create/adhoc')[0]['body'];

        $this->assertSame('COD', $body['payment_method']);
        $this->assertSame('2.500', $body['weight']);
        $this->assertSame(30.0, (float) $body['length']);
        $this->assertSame(19000, $body['sub_total'], 'Goods 20000 less the 1000 discount.');
        $this->assertSame(150, $body['shipping_charges']);
        $this->assertSame(0, $body['total_discount'], 'Not subtracted twice.');
    }

    public function test_units_are_converted_on_integers(): void
    {
        $this->assertSame('0.001', Shipments::kg(1));
        $this->assertSame('0.500', Shipments::kg(500));
        $this->assertSame('1.000', Shipments::kg(1000));
        $this->assertSame('12.345', Shipments::kg(12345));
        $this->assertSame(10000, Shipments::rupees(1000000));
        $this->assertSame(1179.99, Shipments::rupees(117999));
        $this->assertSame('9800000000', Shipments::phone('+91 98000-00000'));
        $this->assertSame('9800000000', Shipments::phone('098000 00000'));
    }

    public function test_the_weight_comes_from_the_order_else_the_shipping_quote_rule(): void
    {
        $this->assertSame(1750, Shipments::weightGrams($this->paidOrder()));

        // An order with no recorded weight (placed before zones) is weighed by `ShippingQuote`'s rule:
        // the line's product, else the shop's default of 500 g, per unit.
        $unweighed = $this->paidOrder(['shipping_weight_grams' => null]);

        $this->assertSame(1000, Shipments::weightGrams($unweighed), '2 units × 500 g default.');
    }

    /* --------------------------------------------------------- book once */

    public function test_a_second_press_while_the_first_is_in_flight_creates_nothing(): void
    {
        $order = $this->paidOrder();
        $inner = null;

        $this->srAnswers['POST /orders/create/adhoc'] = function () use ($order, &$inner) {
            try {
                Shipments::book($order);
            } catch (ShiprocketRefused $e) {
                $inner = $e->getMessage();
            }

            return [['order_id' => 16161616, 'shipment_id' => 15151515, 'status' => 'NEW'], 200];
        };

        Shipments::book($order);

        $this->assertStringContainsString('being booked right now', (string) $inner);
        $this->assertCount(1, $this->srCalled('POST', '/orders/create/adhoc'));

        // And after it: already booked.
        try {
            Shipments::book($order);
            $this->fail('A booked order must not be booked again.');
        } catch (ShiprocketRefused $e) {
            $this->assertStringContainsString('already booked', $e->getMessage());
        }

        $this->assertCount(1, $this->srCalled('POST', '/orders/create/adhoc'));
    }

    public function test_a_claim_abandoned_by_a_dead_worker_can_be_taken_over(): void
    {
        $order = $this->paidOrder();
        Order::query()->whereKey($order->id)->update(['shipment_booking' => 'creating', 'shipment_claimed_at' => now()->subMinutes(30), 'shipment_attempts' => 1]);

        $booked = Shipments::book($order);

        $this->assertSame('created', $booked->shipment_booking);
        $this->assertSame($order->order_number.'-2', $this->srCalled('POST', '/orders/create/adhoc')[0]['body']['order_id'], 'A retry never reuses an id.');
    }

    /* ---------------------------------------------------------- refusals */

    public function test_an_unpaid_prepaid_order_cannot_be_booked(): void
    {
        $order = $this->srOrder(['status' => OrderStatus::PendingPayment]);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))
            ->assertStatus(422)->assertJsonPath('message', 'This order has not been paid yet, so there is nothing to ship.');

        $this->assertCount(0, $this->srCalls, 'Nothing was asked of Shiprocket.');
        $this->assertNull($order->fresh()->shipment_booking);
    }

    public function test_a_digital_only_order_cannot_be_booked(): void
    {
        $order = $this->srOrder(['status' => OrderStatus::Paid, 'paid_at' => now(), 'shipping_address' => null], digitalOnly: true);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))
            ->assertStatus(422)->assertJsonPath('message', 'This order has nothing to ship — it is a licence or a service.');

        $this->assertCount(0, $this->srCalls);
    }

    public function test_a_manual_install_asks_nothing_of_anybody(): void
    {
        Setting::put('store_courier_provider', 'manual');
        $order = $this->paidOrder();

        foreach (['book', 'assign', 'pickup', 'label', 'cancel', 'track'] as $action) {
            $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order, $action))->assertStatus(422);
        }

        $this->assertSame([], $this->srCalls);

        // No control, and no key worth reading, on the order's own read.
        $this->srAs(RoleEnum::StoreManager)->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk()->assertJsonPath('data.shipment', null);

        // The settings screen's status makes no call while the provider is manual.
        $this->srAs(RoleEnum::Admin)->getJson('/api/v1/admin/settings/shiprocket')
            ->assertOk()->assertJsonPath('data.provider', 'manual')->assertJsonPath('data.active', false)->assertJsonPath('data.locations', []);
        $this->assertSame([], $this->srCalls);

        // The hand-typed tracking form is exactly what it was.
        $this->srAs(RoleEnum::StoreManager)->patchJson("/api/v1/admin/store/orders/{$order->order_number}/shipping", [
            'courier' => 'Blue Dart', 'tracking_number' => 'BD1',
        ])->assertOk()->assertJsonPath('data.courier', 'Blue Dart');
    }

    public function test_incomplete_settings_are_the_same_as_manual(): void
    {
        Setting::put('shiprocket_pickup_location', null);
        $order = $this->paidOrder();

        $this->assertFalse(CourierSettings::active());
        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))
            ->assertStatus(422)->assertJsonPath('message', 'Shiprocket is not fully set up: Choose the pickup location.');
        $this->assertSame([], $this->srCalls);
    }

    public function test_a_200_with_an_error_body_is_a_refusal_in_shiprocket_s_words(): void
    {
        $order = $this->paidOrder();

        // HTTP 200 carrying a status of its own.
        $this->srAnswers['POST /orders/create/adhoc'] = [['status' => 404, 'message' => 'Pickup location does not exist.'], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))
            ->assertStatus(422)->assertJsonPath('message', 'Pickup location does not exist.');

        $order = $order->fresh();
        $this->assertSame('failed', $order->shipment_booking);
        $this->assertSame('Pickup location does not exist.', $order->shipment_error);
        $this->assertSame('Pickup location does not exist.', Setting::get('shiprocket_error'));

        // HTTP 200 with no order in it, and a validation error beside the message.
        $this->srAnswers['POST /orders/create/adhoc'] = [['message' => 'Oops! Invalid Data.', 'errors' => ['order_id' => ['The order id field is required.']]], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))
            ->assertStatus(422)->assertJsonPath('message', 'Oops! Invalid Data. The order id field is required.');

        // A real success is booked under the next id, and clears the banner.
        unset($this->srAnswers['POST /orders/create/adhoc']);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))->assertOk()
            ->assertJsonPath('data.shipment.booking', 'created')->assertJsonPath('data.shipment.shiprocket_order_id', '16161616');

        $this->assertNull(Setting::get('shiprocket_error'));
        $ids = array_column(array_column($this->srCalled('POST', '/orders/create/adhoc'), 'body'), 'order_id');
        $this->assertSame([$order->order_number, $order->order_number.'-2', $order->order_number.'-3'], $ids);
    }

    public function test_a_server_fault_warns_that_the_order_may_exist(): void
    {
        $order = $this->paidOrder();
        $this->srAnswers['POST /orders/create/adhoc'] = [['message' => 'Server Error'], 500];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))->assertStatus(422);

        $this->assertStringContainsString('may still have received the order', $order->fresh()->shipment_error);
    }

    /* -------------------------------------- AWB, pickup, label and cancel */

    public function test_a_refused_courier_leaves_the_booking_and_can_be_assigned_again(): void
    {
        $order = $this->paidOrder();
        $this->srAnswers['POST /courier/assign/awb'] = [['awb_assign_status' => 0, 'message' => 'Insufficient wallet balance.'], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))->assertOk()
            ->assertJsonPath('data.shipment.booking', 'created')
            ->assertJsonPath('data.shipment.has_courier', false)
            ->assertJsonPath('data.shipment.error', 'Insufficient wallet balance.')
            ->assertJsonPath('data.shipment.can_assign', true)
            ->assertJsonPath('data.shipment.can_book', false)
            ->assertJsonPath('data.tracking_number', null);

        unset($this->srAnswers['POST /courier/assign/awb']);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order, 'assign'), ['courier_id' => 43])->assertOk()
            ->assertJsonPath('data.tracking_number', '321055706540')
            ->assertJsonPath('data.shipment.error', null)
            ->assertJsonPath('data.shipment.can_pickup', true);

        $this->assertSame(43, $this->srCalled('POST', '/courier/assign/awb')[1]['body']['courier_id']);
        $this->assertCount(1, $this->srCalled('POST', '/orders/create/adhoc'), 'Assigning again does not book again.');
    }

    public function test_pickup_label_and_cancel(): void
    {
        $order = $this->paidOrder();
        $manager = fn () => $this->srAs(RoleEnum::StoreManager);

        $manager()->postJson($this->bookUrl($order), ['weight_grams' => 3000, 'length' => 25, 'breadth' => 20, 'height' => 12])->assertOk();

        $call = $this->srCalled('POST', '/orders/create/adhoc')[0]['body'];
        $this->assertSame('3.000', $call['weight']);
        $this->assertSame([25.0, 20.0, 12.0], [(float) $call['length'], (float) $call['breadth'], (float) $call['height']]);

        // Pickup: the shipment id goes as an array.
        $manager()->postJson($this->bookUrl($order, 'pickup'))->assertOk()
            ->assertJsonPath('data.shipment.can_pickup', false)->assertJsonStructure(['data' => ['shipment' => ['pickup_requested_at']]]);
        $this->assertSame([15151515], $this->srCalled('POST', '/courier/generate/pickup')[0]['body']['shipment_id']);

        // Label.
        $manager()->postJson($this->bookUrl($order, 'label'))->assertOk()
            ->assertJsonPath('data.shipment.label_url', 'https://labels.example.test/shipping-label-15151515.pdf');
        $this->assertSame([15151515], $this->srCalled('POST', '/courier/generate/label')[0]['body']['shipment_id']);

        // Cancel: the AWB, then the order by Shiprocket's own id.
        $manager()->postJson($this->bookUrl($order, 'cancel'))->assertOk()
            ->assertJsonPath('data.shipment.booking', 'cancelled')->assertJsonPath('data.tracking_number', null)->assertJsonPath('data.courier', null);
        $this->assertSame(['321055706540'], $this->srCalled('POST', '/orders/cancel/shipment/awbs')[0]['body']['awbs']);
        $this->assertSame([16161616], $this->srCalled('POST', '/orders/cancel')[0]['body']['ids']);

        // …and the order can be booked again, under a fresh reference.
        $manager()->postJson($this->bookUrl($order))->assertOk()->assertJsonPath('data.shipment.booking', 'created');
        $this->assertSame($order->order_number.'-2', $this->srCalled('POST', '/orders/create/adhoc')[1]['body']['order_id']);

        // The trail says who did what.
        $notes = collect($order->fresh()->history()->pluck('note'))->filter()->implode(' | ');
        $this->assertStringContainsString('Booked with Shiprocket', $notes);
        $this->assertStringContainsString('Pickup requested', $notes);
        $this->assertStringContainsString('Shipment cancelled', $notes);
    }

    public function test_a_refusal_to_pick_up_or_label_is_shiprocket_s_words(): void
    {
        $order = $this->bookedOrder();
        $this->srAnswers['POST /courier/generate/pickup'] = [['pickup_status' => 0, 'response' => ['data' => 'Pickup already scheduled.']], 200];
        $this->srAnswers['POST /courier/generate/label'] = [['label_created' => 0, 'label_url' => '', 'response' => 'No valid shipment ids to print label'], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order, 'pickup'))
            ->assertStatus(422)->assertJsonPath('message', 'Pickup already scheduled.');
        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order, 'label'))
            ->assertStatus(422)->assertJsonPath('message', 'No valid shipment ids to print label');
    }

    /* ------------------------------------------------------------ webhook */

    public function test_the_webhook_address_names_neither_the_vendor_nor_its_short_forms(): void
    {
        $route = Route::getRoutes()->getByName('api.v1.store.shipping.webhook');

        $this->assertNotNull($route);
        $this->assertSame('api/v1/store/shipping/webhooks/courier', $route->uri());

        foreach ([$route->uri(), route('api.v1.store.shipping.webhook')] as $address) {
            foreach (['shiprocket', 'kartrocket', 'sr', 'kr'] as $forbidden) {
                $this->assertStringNotContainsString($forbidden, strtolower($address), "Shiprocket refuses a webhook URL containing \"{$forbidden}\".");
            }
        }

        $this->srAs(RoleEnum::Admin)->getJson('/api/v1/admin/settings/shiprocket')
            ->assertOk()->assertJsonPath('data.webhook_url_ok', true);
    }

    public function test_a_missing_or_wrong_token_changes_nothing_and_still_answers_200(): void
    {
        $order = $this->bookedOrder();

        foreach ([null, 'wrong-token', ''] as $token) {
            $this->scan(token: $token)->assertOk()->assertJsonPath('ok', true);
        }

        // No token configured accepts nothing, even an empty header.
        Setting::put('shiprocket_webhook_token', null);
        $this->scan(token: '')->assertOk();
        $this->scan(token: null)->assertOk();

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertNull($order->shipment_status_id);
    }

    public function test_a_picked_up_scan_dispatches_the_order_and_sends_one_dispatch_email(): void
    {
        $order = $this->bookedOrder();
        Notification::fake();

        $this->scan()->assertOk();

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Dispatched, $order->status);
        $this->assertNotNull($order->dispatched_at);
        $this->assertSame(42, $order->shipment_status_id);
        $this->assertSame('Picked up', $order->shipment_status);

        // Paid → ready → dispatched: the states the desk would have walked through.
        $moves = $order->history()->pluck('to_status')->all();
        $this->assertContains(OrderStatus::ReadyForDispatch->value, $moves);
        $this->assertContains(OrderStatus::Dispatched->value, $moves);

        // The same scan twice, and a later one, tell the customer nothing more.
        $this->scan()->assertOk();
        $this->scan(['shipment_status_id' => 18, 'shipment_status' => 'IN TRANSIT'])->assertOk();

        Notification::assertSentOnDemandTimes(OrderDispatched::class, 1);
        $this->assertSame(18, $order->fresh()->shipment_status_id);
        $this->assertSame(OrderStatus::Dispatched, $order->fresh()->status);
    }

    public function test_a_cod_order_is_dispatched_from_confirmed(): void
    {
        $order = Shipments::book($this->codOrder());
        Notification::fake();

        $this->scan(['sr_order_id' => 16161616])->assertOk();

        $this->assertSame(OrderStatus::Dispatched, $order->fresh()->status);
        Notification::assertSentOnDemandTimes(OrderDispatched::class, 1);
    }

    public function test_delivered_completes_the_order_and_stamps_delivered_at(): void
    {
        $order = $this->bookedOrder();
        Notification::fake();

        $this->scan(['shipment_status_id' => 42])->assertOk();
        $this->scan(['shipment_status_id' => 7, 'shipment_status' => 'DELIVERED', 'current_timestamp' => '14 10 2026 10:15:00'])->assertOk();

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertSame('2026-10-14 10:15:00', $order->delivered_at->format('Y-m-d H:i:s'));
        $this->assertNotNull($order->completed_at);
        $this->assertSame('Delivered', $order->shipment_status);
        Notification::assertSentOnDemandTimes(OrderDispatched::class, 1);

        // The returns window counts from the courier's delivery.
        $this->assertSame('2026-10-14', ReturnPolicy::deadline($order)->copy()->subDays(Fulfilment::returnDays())->toDateString());
    }

    public function test_an_earlier_status_never_moves_an_order_backwards(): void
    {
        $order = $this->bookedOrder();

        $this->scan(['shipment_status_id' => 7])->assertOk();
        $this->assertSame(OrderStatus::Completed, $order->fresh()->status);

        // Late and repeated scans, in the wrong order.
        foreach ([42, 18, 17, 3, 9] as $id) {
            $this->scan(['shipment_status_id' => $id])->assertOk();
        }

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertSame(7, $order->shipment_status_id);
        $this->assertNull($order->shipment_problem);
    }

    public function test_an_order_already_further_on_is_not_dragged_back(): void
    {
        $order = $this->bookedOrder();
        $order->moveTo(OrderStatus::Completed);

        $this->scan(['shipment_status_id' => 42])->assertOk();

        $this->assertSame(OrderStatus::Completed, $order->fresh()->status);

        $cancelled = $this->bookedOrder();
        $cancelled->moveTo(OrderStatus::RefundRequested);
        Order::query()->whereKey($cancelled->id)->update(['shipment_order_id' => '777', 'tracking_number' => 'AWB777']);
        $this->scan(['shipment_status_id' => 42, 'sr_order_id' => 777, 'awb' => 'AWB777'])->assertOk();
        $this->assertSame(OrderStatus::RefundRequested, $cancelled->fresh()->status);
    }

    public function test_a_return_to_origin_leaves_a_note_and_a_dashboard_figure_and_changes_no_status(): void
    {
        $order = $this->bookedOrder();
        $this->scan(['shipment_status_id' => 42])->assertOk();

        $this->scan(['shipment_status_id' => 9, 'shipment_status' => 'RTO INITIATED'])->assertOk();

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Dispatched, $order->status);
        $this->assertSame('returning', $order->shipment_problem);
        $this->assertStringContainsString('coming back', $order->history()->reorder('id', 'desc')->value('note'));

        $this->srAs(RoleEnum::StoreManager)->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()->assertJsonPath('data.attention.shipments_in_trouble', 1);
        $this->srAs(RoleEnum::StoreManager)->getJson('/api/v1/admin/store/orders?shipment=problem')
            ->assertOk()->assertJsonCount(1, 'data');

        $this->scan(['shipment_status_id' => 10, 'shipment_status' => 'RTO DELIVERED'])->assertOk();
        $this->assertSame('returned', $order->fresh()->shipment_problem);
        $this->assertSame(OrderStatus::Dispatched, $order->fresh()->status);

        // The customer's own read says nothing of a parcel in trouble.
        $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")
            ->assertOk()->assertJsonPath('data.shipment_status', null);

        // And a returned parcel can be booked again.
        $this->srAs(RoleEnum::StoreManager)->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertJsonPath('data.shipment.can_book', true);
    }

    public function test_a_courier_cancellation_is_a_note_not_a_status(): void
    {
        $order = $this->bookedOrder();

        $this->scan(['shipment_status_id' => 8, 'shipment_status' => 'CANCELED'])->assertOk();

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Paid, $order->status);
        $this->assertSame('cancelled', $order->shipment_problem);
    }

    public function test_the_order_is_found_by_awb_when_the_id_is_not_ours_and_a_return_leg_is_ignored(): void
    {
        $order = $this->bookedOrder();

        $this->scan(['sr_order_id' => null, 'order_id' => 'something-else', 'is_return' => 1])->assertOk();
        $this->assertNull($order->fresh()->shipment_status_id, 'The return leg is another parcel.');

        $this->scan(['sr_order_id' => null, 'order_id' => 'something-else'])->assertOk();
        $this->assertSame(42, $order->fresh()->shipment_status_id, 'Matched on the AWB.');

        $this->scan(['sr_order_id' => 999, 'awb' => 'nobody'])->assertOk();
        $this->scan(['shipment_status_id' => 'x'])->assertOk();
        $this->scan(['shipment_status_id' => 9999])->assertOk();
        $this->assertSame(42, $order->fresh()->shipment_status_id, 'An unplaceable id changes nothing.');
    }

    public function test_the_webhook_is_inert_on_a_manual_install(): void
    {
        $order = $this->bookedOrder();
        Setting::put('store_courier_provider', 'manual');

        $this->scan()->assertOk();

        $this->assertNull($order->fresh()->shipment_status_id);
    }

    /* ------------------------------------------------------------ tracker */

    public function test_the_tracker_follows_parcels_and_never_throws(): void
    {
        $order = $this->bookedOrder();
        $untracked = $this->paidOrder();
        Notification::fake();

        $this->assertSame(0, Artisan::call('technoware:track-shipments'));

        $this->assertCount(1, $this->srCalled('GET', '/courier/track/awb/321055706540'));
        $this->assertSame(OrderStatus::Dispatched, $order->fresh()->status);
        $this->assertSame(18, $order->fresh()->shipment_status_id);
        $this->assertNotNull($order->fresh()->shipment_checked_at);
        $this->assertNull($untracked->fresh()->shipment_checked_at, 'An unbooked order is never asked about.');
        Notification::assertSentOnDemandTimes(OrderDispatched::class, 1);

        // Delivered.
        $this->srAnswers['GET /courier/track/awb/{awb}'] = [['tracking_data' => [
            'track_status' => 1, 'shipment_status' => 7,
            'shipment_track' => [['current_status' => 'Delivered', 'delivered_date' => '2026-10-14 10:15:00']],
        ]], 200];
        $this->assertSame(0, Artisan::call('technoware:track-shipments'));

        $order = $order->fresh();
        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertSame('2026-10-14 10:15:00', $order->delivered_at->format('Y-m-d H:i:s'));

        // A delivered parcel is no longer asked about.
        $before = count($this->srCalled('GET', '/courier/track/awb/321055706540'));
        Artisan::call('technoware:track-shipments');
        $this->assertCount($before, $this->srCalled('GET', '/courier/track/awb/321055706540'));
    }

    public function test_the_tracker_treats_no_scans_as_nothing_and_a_refusal_as_a_banner(): void
    {
        $order = $this->bookedOrder();

        $this->srAnswers['GET /courier/track/awb/{awb}'] = [['tracking_data' => ['track_status' => 0, 'error' => 'There is no activities found.']], 200];
        $this->assertSame(0, Artisan::call('technoware:track-shipments'));
        $this->assertNull($order->fresh()->shipment_status_id);
        $this->assertNull(Setting::get('shiprocket_error'));

        $this->srAnswers['GET /courier/track/awb/{awb}'] = [['message' => 'Too Many Attempts.'], 429];
        $this->assertSame(0, Artisan::call('technoware:track-shipments'), 'Exit 0 whatever Shiprocket says.');
        $this->assertSame('Too Many Attempts.', Setting::get('shiprocket_error'));
    }

    public function test_the_tracker_asks_the_longest_unchecked_first_and_at_most_its_limit(): void
    {
        $first = $this->bookedOrder();
        Order::query()->whereKey($first->id)->update(['shipment_checked_at' => now()->subHour(), 'tracking_number' => 'AWB-OLD']);
        $second = $this->bookedOrder();
        Order::query()->whereKey($second->id)->update(['shipment_checked_at' => now()->subMinutes(5), 'tracking_number' => 'AWB-NEW']);
        $never = $this->bookedOrder();
        Order::query()->whereKey($never->id)->update(['shipment_checked_at' => null, 'tracking_number' => 'AWB-NEVER']);

        Artisan::call('technoware:track-shipments', ['--limit' => 2]);

        $asked = array_map(fn ($c) => basename($c['path']), array_filter($this->srCalls, fn ($c) => str_starts_with($c['path'], '/courier/track/awb/')));
        $this->assertSame(['AWB-NEVER', 'AWB-OLD'], array_values($asked));
    }

    public function test_the_tracker_does_nothing_on_a_manual_install(): void
    {
        $this->bookedOrder();
        $calls = count($this->srCalls);
        Setting::put('store_courier_provider', 'manual');

        $this->assertSame(0, Artisan::call('technoware:track-shipments'));
        $this->assertCount($calls, $this->srCalls);
    }

    public function test_the_tracker_is_scheduled_every_thirty_minutes(): void
    {
        $event = collect(app(Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'technoware:track-shipments'));

        $this->assertNotNull($event);
        $this->assertSame('*/30 * * * *', $event->expression);
    }

    /* -------------------------------------------------- settings and roles */

    public function test_roles_a_store_manager_books_and_an_administrator_connects(): void
    {
        $order = $this->paidOrder();

        $this->srAs(RoleEnum::ContentManager)->postJson($this->bookUrl($order))->assertForbidden();
        $this->srAs(RoleEnum::StoreManager)->postJson($this->bookUrl($order))->assertOk();

        $this->srAs(RoleEnum::StoreManager)->getJson('/api/v1/admin/settings/shiprocket')->assertForbidden();
        $this->srAs(RoleEnum::StoreManager)->postJson('/api/v1/admin/settings/shiprocket/test')->assertForbidden();
        $this->srAs(RoleEnum::StoreManager)->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'store_courier_provider', 'value' => 'manual']],
        ])->assertForbidden();

        $this->srAs(RoleEnum::Admin)->getJson('/api/v1/admin/settings/shiprocket')->assertOk()
            ->assertJsonPath('data.active', true)->assertJsonPath('data.locations.0.name', 'Warehouse')
            ->assertJsonPath('data.webhook_token_set', true)
            ->assertJsonMissingPath('data.password');
    }

    public function test_the_connection_test_only_signs_in_and_lists_pickup_locations(): void
    {
        $this->srAs(RoleEnum::Admin)->postJson('/api/v1/admin/settings/shiprocket/test')->assertOk()
            ->assertJsonPath('data.pickup_location_found', true)
            ->assertJsonCount(2, 'data.locations');

        $this->assertSame(['POST /auth/login', 'GET /settings/company/pickup'], array_map(fn ($c) => $c['method'].' '.$c['path'], $this->srCalls));

        Setting::put('shiprocket_pickup_location', 'Gone');
        $this->srAs(RoleEnum::Admin)->postJson('/api/v1/admin/settings/shiprocket/test')->assertOk()
            ->assertJsonPath('data.pickup_location_found', false);
    }

    public function test_credentials_are_secret_and_the_choices_are_checked(): void
    {
        $admin = fn () => $this->srAs(RoleEnum::Admin);

        $rows = collect($admin()->getJson('/api/v1/admin/settings')->assertOk()->json('data.shiprocket'))->keyBy('key');
        $this->assertNull($rows['shiprocket_password']['value']);
        $this->assertNull($rows['shiprocket_webhook_token']['value']);
        $this->assertTrue($rows['shiprocket_password']['is_secret']);
        $this->assertSame('shiprocket', $rows['store_courier_provider']['value']);
        $this->assertSame(['manual', 'shiprocket'], array_column($rows['store_courier_provider']['options'], 'value'));

        // A blank password is "unchanged".
        $admin()->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'shiprocket_password', 'value' => '']]])->assertOk();
        $this->assertSame('api-password', Setting::get('shiprocket_password'));

        foreach ([
            ['store_courier_provider', 'dhl'],
            ['shiprocket_email', 'not an email'],
            ['shiprocket_webhook_token', 'short'],
            ['shiprocket_parcel_length', '0'],
            ['shiprocket_parcel_height', '12.5'],
        ] as [$key, $value]) {
            $admin()->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $value]]])->assertStatus(422);
        }

        $admin()->patchJson('/api/v1/admin/settings', ['settings' => [
            ['key' => 'shiprocket_parcel_length', 'value' => '40'],
            ['key' => 'shiprocket_webhook_token', 'value' => 'another-long-shared-token'],
        ]])->assertOk();
        $this->assertSame(40, CourierSettings::parcel()['length']);

        // None of it is on the public settings map.
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        foreach (['shiprocket_email', 'shiprocket_password', 'shiprocket_webhook_token', 'store_courier_provider'] as $key) {
            $this->assertArrayNotHasKey($key, $public);
        }
    }

    public function test_the_customer_sees_the_live_status_only_while_it_goes_well(): void
    {
        $order = $this->bookedOrder();
        $this->scan(['shipment_status_id' => 17, 'shipment_status' => 'OUT FOR DELIVERY'])->assertOk();

        $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")
            ->assertOk()->assertJsonPath('data.shipment_status', 'Out for delivery')->assertJsonPath('data.delivered_at', null);

        $this->scan(['shipment_status_id' => 7])->assertOk();

        $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")
            ->assertOk()->assertJsonPath('data.shipment_status', 'Delivered')->assertJsonStructure(['data' => ['delivered_at']]);
    }
}
