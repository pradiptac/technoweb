<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Money;
use App\Support\Store\Invoice\AmountInWords;
use App\Support\Store\Invoice\GstInvoice;
use App\Support\Store\Invoice\Invoices;
use App\Support\Store\Tax;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

/**
 * The shop's own GST invoice (0.176.0, docs/store.md "The GST invoice").
 *
 * What this feature rests on, each pinned on its own:
 *
 *   1. **The figures add up.** Taxable plus tax is the amount charged, the
 *      CGST and SGST halves add back to the tax, and the printed lines sum
 *      to the printed total — on a legacy order too, where the per-line
 *      figures never existed and have to be divided out.
 *   2. **The split follows the states.** Same state is CGST and SGST,
 *      different states is IGST, and an unknown one is treated as local.
 *   3. **One invoice, one number.** Issued on payment, once, in its own
 *      series by financial year, and never over an uploaded invoice or
 *      while Zoho Books is making them.
 *   4. **Nothing reaches the wrong person.** The customer's download wants
 *      the order's token or the account that owns it, and only answers for
 *      a paid order.
 *   5. **It can never fail the order.** A throw inside the invoice leaves
 *      the payment recorded.
 */
class GstInvoiceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Storage::fake('public');

        $this->configure();
    }

    /* ------------------------------------------------------- the arithmetic */

    public function test_the_tax_adds_up_to_what_was_charged(): void
    {
        $invoice = GstInvoice::for($this->paid());

        $totals = $invoice->totals;

        $this->assertSame($totals['total_paise'], $totals['taxable_paise'] + $totals['gst_paise']);
        $this->assertSame($totals['gst_paise'], $totals['cgst_paise'] + $totals['sgst_paise'] + $totals['igst_paise']);
    }

    /**
     * An odd number of paise of tax splits without losing one.
     *
     * Halving twice and rounding each half is the obvious spelling and gives
     * two halves that do not add back. The floor-and-difference does.
     */
    public function test_an_odd_tax_splits_exactly_in_half(): void
    {
        $order = $this->paid(['taxable_paise' => 100000, 'gst_paise' => 18001, 'total_paise' => 118001]);

        $totals = GstInvoice::for($order)->totals;

        $this->assertSame(9000, $totals['cgst_paise']);
        $this->assertSame(9001, $totals['sgst_paise']);
        $this->assertSame(18001, $totals['cgst_paise'] + $totals['sgst_paise']);
    }

    public function test_the_printed_lines_sum_to_the_printed_total(): void
    {
        $invoice = GstInvoice::for($this->paid());

        $this->assertSame(
            $invoice->totals['total_paise'],
            array_sum(array_column($invoice->lines, 'total_paise')),
        );
        $this->assertSame(
            $invoice->totals['taxable_paise'],
            array_sum(array_column($invoice->lines, 'taxable_paise')),
        );
    }

    /**
     * An order placed before the per-line columns existed still prints.
     *
     * Its figures are divided across the lines rather than invented, and
     * they still sum to what was charged — the one property that matters.
     */
    public function test_a_legacy_order_without_per_line_figures_still_adds_up(): void
    {
        $order = $this->paid();

        // Exactly what such an order looks like: the two order columns, and
        // nothing on the lines.
        $order->items()->update(['taxable_paise' => null, 'gst_paise' => null, 'gst_basis_points' => null]);

        $invoice = GstInvoice::for($order->fresh(['items']));

        $this->assertSame(
            $invoice->totals['taxable_paise'],
            array_sum(array_column($invoice->lines, 'taxable_paise')),
        );
        $this->assertSame('18', $invoice->lines[0]['rate']);
    }

    public function test_the_delivery_is_a_line_of_its_own(): void
    {
        // The order's figures are the goods plus a delivery charge; the
        // difference between them and the lines' is the delivery, exactly.
        $order = $this->paid([
            'shipping_paise' => 10000,
            'taxable_paise' => 1703390,
            'gst_paise' => 306610,
            'total_paise' => 2010000,
        ]);

        $invoice = GstInvoice::for($order);
        $lines = $invoice->lines;
        $last = end($lines);

        $this->assertStringStartsWith('Delivery', $last['description']);
        $this->assertSame(10000, $last['total_paise']);
    }

    /* ------------------------------------------------------------ the split */

    public function test_a_sale_within_the_state_is_cgst_and_sgst(): void
    {
        $invoice = GstInvoice::for($this->paid());

        $this->assertFalse($invoice->interState);
        $this->assertSame(0, $invoice->totals['igst_paise']);
        $this->assertGreaterThan(0, $invoice->totals['cgst_paise']);
    }

    public function test_a_sale_to_another_state_is_igst(): void
    {
        $order = $this->paid([
            'shipping_address' => ['line1' => '7 MG Road', 'city' => 'Bengaluru', 'state' => 'Karnataka', 'pin' => '560001'],
        ]);

        $invoice = GstInvoice::for($order);

        $this->assertTrue($invoice->interState);
        $this->assertSame('KA', $invoice->placeOfSupply);
        $this->assertSame($invoice->totals['gst_paise'], $invoice->totals['igst_paise']);
        $this->assertSame(0, $invoice->totals['cgst_paise']);
    }

    /**
     * An address with no state on it is taxed as a local sale.
     *
     * The conservative reading: CGST and SGST are what a shop charges a
     * customer in its own state, and a blank state is almost always a local
     * address somebody typed carelessly rather than a sale across the
     * country.
     */
    public function test_an_unknown_state_is_treated_as_a_local_sale(): void
    {
        $order = $this->paid([
            'billing_address' => ['line1' => '1 Park Street', 'city' => 'Kolkata', 'pin' => '700016'],
            'shipping_address' => null,
        ]);

        $invoice = GstInvoice::for($order);

        $this->assertFalse($invoice->interState);
        $this->assertNull($invoice->placeOfSupply);
    }

    /* ------------------------------------------------------- when and once */

    public function test_paying_an_order_issues_its_invoice(): void
    {
        $order = $this->order();
        $order->moveTo(OrderStatus::Paid);
        $order = $order->fresh();

        $this->assertNotNull($order->invoice_number);
        $this->assertSame(Invoices::SOURCE, $order->invoice_source);
        $this->assertSame(now()->toDateString(), $order->invoice_date->toDateString());

        Storage::disk('local')->assertExists($order->invoice_path);
        $this->assertStringStartsWith('%PDF', Storage::disk('local')->get($order->invoice_path));
    }

    public function test_the_number_is_its_own_series_by_financial_year(): void
    {
        $first = $this->paid()->invoice_number;
        $second = $this->paid()->invoice_number;

        $year = Invoices::financialYear(now());

        $this->assertSame("INV/{$year}/00001", $first);
        $this->assertSame("INV/{$year}/00002", $second);
    }

    /** April to March, not January to December. */
    public function test_the_financial_year_runs_from_april(): void
    {
        $this->assertSame('2026-27', Invoices::financialYear(now()->setDate(2026, 4, 1)));
        $this->assertSame('2025-26', Invoices::financialYear(now()->setDate(2026, 3, 31)));
        $this->assertSame('2026-27', Invoices::financialYear(now()->setDate(2027, 1, 9)));
    }

    public function test_an_order_is_never_invoiced_twice(): void
    {
        $order = $this->paid();
        $number = $order->invoice_number;

        // Every later change runs the hook again.
        $order->moveTo(OrderStatus::Dispatched);
        Invoices::consider($order->fresh());

        $this->assertSame($number, $order->fresh()->invoice_number);
        $this->assertSame(1, Order::whereNotNull('invoice_number')->count());
    }

    public function test_an_unpaid_order_is_not_invoiced(): void
    {
        $order = $this->order();
        $order->moveTo(OrderStatus::Cancelled);

        $this->assertNull($order->fresh()->invoice_number);
    }

    /* ------------------------------------------------------ when it must not */

    public function test_nothing_is_issued_while_invoicing_is_off(): void
    {
        $this->setting('invoice_enabled', '0');

        $this->assertNull($this->paid()->invoice_number);
    }

    public function test_nothing_is_issued_while_the_setup_is_unfinished(): void
    {
        $this->setting('invoice_gstin', null);

        $order = $this->paid();

        $this->assertNull($order->invoice_number);
        $this->assertStringContainsString('GSTIN', (string) Invoices::refusalFor($order));
    }

    /** A malformed GSTIN edited straight into the database stops it too. */
    public function test_a_malformed_gstin_is_not_printed_on_anything(): void
    {
        $this->setting('invoice_gstin', 'NOTAGSTIN');

        $this->assertNull($this->paid()->invoice_number);
    }

    public function test_an_uploaded_invoice_is_never_overwritten(): void
    {
        $order = $this->order();

        Storage::disk('local')->put('orders/x/by-hand.pdf', '%PDF-hand');
        Order::whereKey($order->id)->toBase()->update([
            'invoice_path' => 'orders/x/by-hand.pdf',
            'invoice_source' => 'uploaded',
            'invoice_number' => 'HAND-1',
        ]);

        $order->fresh()->moveTo(OrderStatus::Paid);
        $order = $order->fresh();

        $this->assertSame('HAND-1', $order->invoice_number);
        $this->assertSame('%PDF-hand', Storage::disk('local')->get($order->invoice_path));
    }

    /**
     * Zoho Books wins when it is set up.
     *
     * Two systems numbering one series is two series, and the one that
     * files the return is the accounting system's.
     */
    public function test_nothing_is_generated_while_zoho_books_is_making_invoices(): void
    {
        foreach ([
            'zoho_books_enabled' => '1',
            'zoho_books_oauth_client_id' => 'id',
            'zoho_books_oauth_client_secret' => 'secret',
            'zoho_books_organization_id' => '123',
            'zoho_books_oauth_refresh_token' => 'refresh',
            'zoho_books_home_state' => 'WB',
            'zoho_books_tax_intra' => '1',
            'zoho_books_tax_inter' => '2',
            'zoho_books_scope_version' => '2',
        ] as $key => $value) {
            $this->setting($key, $value, 'zoho_books');
        }

        $this->assertFalse(Invoices::ready());
    }

    /**
     * A failure anywhere inside leaves the payment recorded.
     *
     * The renderer is made to throw outright, because the point is not that
     * one particular thing cannot go wrong — it is that **nothing** going
     * wrong here may reach the order. A library that cannot write a PDF on
     * this host, a font it cannot find, a disk that is full: the money
     * still arrived, and an order that reports itself unpaid because a
     * document failed is the worse failure by a long way.
     *
     * The first cut of this test set an over-long invoice prefix, which
     * `InvoiceSettings::prefix()` quietly falls back from — so it threw
     * nothing and passed while proving nothing. A guard test has to make
     * the guarded thing actually fail.
     */
    public function test_a_failure_inside_the_invoice_never_fails_the_order(): void
    {
        View::shouldReceive('make')->andThrow(new RuntimeException('the renderer fell over'));

        $order = $this->order();
        $order->moveTo(OrderStatus::Paid);
        $order = $order->fresh();

        $this->assertNotNull($order->paid_at);
        $this->assertSame(OrderStatus::Paid, $order->status);
        // The number was claimed before the render and the file never
        // written — which is visible, and recoverable with the button.
        $this->assertNull($order->invoice_path);
    }

    /* ----------------------------------------------------------- the rates */

    public function test_a_product_rate_beats_the_store_rate(): void
    {
        $this->assertSame(1800, Tax::rate());
        $this->setting('store_gst_percent', '5');
        $this->assertSame(500, Tax::rate());
    }

    public function test_the_rate_an_order_was_charged_at_is_read_from_its_own_figures(): void
    {
        $this->assertSame(1800, Money::rateOf(100000, 18000));
        $this->assertSame(500, Money::rateOf(100000, 5000));
        $this->assertSame(2800, Money::rateOf(100000, 28000));
        // Nothing taxable is no rate, not zero per cent.
        $this->assertNull(Money::rateOf(0, 0));
    }

    /**
     * Changing the shop's rate cannot rewrite an invoice already issued.
     *
     * The property that makes the rate safe to be a setting at all.
     */
    public function test_changing_the_rate_does_not_change_an_order_already_placed(): void
    {
        $order = $this->paid();
        $before = GstInvoice::for($order)->lines[0]['rate'];

        $this->setting('store_gst_percent', '5');

        $this->assertSame($before, GstInvoice::for($order->fresh(['items']))->lines[0]['rate']);
    }

    /* ---------------------------------------------------------- the console */

    public function test_a_store_manager_can_read_and_save_the_settings(): void
    {
        $this->as(RoleEnum::StoreManager)
            ->getJson('/api/v1/admin/store/invoicing')
            ->assertOk()
            ->assertJsonPath('meta.ready', true)
            ->assertJsonPath('meta.financial_year', Invoices::financialYear(now()));

        $this->as(RoleEnum::StoreManager)
            ->patchJson('/api/v1/admin/store/invoicing', [
                'settings' => [['key' => 'invoice_legal_name', 'value' => 'Acme Networks Pvt Ltd']],
            ])
            ->assertOk();

        $this->assertSame('Acme Networks Pvt Ltd', Setting::get('invoice_legal_name'));
    }

    /** A key outside the fifteen is refused by name, never ignored. */
    public function test_the_settings_door_refuses_a_key_it_does_not_own(): void
    {
        $this->as(RoleEnum::StoreManager)
            ->patchJson('/api/v1/admin/store/invoicing', [
                'settings' => [['key' => 'smtp_password', 'value' => 'hunter2']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.key');
    }

    public function test_a_malformed_gstin_is_refused_on_save(): void
    {
        $this->as(RoleEnum::StoreManager)
            ->patchJson('/api/v1/admin/store/invoicing', [
                'settings' => [['key' => 'invoice_gstin', 'value' => '19AABCU']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.value');
    }

    public function test_a_state_is_stored_as_its_code_however_it_was_typed(): void
    {
        $this->as(RoleEnum::StoreManager)
            ->patchJson('/api/v1/admin/store/invoicing', [
                'settings' => [['key' => 'invoice_state', 'value' => 'Karnataka']],
            ])
            ->assertOk();

        $this->assertSame('KA', Setting::get('invoice_state'));
    }

    public function test_the_console_can_make_the_invoice_again(): void
    {
        $order = $this->paid();
        $number = $order->invoice_number;

        Storage::disk('local')->delete($order->invoice_path);

        $this->as(RoleEnum::StoreManager)
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/invoice/generate")
            ->assertOk();

        // The number stands: once issued it is in somebody's books.
        $this->assertSame($number, $order->fresh()->invoice_number);
        Storage::disk('local')->assertExists($order->fresh()->invoice_path);
    }

    public function test_the_console_is_refused_in_the_same_words_the_screen_shows(): void
    {
        $this->setting('invoice_enabled', '0');

        $order = $this->order();

        $this->as(RoleEnum::StoreManager)
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/invoice/generate")
            ->assertStatus(422)
            ->assertJsonValidationErrors('invoice');
    }

    public function test_the_print_view_renders_the_invoice_as_a_page(): void
    {
        $order = $this->paid();

        $response = $this->as(RoleEnum::StoreManager)
            ->get("/api/v1/admin/store/orders/{$order->order_number}/invoice/print")
            ->assertOk();

        $response->assertSee('TAX INVOICE');
        $response->assertSee((string) $order->invoice_number);
        $response->assertSee('19AABCU9603R1ZM');
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    /* -------------------------------------------------------- the customer */

    public function test_the_guest_downloads_it_with_the_order_token(): void
    {
        $order = $this->paid();

        $this->get("/api/v1/orders/{$order->order_number}/invoice?token={$order->access_token}")
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_a_wrong_token_is_the_same_404_a_wrong_number_is(): void
    {
        $order = $this->paid();

        $this->getJson("/api/v1/orders/{$order->order_number}/invoice?token=".str_repeat('a', 64))
            ->assertNotFound();
        $this->getJson('/api/v1/orders/ORD-2026-99999/invoice?token=x')->assertNotFound();
    }

    /** An invoice is a record of money received, so an unpaid order has none. */
    public function test_an_unpaid_order_hands_out_nothing(): void
    {
        $order = $this->order();

        Storage::disk('local')->put('orders/y/early.pdf', '%PDF-early');
        Order::whereKey($order->id)->toBase()->update(['invoice_path' => 'orders/y/early.pdf']);

        $this->getJson("/api/v1/orders/{$order->order_number}/invoice?token={$order->fresh()->access_token}")
            ->assertNotFound();
    }

    public function test_a_customer_downloads_their_own_and_not_another_customers(): void
    {
        $mine = $this->customer('priya@acme.co.in');
        $theirs = $this->customer('rahul@other.co.in');

        $order = $this->paid(['customer_id' => $mine->id]);

        $this->withHeader('Authorization', 'Bearer '.$mine->createToken('portal')->plainTextToken)
            ->get("/api/v1/my/orders/{$order->order_number}/invoice")
            ->assertOk();

        $this->app['auth']->forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$theirs->createToken('portal')->plainTextToken)
            ->getJson("/api/v1/my/orders/{$order->order_number}/invoice")
            ->assertNotFound();
    }

    /**
     * `has_invoice` means "there is one you can download".
     *
     * It is the only thing the order page draws the link from, so it has to
     * carry the same paid check the route applies — a link that 404s on
     * press is the same defect as no link at all.
     */
    public function test_the_customers_order_only_claims_an_invoice_it_can_hand_over(): void
    {
        $order = $this->order();

        Storage::disk('local')->put('orders/z/early.pdf', '%PDF-early');
        Order::whereKey($order->id)->toBase()->update(['invoice_path' => 'orders/z/early.pdf']);

        $order = $order->fresh();

        $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")
            ->assertOk()
            ->assertJsonPath('data.has_invoice', false);
    }

    /* ------------------------------------------------------------- in words */

    public function test_an_amount_is_written_out_the_indian_way(): void
    {
        $this->assertSame('Rupees One Thousand Only', AmountInWords::rupees(100000));
        $this->assertSame('Rupees Twenty Thousand Only', AmountInWords::rupees(2000000));
        // Lakh and crore, not million: the words must agree with the
        // grouping of the digits beside them.
        $this->assertSame('Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only', AmountInWords::rupees(123456700));
        $this->assertSame('Rupees One Crore Only', AmountInWords::rupees(1000000000));
        $this->assertSame('Rupees Ten and Fifty Paise Only', AmountInWords::rupees(1050));
        $this->assertSame('Rupees Zero Only', AmountInWords::rupees(0));
    }

    /* ------------------------------------------------------------- helpers */

    private function configure(): void
    {
        foreach ([
            'invoice_enabled' => '1',
            'invoice_legal_name' => 'Acme Networks Private Limited',
            'invoice_gstin' => '19AABCU9603R1ZM',
            'invoice_state' => 'WB',
            'invoice_address' => "1 Park Street\nKolkata 700016",
            'invoice_prefix' => 'INV',
            'invoice_hsn_default' => '8517',
            'store_gst_percent' => '18',
            'store_price_basis' => Tax::BASIS_INCLUSIVE,
        ] as $key => $value) {
            $this->setting($key, $value);
        }
    }

    private function setting(string $key, ?string $value, string $group = 'invoicing'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    /** An order placed and not yet paid. */
    private function order(array $overrides = []): Order
    {
        $order = Order::create(array_replace([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway',
            'subtotal_paise' => 2000000, 'discount_paise' => 0,
            'taxable_paise' => 1694915, 'gst_paise' => 305085, 'total_paise' => 2000000,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in', 'customer_phone' => '9800000000',
            'billing_address' => ['line1' => '1 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'shipping_address' => ['line1' => '1 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'placed_at' => now(),
        ], $overrides));

        $order->items()->create([
            'name' => 'Aruba 2930F switch', 'variation_name' => '24 port', 'sku' => 'JL253A',
            'type' => ProductType::Physical, 'quantity' => 2,
            'unit_price_paise' => 1000000, 'line_total_paise' => 2000000,
            'gst_basis_points' => 1800, 'taxable_paise' => 1694915, 'gst_paise' => 305085,
        ]);

        return $order->fresh(['items']);
    }

    /** The same, paid — which is what issues the invoice. */
    private function paid(array $overrides = []): Order
    {
        $order = $this->order($overrides);
        $order->moveTo(OrderStatus::Paid);

        return $order->fresh(['items']);
    }

    private function customer(string $email): Customer
    {
        $customer = new Customer;
        $customer->forceFill([
            'name' => Str::before($email, '@'),
            'email' => $email,
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
            'email_verified_at' => now(),
        ])->save();

        return $customer;
    }

    private function as(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();

        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin')->plainTextToken);
    }
}
