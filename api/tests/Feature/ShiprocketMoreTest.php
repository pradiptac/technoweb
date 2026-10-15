<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ReturnStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\OrderReturn;
use App\Models\Setting;
use App\Support\Store\Returns\ReturnPickups;
use App\Support\Store\Shipping\Shipments;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\Support\FakesShiprocket;
use Tests\TestCase;

/**
 * Rate quotes, manifests and return pickups through Shiprocket (0.159.0,
 * docs/store.md "Shiprocket"). **Shiprocket is never reached**: the whole
 * service is `FakesShiprocket` under `Http::preventStrayRequests()`.
 *
 *   1. A quote reads the pickup location's PIN and the delivery PIN, and its
 *      money is exact paise; a 200 with an error body is a refusal.
 *   2. A manifest exists only after an AWB and a requested pickup; "already
 *      generated" is success; a bulk one reports who was left out and why.
 *   3. A return pickup is booked once; its roles are the customer (where the
 *      courier collects) and the seller (where it goes); a refusal is
 *      resumed, not re-created.
 *   4. A scan with `is_return: 1` moves the pickup's status and nothing
 *      else — never the return's own status, never the order.
 */
class ShiprocketMoreTest extends TestCase
{
    use FakesShiprocket;
    use RefreshDatabase;

    private const WEBHOOK = '/api/v1/store/shipping/webhooks/courier';

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpShiprocket();
    }

    private function url(Order $order, string $action): string
    {
        return "/api/v1/admin/store/orders/{$order->order_number}/shipment/{$action}";
    }

    private function returnUrl(OrderReturn $return, string $action): string
    {
        return "/api/v1/admin/store/returns/{$return->reference}/pickup/{$action}";
    }

    /** A booked parcel with its pickup requested: ready for a manifest. */
    private function readyOrder(): Order
    {
        return Shipments::pickup($this->bookedOrder());
    }

    /** An approved return of both switches on a delivered order. */
    private function approvedReturn(array $overrides = []): OrderReturn
    {
        $order = $this->paidOrder();
        $order->forceFill(['status' => OrderStatus::Completed, 'completed_at' => now(), 'dispatched_at' => now()])->save();

        $return = OrderReturn::create(array_replace([
            'order_id' => $order->id, 'reason' => 'damaged', 'status' => ReturnStatus::Approved,
            'approved_at' => now(),
        ], $overrides));
        $return->items()->create(['order_item_id' => $order->items->first()->id, 'quantity' => 2]);

        return $return->fresh(['order', 'items.orderItem']);
    }

    private function returnScan(array $overrides = [])
    {
        return $this->withHeaders(['x-api-key' => 'a-long-shared-secret-token'])->postJson(self::WEBHOOK, array_replace([
            'awb' => '999000111222', 'shipment_status_id' => 42, 'sr_order_id' => 17171717, 'is_return' => 1,
        ], $overrides));
    }

    // ---- Rate quotes --------------------------------------------------------

    public function test_a_quote_lists_couriers_with_exact_paise_and_asks_with_the_right_pins(): void
    {
        $order = $this->paidOrder();

        $res = $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'rates'))->assertOk();

        $this->assertSame([
            ['courier_id' => 43, 'name' => 'Delhivery Surface', 'rate_paise' => 5400, 'cod_charges_paise' => 0, 'etd' => 'Oct 16, 2026', 'days' => 4, 'rating' => 4.9, 'recommended' => true],
            ['courier_id' => 10, 'name' => 'Delhivery Air', 'rate_paise' => 11250, 'cod_charges_paise' => 3510, 'etd' => 'Oct 14, 2026', 'days' => 2, 'rating' => 4.4, 'recommended' => false],
        ], $res->json('data'));

        [$call] = $this->srCalled('GET', '/courier/serviceability/');
        // From the pickup location's PIN to the delivery PIN; the parcel's weight as kilograms.
        $this->assertSame('700001', (string) $call['query']['pickup_postcode']);
        $this->assertSame('700016', (string) $call['query']['delivery_postcode']);
        $this->assertSame('1.750', $call['query']['weight']);
        $this->assertSame('0', (string) $call['query']['cod']);
        $this->assertSame('20000', (string) $call['query']['declared_value']);
        $this->assertArrayNotHasKey('is_return', $call['query']);
        // A quote books nothing.
        $this->assertSame([], $this->srCalled('POST', '/orders/create/adhoc'));
    }

    public function test_a_cash_on_delivery_parcel_is_quoted_as_cod(): void
    {
        $order = $this->codOrder();

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'rates'))->assertOk();

        $this->assertSame('1', (string) $this->srCalled('GET', '/courier/serviceability/')[0]['query']['cod']);
    }

    public function test_a_200_with_an_error_body_is_a_refusal_in_shiprocket_s_words(): void
    {
        $this->srAnswers['GET /courier/serviceability/'] = [['status' => 404, 'message' => 'Delivery postcode not serviceable'], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($this->paidOrder(), 'rates'))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Delivery postcode not serviceable');

        $this->assertSame('Delivery postcode not serviceable', Setting::get('shiprocket_error'));
    }

    public function test_an_empty_courier_list_is_a_refusal_too(): void
    {
        $this->srAnswers['GET /courier/serviceability/'] = [['status' => 200, 'data' => ['available_courier_companies' => []]], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($this->paidOrder(), 'rates'))->assertStatus(422);
    }

    public function test_quotes_need_the_store_manager_and_nothing_is_asked_while_the_provider_is_manual(): void
    {
        $order = $this->paidOrder();

        $this->srAs(RoleEnum::ContentManager)->postJson($this->url($order, 'rates'))->assertForbidden();

        Setting::put('store_courier_provider', 'manual');
        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'rates'))->assertStatus(422);

        $this->assertSame([], $this->srCalls);
    }

    // ---- Manifests -----------------------------------------------------------

    public function test_a_manifest_needs_an_awb_and_a_requested_pickup(): void
    {
        $order = $this->bookedOrder();
        $this->assertNotNull($order->shipment_awb_at);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'manifest'))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Request the pickup before making the manifest.');

        $this->assertSame([], $this->srCalled('POST', '/manifests/generate'));
        $this->assertSame([], $this->srCalled('POST', '/manifests/print'));
    }

    public function test_a_manifest_is_generated_then_printed_and_kept_on_the_order(): void
    {
        $order = $this->readyOrder();

        $res = $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'manifest'))->assertOk();

        $this->assertSame([15151515], $this->srCalled('POST', '/manifests/generate')[0]['body']['shipment_id']);
        // Print wants Shiprocket's order ids, not shipment ids.
        $this->assertSame([16161616], $this->srCalled('POST', '/manifests/print')[0]['body']['order_ids']);
        $res->assertJsonPath('data.shipment.manifest_url', 'https://manifests.example.test/MANIFEST-3051-print.pdf')
            ->assertJsonPath('data.shipment.can_manifest', true);
        $this->assertNotNull($order->fresh()->shipment_manifest_at);
    }

    public function test_already_generated_is_success(): void
    {
        $order = $this->readyOrder();
        $this->srAnswers['POST /manifests/generate'] = [[
            'message' => 'Manifest already generated for some shipment_ids', 'status_code' => 400, 'already_manifested_shipment_ids' => [15151515],
        ], 400];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'manifest'))->assertOk();

        $this->assertSame('https://manifests.example.test/MANIFEST-3051-print.pdf', $order->fresh()->shipment_manifest_url);
        $this->assertCount(1, $this->srCalled('POST', '/manifests/generate'));
    }

    public function test_an_empty_manifest_url_is_a_refusal(): void
    {
        $order = $this->readyOrder();
        $this->srAnswers['POST /manifests/generate'] = [['status' => 1, 'manifest_url' => ''], 200];

        $this->srAs(RoleEnum::StoreManager)->postJson($this->url($order, 'manifest'))->assertStatus(422);

        $this->assertNull($order->fresh()->shipment_manifest_url);
    }

    public function test_the_bulk_manifest_includes_the_ready_ones_and_names_who_was_left_out(): void
    {
        $ready = $this->readyOrder();
        $notYet = $this->bookedOrder();

        $res = $this->srAs(RoleEnum::StoreManager)->postJson('/api/v1/admin/store/orders/manifest', [
            'numbers' => [$ready->order_number, $notYet->order_number, 'ORD-NOPE'],
        ])->assertOk();

        $this->assertSame('https://manifests.example.test/MANIFEST-3051-print.pdf', $res->json('url'));
        $this->assertSame([$ready->order_number], $res->json('included'));
        $this->assertEqualsCanonicalizing([
            ['number' => $notYet->order_number, 'message' => 'Request the pickup before making the manifest.'],
            ['number' => 'ORD-NOPE', 'message' => 'No such order.'],
        ], $res->json('refused'));
        // One manifest, not one per order.
        $this->assertCount(1, $this->srCalled('POST', '/manifests/print'));
        $this->assertNull($notYet->fresh()->shipment_manifest_url);
    }

    public function test_a_bulk_manifest_with_nothing_ready_is_refused_and_roles_are_enforced(): void
    {
        $notYet = $this->bookedOrder();

        $this->srAs(RoleEnum::StoreManager)->postJson('/api/v1/admin/store/orders/manifest', ['numbers' => [$notYet->order_number]])
            ->assertStatus(422);
        $this->srAs(RoleEnum::ContentManager)->postJson('/api/v1/admin/store/orders/manifest', ['numbers' => [$notYet->order_number]])
            ->assertForbidden();
        $this->srAs(RoleEnum::StoreManager)->postJson('/api/v1/admin/store/orders/manifest', ['numbers' => []])
            ->assertStatus(422);

        $this->assertSame([], $this->srCalled('POST', '/manifests/generate'));
    }

    // ---- Return pickups ------------------------------------------------------

    public function test_booking_a_return_pickup_swaps_the_roles_and_runs_the_three_steps(): void
    {
        $return = $this->approvedReturn();

        $res = $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($return, 'book'), ['courier_id' => 43])->assertOk();

        [$create] = $this->srCalled('POST', '/orders/create/return');
        $body = $create['body'];
        // The reference is the return's own.
        $this->assertSame($return->reference, $body['order_id']);
        // pickup_* is the customer; shipping_* is the seller (the pickup location).
        $this->assertSame('Priya Das', $body['pickup_customer_name']);
        $this->assertSame('1 Park Street', $body['pickup_address']);
        $this->assertSame('Floor 2', $body['pickup_address_2']);
        $this->assertSame(700016, $body['pickup_pincode']);
        $this->assertSame('West Bengal', $body['pickup_state']);
        $this->assertSame('priya@acme.co.in', $body['pickup_email']);
        $this->assertSame(9800000000, $body['pickup_phone']);
        $this->assertSame('Stores Desk', $body['shipping_customer_name']);
        $this->assertSame('12 Industrial Road', $body['shipping_address']);
        $this->assertSame(700001, $body['shipping_pincode']);
        $this->assertSame(9830000001, $body['shipping_phone']);
        $this->assertSame('stores@technoware.test', $body['shipping_email']);
        // The lines, at the price the order sold them for, in rupees.
        $this->assertSame([['name' => 'Aruba 2930F switch — 24 port', 'sku' => 'JL253A', 'units' => 2, 'selling_price' => 10000]], $body['order_items']);
        $this->assertSame('PREPAID', $body['payment_method']);
        $this->assertSame(20000, $body['sub_total']);
        $this->assertSame('2026-10-12', $body['order_date']);

        // The AWB is for the return leg, then the pickup is asked for on the shipment id.
        $this->assertSame(['shipment_id' => 18181818, 'courier_id' => 43, 'is_return' => 1], $this->srCalled('POST', '/courier/assign/awb')[0]['body']);
        $this->assertSame([18181818], $this->srCalled('POST', '/courier/generate/pickup')[0]['body']['shipment_id']);

        $res->assertJsonPath('data.pickup.booking', 'created')
            ->assertJsonPath('data.pickup.awb', '999000111222')
            ->assertJsonPath('data.pickup.courier', 'Delhivery Reverse')
            ->assertJsonPath('data.pickup.can_book', false)
            ->assertJsonPath('data.pickup.can_cancel', true)
            // Receive stays a person's tick.
            ->assertJsonPath('data.status', 'approved');
    }

    public function test_a_second_press_creates_nothing(): void
    {
        $return = $this->approvedReturn();
        $admin = $this->srAs(RoleEnum::StoreManager);

        $admin->postJson($this->returnUrl($return, 'book'))->assertOk();
        $admin->postJson($this->returnUrl($return, 'book'))->assertStatus(422)->assertJsonPath('message', 'A pickup is already booked for this return.');

        $this->assertCount(1, $this->srCalled('POST', '/orders/create/return'));
    }

    public function test_a_booking_in_flight_cannot_be_claimed_again(): void
    {
        $return = $this->approvedReturn();
        OrderReturn::whereKey($return->id)->update(['pickup_booking' => 'creating', 'pickup_claimed_at' => now()]);

        $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($return, 'book'))->assertStatus(422);

        $this->assertSame([], $this->srCalled('POST', '/orders/create/return'));
    }

    public function test_a_refused_courier_is_kept_and_the_booking_is_carried_on_without_a_second_order(): void
    {
        $return = $this->approvedReturn();
        $admin = $this->srAs(RoleEnum::StoreManager);
        $this->srAnswers['POST /courier/assign/awb'] = [['awb_assign_status' => 0, 'message' => 'Insufficient wallet balance'], 200];

        $admin->postJson($this->returnUrl($return, 'book'))->assertOk()
            ->assertJsonPath('data.pickup.booking', 'created')
            ->assertJsonPath('data.pickup.error', 'Insufficient wallet balance')
            ->assertJsonPath('data.pickup.resume', true)
            ->assertJsonPath('data.pickup.can_book', true);
        $this->assertSame([], $this->srCalled('POST', '/courier/generate/pickup'));

        unset($this->srAnswers['POST /courier/assign/awb']);
        $admin->postJson($this->returnUrl($return, 'book'))->assertOk()
            ->assertJsonPath('data.pickup.error', null)
            ->assertJsonPath('data.pickup.awb', '999000111222')
            ->assertJsonPath('data.pickup.resume', false);

        $this->assertCount(1, $this->srCalled('POST', '/orders/create/return'));
        $this->assertCount(1, $this->srCalled('POST', '/courier/generate/pickup'));
    }

    public function test_a_refused_pickup_request_resumes_at_the_pickup_step(): void
    {
        $return = $this->approvedReturn();
        $admin = $this->srAs(RoleEnum::StoreManager);
        $this->srAnswers['POST /courier/generate/pickup'] = [['message' => 'Invalid shipment id', 'status_code' => 400], 400];

        $admin->postJson($this->returnUrl($return, 'book'))->assertOk()->assertJsonPath('data.pickup.error', 'Invalid shipment id');

        unset($this->srAnswers['POST /courier/generate/pickup']);
        $admin->postJson($this->returnUrl($return, 'book'))->assertOk()->assertJsonPath('data.pickup.error', null);

        // The AWB was not assigned a second time.
        $this->assertCount(1, $this->srCalled('POST', '/courier/assign/awb'));
        $this->assertCount(2, $this->srCalled('POST', '/courier/generate/pickup'));
    }

    public function test_a_failed_order_creation_can_be_booked_again_under_a_new_reference(): void
    {
        $return = $this->approvedReturn();
        $admin = $this->srAs(RoleEnum::StoreManager);
        $this->srAnswers['POST /orders/create/return'] = [['message' => 'Oops! Invalid Data.', 'errors' => ['pickup_pincode' => ['The pickup pincode is invalid.']], 'status_code' => 422], 422];

        $admin->postJson($this->returnUrl($return, 'book'))->assertStatus(422);
        $this->assertSame('failed', $return->fresh()->pickup_booking);

        unset($this->srAnswers['POST /orders/create/return']);
        $admin->postJson($this->returnUrl($return, 'book'))->assertOk();

        $this->assertSame($return->reference.'-2', $this->srCalled('POST', '/orders/create/return')[1]['body']['order_id']);
    }

    public function test_only_an_approved_return_is_booked_and_nothing_is_asked_while_manual(): void
    {
        $requested = $this->approvedReturn(['status' => ReturnStatus::Requested]);
        $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($requested, 'book'))->assertStatus(422);

        $approved = $this->approvedReturn();
        Setting::put('store_courier_provider', 'manual');
        $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($approved, 'book'))->assertStatus(422);
        $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($approved, 'rates'))->assertStatus(422);

        $this->assertSame([], $this->srCalls);
        $this->srAs(RoleEnum::StoreManager)->getJson("/api/v1/admin/store/returns/{$approved->reference}")->assertOk()->assertJsonPath('data.pickup', null);
    }

    public function test_a_return_quote_runs_customer_to_seller_as_a_return(): void
    {
        $return = $this->approvedReturn();

        $this->srAs(RoleEnum::StoreManager)->postJson($this->returnUrl($return, 'rates'))->assertOk()
            ->assertJsonPath('data.0.rate_paise', 5400)
            ->assertJsonPath('meta.pickup_pin', '700016')
            ->assertJsonPath('meta.delivery_pin', '700001');

        $query = $this->srCalled('GET', '/courier/serviceability/')[0]['query'];
        $this->assertSame('1', (string) $query['is_return']);
        $this->assertSame('700016', (string) $query['pickup_postcode']);
        $this->assertSame('20000', (string) $query['declared_value']);
    }

    public function test_cancelling_a_pickup_frees_the_return_to_be_booked_again(): void
    {
        $return = $this->approvedReturn();
        $admin = $this->srAs(RoleEnum::StoreManager);
        $admin->postJson($this->returnUrl($return, 'book'))->assertOk();

        $admin->postJson($this->returnUrl($return, 'cancel'))->assertOk()->assertJsonPath('data.pickup.booking', 'cancelled');

        $this->assertSame(['awbs' => ['999000111222']], $this->srCalled('POST', '/orders/cancel/shipment/awbs')[0]['body']);
        $this->assertSame(['ids' => [17171717]], $this->srCalled('POST', '/orders/cancel')[0]['body']);
        $admin->postJson($this->returnUrl($return, 'cancel'))->assertStatus(422);
        $admin->postJson($this->returnUrl($return, 'book'))->assertOk();
    }

    public function test_the_pickup_endpoints_need_the_store_manager(): void
    {
        $return = $this->approvedReturn();

        foreach (['rates', 'book', 'cancel'] as $action) {
            $this->srAs(RoleEnum::ContentManager)->postJson($this->returnUrl($return, $action))->assertForbidden();
        }

        $this->assertSame([], $this->srCalls);
    }

    // ---- The webhook and the tracker ------------------------------------------

    private function bookedReturn(): OrderReturn
    {
        $return = $this->approvedReturn();

        return ReturnPickups::book($return, $this->srStaff(RoleEnum::StoreManager));
    }

    public function test_a_return_scan_moves_the_pickup_and_never_the_return_or_the_order(): void
    {
        $return = $this->bookedReturn();
        $order = $return->order->fresh();
        $orderStatus = $order->status;

        $this->returnScan(['shipment_status_id' => 42])->assertOk();

        $fresh = $return->fresh();
        $this->assertSame(42, $fresh->pickup_status_id);
        $this->assertSame('Picked up', $fresh->pickup_status);
        // The return is Received by a person, not by a courier scan.
        $this->assertSame(ReturnStatus::Approved, $fresh->status);
        $this->assertNull($fresh->received_at);
        // Neither the order's status nor its forward shipment moves.
        $this->assertSame($orderStatus, $order->fresh()->status);
        $this->assertNull($order->fresh()->shipment_status_id);

        // Delivered at the seller is still only the pickup's status.
        $this->returnScan(['shipment_status_id' => 7])->assertOk();
        $this->assertSame(7, $return->fresh()->pickup_status_id);
        $this->assertSame(ReturnStatus::Approved, $return->fresh()->status);
        $this->assertNull($order->fresh()->delivered_at);
    }

    public function test_a_return_scan_is_monotonic_matches_by_awb_and_needs_the_token(): void
    {
        $return = $this->bookedReturn();

        $this->returnScan(['shipment_status_id' => 18])->assertOk();
        $this->returnScan(['shipment_status_id' => 42])->assertOk();
        $this->assertSame(18, $return->fresh()->pickup_status_id);

        // No sr_order_id: the AWB finds it.
        $this->returnScan(['sr_order_id' => null, 'shipment_status_id' => 17])->assertOk();
        $this->assertSame(17, $return->fresh()->pickup_status_id);

        $this->withHeaders(['x-api-key' => 'wrong-token-wrong-token'])->postJson(self::WEBHOOK, [
            'awb' => '999000111222', 'shipment_status_id' => 7, 'is_return' => 1,
        ])->assertOk();
        $this->assertSame(17, $return->fresh()->pickup_status_id);
    }

    public function test_a_return_scan_never_reaches_a_forward_parcel(): void
    {
        $forward = $this->bookedOrder();
        $return = $this->approvedReturn();
        ReturnPickups::book($return, $this->srStaff(RoleEnum::StoreManager));

        // The forward parcel's own ids on a return scan: the forward order stays put.
        $this->returnScan(['sr_order_id' => 16161616, 'awb' => '321055706540', 'shipment_status_id' => 7])->assertOk();

        $this->assertNull($forward->fresh()->shipment_status_id);
        $this->assertNull($return->fresh()->pickup_status_id);
    }

    public function test_the_courier_cancelling_a_pickup_lets_the_return_be_booked_again(): void
    {
        $return = $this->bookedReturn();

        $this->returnScan(['shipment_status_id' => 8])->assertOk();

        $this->assertSame('cancelled', $return->fresh()->pickup_booking);
        $this->assertTrue(ReturnPickups::canBook($return->fresh(['order', 'items.orderItem'])));
    }

    public function test_the_tracker_follows_open_return_pickups(): void
    {
        $return = $this->bookedReturn();

        Artisan::call('technoware:track-shipments');

        $this->assertCount(1, $this->srCalled('GET', '/courier/track/awb/999000111222'));
        $this->assertSame('In transit', $return->fresh()->pickup_status);
        $this->assertSame(ReturnStatus::Approved, $return->fresh()->status);

        // Settled pickups are not asked about again.
        OrderReturn::whereKey($return->id)->update(['pickup_status_id' => 7]);
        Artisan::call('technoware:track-shipments');
        $this->assertCount(1, $this->srCalled('GET', '/courier/track/awb/999000111222'));
    }

    public function test_the_customer_sees_the_pickup_label_and_nothing_more(): void
    {
        $return = $this->bookedReturn();
        $this->returnScan(['shipment_status_id' => 42])->assertOk();
        $order = $return->order;

        $json = $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")->assertOk()->json('data.returns.0');

        $this->assertSame('Picked up', $json['pickup_status']);
        foreach (['pickup', 'pickup_error', 'pickup_awb', 'pickup_sr_order_id', 'staff_note'] as $key) {
            $this->assertArrayNotHasKey($key, $json);
        }
    }
}
