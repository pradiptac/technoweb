<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Store\Zoho\IndianStates;
use App\Support\Store\Zoho\ZohoInvoices;
use App\Support\Store\Zoho\ZohoSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Zoho Books invoices (docs/store.md "Zoho Books invoices").
 *
 * What the feature rests on, each asserted on its own:
 *
 *   1. **An invoice is made at the right moment, once.** Dispatch for an
 *      order with something in a box, payment for one without; never twice,
 *      whether the second attempt is a retry, a sweep or a crash recovered
 *      from.
 *   2. **It says what was sold.** The lines, the inclusive prices, the tax
 *      that fits where the goods are going, the buyer's GSTIN, a coupon.
 *   3. **Zoho failing never fails the shop.** A dispatch is saved whatever
 *      Zoho answers; the reason is on the order and the attempt comes round
 *      again.
 *   4. **Off means untouched.** With the switch off, or the setup unfinished,
 *      no order is marked and Zoho is asked nothing.
 *
 * Zoho is one `Http::fake()` router: every call is recorded in `$calls`, and
 * a test changes what a route answers through `$answers`.
 */
class ZohoBooksTest extends TestCase
{
    use RefreshDatabase;

    private const INTRA = '460000000017001';

    private const INTER = '460000000017002';

    /** @var list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>}> */
    private array $calls = [];

    /** @var array<string, array{0: array<string, mixed>|string, 1?: int}|\Closure> "METHOD /path" => answer */
    private array $answers = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-08 11:00:00', 'Asia/Kolkata'));
        Notification::fake();
        Storage::fake('local');

        Setting::put('zoho_books_enabled', '1');
        Setting::put('zoho_books_dc', 'in');
        Setting::put('zoho_books_oauth_client_id', '1000.ABCDEF');
        Setting::put('zoho_books_oauth_client_secret', 'secret');
        Setting::put('zoho_books_oauth_refresh_token', '1000.refresh');
        Setting::put('zoho_books_organization_id', '60001234567');
        Setting::put('zoho_books_home_state', 'WB');
        Setting::put('zoho_books_tax_intra', self::INTRA);
        Setting::put('zoho_books_tax_inter', self::INTER);

        Http::fake(fn (Request $request) => $this->zoho($request));
    }

    /* ------------------------------------------------------------ the fake */

    private function zoho(Request $request)
    {
        $url = parse_url($request->url());
        parse_str($url['query'] ?? '', $query);

        if (($url['host'] ?? '') === 'accounts.zoho.in') {
            $this->calls[] = ['method' => 'TOKEN', 'path' => $url['path'], 'query' => [], 'body' => $request->data()];

            return $this->answer('TOKEN', ['access_token' => 'tok-'.count($this->calls), 'expires_in' => 3600, 'refresh_token' => '1000.new-refresh']);
        }

        $path = Str::after($url['path'] ?? '', '/books/v3');
        $key = $request->method().' '.$path;
        $this->calls[] = ['method' => $request->method(), 'path' => $path, 'query' => $query, 'body' => $request->data()];

        return match (true) {
            $key === 'GET /organizations' => $this->answer($key, ['code' => 0, 'organizations' => [['organization_id' => '60001234567', 'name' => 'Technoware Pvt Ltd']]]),
            $key === 'GET /settings/taxes' => $this->answer($key, ['code' => 0, 'taxes' => [
                ['tax_id' => self::INTRA, 'tax_name' => 'GST18', 'tax_percentage' => 18, 'tax_type' => 'tax_group'],
                ['tax_id' => self::INTER, 'tax_name' => 'IGST18', 'tax_percentage' => 18, 'tax_type' => 'tax', 'tax_specific_type' => 'igst'],
            ]]),
            $key === 'GET /contacts' => $this->answer($key, ['code' => 0, 'contacts' => []]),
            $key === 'POST /contacts' => $this->answer($key, ['code' => 0, 'contact' => ['contact_id' => '7001']]),
            $key === 'GET /invoices' => $this->answer($key, ['code' => 0, 'invoices' => []]),
            $key === 'POST /invoices' => $this->answer($key, ['code' => 0, 'invoice' => [
                'invoice_id' => '9001', 'invoice_number' => 'INV-000123', 'date' => '2026-10-08', 'status' => 'draft',
                'total' => ((float) array_sum(array_map(fn ($l) => $l['rate'] * $l['quantity'], $request->data()['line_items'] ?? []))) - (float) ($request->data()['discount'] ?? 0),
            ]]),
            $key === 'POST /invoices/9001/status/sent' => $this->answer($key, ['code' => 0, 'message' => 'Invoice status has been changed to Sent.']),
            $key === 'GET /invoices/9001' => $this->answer($key, '%PDF-1.4 the invoice'),
            default => Http::response(['code' => 5, 'message' => "Invalid URL passed ({$key})"], 404),
        };
    }

    private function answer(string $key, array|string $default)
    {
        $answer = $this->answers[$key] ?? [$default];

        if ($answer instanceof \Closure) {
            $answer = $answer();
        }

        return Http::response($answer[0], $answer[1] ?? 200);
    }

    /** @return list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>}> */
    private function called(string $method, string $path): array
    {
        return array_values(array_filter($this->calls, fn ($c) => $c['method'] === $method && $c['path'] === $path));
    }

    /* ------------------------------------------------------------ helpers */

    /** An order that has been placed and not yet paid: one switch (×2), and — unless `digital` — nothing else. */
    private function order(array $overrides = [], bool $digitalOnly = false): Order
    {
        $order = Order::create(array_replace([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway',
            'subtotal_paise' => 2000000, 'discount_paise' => 0, 'taxable_paise' => 1694915, 'gst_paise' => 305085, 'total_paise' => 2000000,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in', 'customer_phone' => '9800000000',
            'billing_address' => ['line1' => '1 Park Street', 'line2' => 'Floor 2', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'shipping_address' => ['line1' => '1 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'placed_at' => now(),
        ], $overrides));

        $order->items()->create($digitalOnly
            ? ['name' => 'Central licence', 'sku' => 'LIC-1', 'type' => ProductType::Digital, 'quantity' => 2, 'unit_price_paise' => 1000000, 'line_total_paise' => 2000000]
            : ['name' => 'Aruba 2930F switch', 'variation_name' => '24 port', 'sku' => 'JL253A', 'type' => ProductType::Physical, 'quantity' => 2, 'unit_price_paise' => 1000000, 'line_total_paise' => 2000000]);

        return $order->fresh();
    }

    private function dispatched(array $overrides = []): Order
    {
        $order = $this->order($overrides);
        $order->moveTo(OrderStatus::Paid);
        $order->moveTo(OrderStatus::Dispatched);

        return $order->fresh();
    }

    private function staff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function as(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$this->staff($role)->createToken('admin')->plainTextToken);
    }

    /* ------------------------------------------------- when, and only once */

    public function test_dispatching_an_order_makes_its_invoice_and_attaches_the_pdf(): void
    {
        $order = $this->dispatched();

        $this->assertSame('created', $order->zoho_status);
        $this->assertSame('9001', $order->zoho_invoice_id);
        $this->assertSame('INV-000123', $order->invoice_number);
        $this->assertSame('2026-10-08', $order->invoice_date->toDateString());
        $this->assertNull($order->zoho_error);

        // The PDF is where an uploaded invoice has always been, so the
        // customer's order page and the console's download need no change.
        Storage::disk('local')->assertExists($order->invoice_path);
        $this->assertStringStartsWith('%PDF', Storage::disk('local')->get($order->invoice_path));

        $this->assertCount(1, $this->called('POST', '/invoices'));
        $this->assertCount(1, $this->called('POST', '/invoices/9001/status/sent'));
        $this->assertSame('pdf', $this->called('GET', '/invoices/9001')[0]['query']['accept']);
        $this->assertTrue($order->history()->where('note', 'like', 'Zoho Books invoice INV-000123 created%')->exists());

        // Every call names the organisation, and carries Zoho's own kind of token.
        $this->assertSame('60001234567', $this->called('POST', '/invoices')[0]['query']['organization_id']);
        Http::assertSent(fn (Request $r) => ! str_contains($r->url(), 'zohoapis') || str_starts_with($r->header('Authorization')[0] ?? '', 'Zoho-oauthtoken '));
    }

    public function test_the_invoice_says_what_was_sold_at_the_prices_charged(): void
    {
        $this->dispatched();

        $sent = $this->called('POST', '/invoices')[0]['body'];

        $this->assertSame('7001', $sent['customer_id']);
        $this->assertStringStartsWith('ORD-', $sent['reference_number']);
        $this->assertSame('2026-10-08', $sent['date']);
        // Prices include GST here, so the rate is the price the customer saw.
        $this->assertTrue($sent['is_inclusive_tax']);
        $this->assertSame('consumer', $sent['gst_treatment']);
        $this->assertSame('WB', $sent['place_of_supply']);
        $this->assertArrayNotHasKey('discount', $sent);
        // `assertEquals`: the rate is a decimal on the wire and comes back as one.
        $this->assertEquals([[
            'name' => 'Aruba 2930F switch — 24 port',
            'description' => 'SKU JL253A',
            'rate' => 10000,
            'quantity' => 2,
            // Delivered inside the home state: the CGST + SGST group.
            'tax_id' => self::INTRA,
        ]], $sent['line_items']);
    }

    public function test_a_sale_to_another_state_takes_igst_and_a_business_carries_its_gstin(): void
    {
        $this->dispatched([
            'gstin' => '27aapfu0939f1zv', 'company_name' => 'Acme Traders',
            'billing_address' => ['line1' => '9 MG Road', 'city' => 'Pune', 'state' => 'Maharashtra', 'pin' => '411001'],
            'shipping_address' => ['line1' => '9 MG Road', 'city' => 'Pune', 'state' => 'maharashtra', 'pin' => '411001'],
        ]);

        $sent = $this->called('POST', '/invoices')[0]['body'];
        $this->assertSame('MH', $sent['place_of_supply']);
        $this->assertSame(self::INTER, $sent['line_items'][0]['tax_id']);
        $this->assertSame('business_gst', $sent['gst_treatment']);
        $this->assertSame('27AAPFU0939F1ZV', $sent['gst_no']);

        $contact = $this->called('POST', '/contacts')[0]['body'];
        $this->assertSame('Acme Traders', $contact['contact_name']);
        $this->assertSame('business', $contact['customer_sub_type']);
        $this->assertSame('MH', $contact['place_of_contact']);
        $this->assertSame('priya@acme.co.in', $contact['contact_persons'][0]['email']);
        $this->assertSame('411001', $contact['billing_address']['zip']);
    }

    public function test_a_state_nobody_can_place_leaves_the_place_of_supply_off_rather_than_guessing(): void
    {
        $this->dispatched([
            'billing_address' => ['line1' => '1 Road', 'city' => 'Somewhere', 'state' => 'Atlantis', 'pin' => '000000'],
            'shipping_address' => ['line1' => '1 Road', 'city' => 'Somewhere', 'state' => 'Atlantis', 'pin' => '000000'],
        ]);

        $sent = $this->called('POST', '/invoices')[0]['body'];
        $this->assertArrayNotHasKey('place_of_supply', $sent);
        $this->assertSame(self::INTRA, $sent['line_items'][0]['tax_id']);
    }

    public function test_a_coupon_is_an_order_level_discount_before_tax(): void
    {
        $this->dispatched(['subtotal_paise' => 2000000, 'discount_paise' => 150050, 'total_paise' => 1849950]);

        $sent = $this->called('POST', '/invoices')[0]['body'];
        $this->assertSame(1500.5, $sent['discount']);
        $this->assertSame('entity_level', $sent['discount_type']);
        $this->assertTrue($sent['is_discount_before_tax']);
    }

    public function test_an_order_with_something_to_ship_waits_for_dispatch_and_a_licence_does_not(): void
    {
        $shipped = $this->order();
        $shipped->moveTo(OrderStatus::Paid);
        $this->assertNull($shipped->fresh()->zoho_status);
        $this->assertCount(0, $this->called('POST', '/invoices'));

        $licence = $this->order([], digitalOnly: true);
        $licence->moveTo(OrderStatus::Paid);
        $this->assertSame('created', $licence->fresh()->zoho_status);
        $this->assertCount(1, $this->called('POST', '/invoices'));
    }

    public function test_set_to_invoice_on_payment_a_shipped_order_does_not_wait(): void
    {
        Setting::put('zoho_books_invoice_when', 'paid');

        $order = $this->order();
        $order->moveTo(OrderStatus::Paid);

        $this->assertSame('created', $order->fresh()->zoho_status);
    }

    public function test_an_order_is_invoiced_once_however_many_times_it_changes(): void
    {
        $order = $this->dispatched();
        $order->moveTo(OrderStatus::Completed);
        ZohoInvoices::run($order->fresh());
        ZohoInvoices::sweep();

        $this->assertCount(1, $this->called('POST', '/invoices'));
        $this->assertCount(1, $this->called('POST', '/contacts'));
    }

    public function test_a_cancelled_order_is_never_invoiced(): void
    {
        $order = $this->order();
        $order->moveTo(OrderStatus::Paid);
        $order->moveTo(OrderStatus::Cancelled);

        $this->assertNull($order->fresh()->zoho_status);
        $this->assertCount(0, $this->called('POST', '/invoices'));
    }

    /* ------------------------------------------------------- the customer */

    public function test_a_customer_zoho_already_knows_is_used_and_not_made_again(): void
    {
        $this->answers['GET /contacts'] = [['code' => 0, 'contacts' => [['contact_id' => '5550', 'email' => 'priya@acme.co.in']]]];

        $this->dispatched();

        $this->assertSame('priya@acme.co.in', $this->called('GET', '/contacts')[0]['query']['email']);
        $this->assertCount(0, $this->called('POST', '/contacts'));
        $this->assertSame('5550', $this->called('POST', '/invoices')[0]['body']['customer_id']);
    }

    public function test_a_name_zoho_already_has_is_made_distinct_by_the_address(): void
    {
        $tries = 0;
        $this->answers['POST /contacts'] = function () use (&$tries) {
            return ++$tries === 1
                ? [['code' => 3062, 'message' => 'The customer "Priya Das" already exists. Please specify a different name.'], 400]
                : [['code' => 0, 'contact' => ['contact_id' => '7002']]];
        };

        $order = $this->dispatched();

        $this->assertSame('created', $order->zoho_status);
        $made = $this->called('POST', '/contacts');
        $this->assertSame('Priya Das', $made[0]['body']['contact_name']);
        $this->assertSame('Priya Das (priya@acme.co.in)', $made[1]['body']['contact_name']);
    }

    /* ------------------------------------------------ never a second one */

    public function test_an_invoice_zoho_already_holds_for_the_order_is_adopted_not_repeated(): void
    {
        // A previous attempt got as far as Zoho making it, and no further.
        $this->answers['GET /invoices'] = fn () => [['code' => 0, 'invoices' => [[
            'invoice_id' => '9001', 'invoice_number' => 'INV-000099', 'date' => '2026-10-07',
            'reference_number' => Order::query()->latest('id')->value('order_number'), 'status' => 'sent',
        ]]]];
        // Already sent, and Zoho says so by refusing.
        $this->answers['POST /invoices/9001/status/sent'] = [['code' => 4012, 'message' => 'The invoice has already been marked as sent.'], 400];

        $order = $this->dispatched();

        $this->assertSame('created', $order->zoho_status);
        $this->assertSame('INV-000099', $order->invoice_number);
        $this->assertCount(0, $this->called('POST', '/invoices'));
        $this->assertCount(0, $this->called('POST', '/contacts'));
        Storage::disk('local')->assertExists($order->invoice_path);
        $this->assertTrue($order->history()->where('note', 'like', 'Zoho Books invoice INV-000099 linked%')->exists());
    }

    public function test_an_order_with_an_uploaded_invoice_is_left_alone(): void
    {
        $order = $this->order(['invoice_number' => 'HAND-7', 'invoice_path' => 'orders/hand/invoice.pdf']);
        $order->moveTo(OrderStatus::Paid);
        $order->moveTo(OrderStatus::Dispatched);
        $order = $order->fresh();

        $this->assertSame('skipped', $order->zoho_status);
        $this->assertSame('HAND-7', $order->invoice_number);
        $this->assertCount(0, $this->called('GET', '/contacts'));
        $this->assertCount(0, $this->called('POST', '/invoices'));
    }

    public function test_a_pdf_that_could_not_be_fetched_is_fetched_on_the_retry_without_a_second_invoice(): void
    {
        $this->answers['GET /invoices/9001'] = [['code' => 1002, 'message' => 'Invoice does not exist.'], 500];

        $order = $this->dispatched();
        $this->assertSame('failed', $order->zoho_status);
        $this->assertSame('9001', $order->zoho_invoice_id);
        $this->assertSame('INV-000123', $order->invoice_number);
        $this->assertNull($order->invoice_path);

        unset($this->answers['GET /invoices/9001']);
        $this->travel(6)->minutes();
        ZohoInvoices::sweep();

        $order = $order->fresh();
        $this->assertSame('created', $order->zoho_status);
        Storage::disk('local')->assertExists($order->invoice_path);
        $this->assertCount(1, $this->called('POST', '/invoices'));
    }

    /* ------------------------------------------------ zoho failing, safely */

    public function test_zoho_refusing_never_stops_the_dispatch_and_its_reason_is_on_the_order(): void
    {
        $this->answers['POST /invoices'] = [['code' => 1038, 'message' => 'Invalid value passed for tax_id'], 400];

        $order = $this->dispatched();

        $this->assertSame(OrderStatus::Dispatched, $order->status);
        $this->assertNotNull($order->dispatched_at);
        $this->assertSame('failed', $order->zoho_status);
        $this->assertSame('Invalid value passed for tax_id', $order->zoho_error);
        $this->assertSame(1, $order->zoho_attempts);
        $this->assertEquals(now()->addMinutes(5)->timestamp, $order->zoho_next_attempt_at->timestamp);
        $this->assertNull($order->invoice_number);
    }

    public function test_a_failed_attempt_comes_round_again_and_stops_after_five(): void
    {
        $this->answers['POST /invoices'] = [['code' => 57, 'message' => 'Zoho Books is temporarily unavailable.'], 503];
        $order = $this->dispatched();

        // Not yet due.
        ZohoInvoices::sweep();
        $this->assertSame(1, $order->fresh()->zoho_attempts);

        foreach ([6, 31, 121, 721] as $minutes) {
            $this->travel($minutes)->minutes();
            ZohoInvoices::sweep();
        }

        $order = $order->fresh();
        $this->assertSame(5, $order->zoho_attempts);
        $this->assertSame('failed', $order->zoho_status);
        // The last automatic attempt says so in the trail, once.
        $this->assertSame(1, $order->history()->where('note', 'like', 'Zoho Books invoice not made:%')->count());

        // Left for a person from here: a week of sweeps asks Zoho nothing more.
        $before = count($this->called('POST', '/invoices'));
        $this->travel(7)->days();
        ZohoInvoices::sweep();
        $this->assertCount($before, $this->called('POST', '/invoices'));

        // And the person's press goes ahead whatever the count.
        unset($this->answers['POST /invoices']);
        $this->as(RoleEnum::StoreManager)->postJson("/api/v1/admin/store/orders/{$order->order_number}/zoho-invoice")
            ->assertOk()->assertJsonPath('data.status', 'created')->assertJsonPath('data.invoice_number', 'INV-000123');
    }

    public function test_an_expired_token_is_refreshed_once_and_the_call_made_again(): void
    {
        $first = true;
        $this->answers['GET /contacts'] = function () use (&$first) {
            if ($first) {
                $first = false;

                return [['code' => 57, 'message' => 'You are not authorized to perform this operation'], 401];
            }

            return [['code' => 0, 'contacts' => []]];
        };

        $order = $this->dispatched();

        $this->assertSame('created', $order->zoho_status);
        $this->assertCount(2, $this->called('GET', '/contacts'));
        // The rotated refresh token is kept, or the connection dies at the next one.
        $this->assertSame('1000.new-refresh', Setting::get('zoho_books_oauth_refresh_token'));
    }

    public function test_a_total_zoho_works_out_differently_is_said_on_the_order(): void
    {
        $this->answers['POST /invoices'] = [['code' => 0, 'invoice' => ['invoice_id' => '9001', 'invoice_number' => 'INV-000123', 'date' => '2026-10-08', 'total' => 23600.0]]];

        $order = $this->dispatched();

        $this->assertSame('created', $order->zoho_status);
        $this->assertTrue($order->history()->where('note', 'like', '%differs from this order%')->exists());
    }

    /* ---------------------------------------------------------------- off */

    public function test_switched_off_or_half_set_up_nothing_is_marked_and_zoho_is_asked_nothing(): void
    {
        Setting::put('zoho_books_enabled', '0');
        $this->assertNull($this->dispatched()->zoho_status);

        Setting::put('zoho_books_enabled', '1');
        Setting::put('zoho_books_tax_inter', null);
        $this->assertNull($this->dispatched(['customer_email' => 'other@acme.co.in'])->zoho_status);

        $this->assertSame(0, ZohoInvoices::sweep());
        $this->assertSame([], $this->calls);
    }

    public function test_what_is_still_to_do_is_listed_in_the_order_somebody_would_do_it(): void
    {
        foreach (['oauth_client_id', 'oauth_client_secret', 'oauth_refresh_token', 'organization_id', 'home_state', 'tax_intra'] as $key) {
            Setting::put("zoho_books_{$key}", null);
        }

        $this->assertSame([
            'Save the client ID and secret.',
            'Connect a Zoho account.',
            'Choose the Zoho Books organisation.',
            'Choose the state your business is registered in.',
            'Choose both taxes.',
        ], ZohoSettings::missing());
        $this->assertFalse(ZohoSettings::ready());

        // Unconnected, the screen is told so without Zoho being asked anything.
        $this->as(RoleEnum::Admin)->getJson('/api/v1/admin/settings/zoho-books')
            ->assertOk()
            ->assertJsonPath('data.is_connected', false)
            ->assertJsonPath('data.client_configured', false)
            ->assertJsonPath('data.organizations', [])
            ->assertJsonPath('data.missing.0', 'Save the client ID and secret.');
        $this->assertSame([], $this->calls);

        // A client saved: the first step is done and is no longer listed.
        Setting::put('zoho_books_oauth_client_id', '1000.ABCDEF');
        Setting::put('zoho_books_oauth_client_secret', 'secret');
        $this->assertSame('Connect a Zoho account.', ZohoSettings::missing()[0]);
    }

    /* ------------------------------------------------------------ console */

    public function test_the_order_in_the_console_says_where_its_invoice_has_got_to(): void
    {
        $this->answers['POST /invoices'] = [['code' => 1038, 'message' => 'Invalid value passed for tax_id'], 400];
        $order = $this->dispatched();

        $this->as(RoleEnum::StoreManager)->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk()
            ->assertJsonPath('data.zoho.status', 'failed')
            ->assertJsonPath('data.zoho.error', 'Invalid value passed for tax_id')
            ->assertJsonPath('data.zoho.attempts', 1)
            ->assertJsonPath('data.zoho.can_create', true);

        $this->getJson('/api/v1/admin/store/orders?zoho=failed')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/store/dashboard')->assertOk()->assertJsonPath('data.attention.zoho_failed', 1);

        // The customer's own read of the order says nothing about Zoho.
        $this->app['auth']->forgetGuards();
        $public = $this->withHeaders(['Authorization' => ''])->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")->assertOk()->json('data');
        $this->assertArrayNotHasKey('zoho', $public);
    }

    public function test_connecting_is_an_administrators_and_the_screen_is_given_zohos_own_lists(): void
    {
        $this->as(RoleEnum::StoreManager)->getJson('/api/v1/admin/settings/zoho-books')->assertForbidden();

        $this->as(RoleEnum::Admin)->getJson('/api/v1/admin/settings/zoho-books')
            ->assertOk()
            ->assertJsonPath('data.is_connected', true)
            ->assertJsonPath('data.ready', true)
            ->assertJsonPath('data.organizations.0.name', 'Technoware Pvt Ltd')
            ->assertJsonPath('data.taxes.1.id', self::INTER)
            ->assertJsonPath('data.callback_path', '/admin/store/settings/zoho/callback');

        $this->postJson('/api/v1/admin/settings/zoho-books/test')->assertOk()->assertJsonPath('data.taxes', 2);

        // A tax the accountant has since deleted is named, not sent to fail on the next order.
        Setting::put('zoho_books_tax_intra', '999');
        $this->postJson('/api/v1/admin/settings/zoho-books/test')->assertStatus(422);
    }

    public function test_the_consent_goes_to_the_accounts_own_data_centre_and_back_to_one_address(): void
    {
        $redirect = 'http://localhost:3000/admin/store/settings/zoho/callback';

        $this->as(RoleEnum::Admin)->postJson('/api/v1/admin/settings/zoho-books/authorize', ['redirect_uri' => 'http://localhost:3000/admin/settings/mail/callback'])
            ->assertStatus(422);

        $url = $this->postJson('/api/v1/admin/settings/zoho-books/authorize', ['redirect_uri' => $redirect])->assertOk()->json('data.url');
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        $this->assertStringStartsWith('https://accounts.zoho.in/oauth/v2/auth?', $url);
        $this->assertSame('1000.ABCDEF', $query['client_id']);
        $this->assertSame('offline', $query['access_type']);
        $this->assertStringContainsString('ZohoBooks.invoices.CREATE', $query['scope']);
        $this->assertStringNotContainsString('DELETE', $query['scope']);

        // Coming back: the code is exchanged, the token kept, and the one organisation chosen.
        Setting::put('zoho_books_oauth_refresh_token', null);
        Setting::put('zoho_books_organization_id', null);

        $this->postJson('/api/v1/admin/settings/zoho-books/callback', ['code' => '1000.code', 'state' => $query['state']])
            ->assertOk()->assertJsonPath('data.account', 'Technoware Pvt Ltd');

        $this->assertSame('1000.new-refresh', Setting::get('zoho_books_oauth_refresh_token'));
        $this->assertSame('60001234567', Setting::get('zoho_books_organization_id'));
        // A state is spent by its first use.
        $this->postJson('/api/v1/admin/settings/zoho-books/callback', ['code' => '1000.code', 'state' => $query['state']])->assertStatus(422);

        // The other data centre signs in on its own domain.
        Setting::put('zoho_books_dc', 'com');
        $com = $this->postJson('/api/v1/admin/settings/zoho-books/authorize', ['redirect_uri' => $redirect])->json('data.url');
        $this->assertStringStartsWith('https://accounts.zoho.com/oauth/v2/auth?', $com);
    }

    public function test_a_choice_that_is_not_one_of_zohos_is_refused_on_save(): void
    {
        $save = fn (string $key, string $value) => $this->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $value]]]);

        $this->as(RoleEnum::Admin);
        $save('zoho_books_dc', 'eu.attacker.test')->assertStatus(422);
        $save('zoho_books_home_state', 'Bengal')->assertStatus(422);
        $save('zoho_books_organization_id', '60001234567; drop')->assertStatus(422);
        $save('zoho_books_invoice_when', 'never')->assertStatus(422);
        $save('zoho_books_home_state', 'MH')->assertOk();

        // And none of it is on the public map.
        $this->app['auth']->forgetGuards();
        $public = $this->withHeaders(['Authorization' => ''])->getJson('/api/v1/settings')->json('data');
        $this->assertSame([], array_filter(array_keys($public), fn ($k) => str_starts_with($k, 'zoho_')));
    }

    /* --------------------------------------------------------------- states */

    public function test_a_states_name_is_placed_however_it_was_written(): void
    {
        $this->assertSame('WB', IndianStates::code('West Bengal'));
        $this->assertSame('WB', IndianStates::code('  west bengal '));
        $this->assertSame('WB', IndianStates::code('wb'));
        $this->assertSame('OD', IndianStates::code('Orissa'));
        $this->assertSame('JK', IndianStates::code('Jammu & Kashmir'));
        $this->assertSame('DL', IndianStates::code('New Delhi'));
        $this->assertSame('TN', IndianStates::code('Tamilnadu'));
        $this->assertNull(IndianStates::code('Atlantis'));
        $this->assertNull(IndianStates::code(null));
        $this->assertCount(36, IndianStates::options());
    }
}
