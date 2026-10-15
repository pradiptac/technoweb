<?php

namespace Tests\Support;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * A fake Zoho Books for the tests that drive it (`ZohoBooksTest`,
 * `ZohoPaymentsTest`): one `Http::fake()` router. Every call is recorded in
 * `$calls`, and a test changes what a route answers through `$answers`.
 *
 * Lifted out of `ZohoBooksTest` in 0.136.0, when a second test needed the
 * same Zoho. Two fakes of one API is two answers to what Zoho does.
 */
trait FakesZohoBooks
{
    protected const INTRA = '460000000017001';

    protected const INTER = '460000000017002';

    /** Three accounts the fake's chart of accounts offers: a bank, cash, and a gateway's clearing account. */
    protected const BANK = '8001';

    protected const CASH = '8002';

    protected const CLEARING = '8003';

    /** @var list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>}> */
    protected array $calls = [];

    /** @var array<string, array{0: array<string, mixed>|string, 1?: int}|\Closure> "METHOD /path" => answer */
    protected array $answers = [];

    /** What Zoho says is still owed on invoice 9001. Set when the fake makes the invoice. */
    protected float $invoiceBalance = 20000.0;

    /** @var array<string, float> credit note id => what of it is still unused */
    protected array $creditBalances = [];

    /** Zoho Books switched on, connected and fully set up for invoices, in front of a fake Zoho. */
    protected function setUpZoho(): void
    {
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

    protected function zoho(Request $request)
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
                'invoice_id' => '9001', 'invoice_number' => 'INV-000123', 'date' => '2026-10-08', 'status' => 'draft', 'customer_id' => '7001',
                'total' => $this->invoiceBalance = ((float) array_sum(array_map(fn ($l) => $l['rate'] * $l['quantity'], $request->data()['line_items'] ?? []))) - (float) ($request->data()['discount'] ?? 0),
            ]]),
            $key === 'POST /invoices/9001/status/sent' => $this->answer($key, ['code' => 0, 'message' => 'Invoice status has been changed to Sent.']),
            // The same address is the PDF (`accept=pdf`) and the invoice as data.
            $key === 'GET /invoices/9001' && ($query['accept'] ?? null) === 'pdf' => $this->answer($key, '%PDF-1.4 the invoice'),
            $key === 'GET /invoices/9001' => $this->answer('GET /invoices/9001 json', ['code' => 0, 'invoice' => [
                'invoice_id' => '9001', 'invoice_number' => 'INV-000123', 'customer_id' => '7001', 'balance' => $this->invoiceBalance,
            ]]),
            default => $this->zohoMoney($request, $key, $path),
        };
    }

    /**
     * Payments and credit notes (0.136.0). Zoho's two running figures are
     * kept, because the code under test reads them back rather than
     * remembering: what is still owed on the invoice, and what of each
     * credit note is still unused.
     */
    protected function zohoMoney(Request $request, string $key, string $path)
    {
        $data = $request->data();

        if ($key === 'GET /chartofaccounts') {
            return $this->answer($key, ['code' => 0, 'chartofaccounts' => [
                ['account_id' => self::BANK, 'account_name' => 'HDFC Current Account', 'account_type' => 'bank'],
                ['account_id' => self::CASH, 'account_name' => 'Petty Cash', 'account_type' => 'cash'],
                ['account_id' => self::CLEARING, 'account_name' => 'Razorpay Clearing', 'account_type' => 'other_current_asset'],
                ['account_id' => '8999', 'account_name' => 'Sales', 'account_type' => 'income'],
            ]]);
        }

        if ($key === 'GET /customerpayments') {
            return $this->answer($key, ['code' => 0, 'customerpayments' => []]);
        }

        if ($key === 'POST /customerpayments') {
            $answer = $this->answers[$key] ?? null;

            if ($answer === null) {
                $this->invoiceBalance = round($this->invoiceBalance - (float) ($data['invoices'][0]['amount_applied'] ?? 0), 2);
            }

            return $this->answer($key, ['code' => 0, 'payment' => ['payment_id' => (string) (5000 + count($this->called('POST', '/customerpayments')))]]);
        }

        if ($key === 'GET /creditnotes') {
            return $this->answer($key, ['code' => 0, 'creditnotes' => []]);
        }

        if ($key === 'POST /creditnotes') {
            if (isset($this->answers[$key])) {
                return $this->answer($key, []);
            }

            $id = (string) (6000 + count($this->creditBalances) + 1);
            $total = round((float) array_sum(array_map(fn ($l) => $l['rate'] * $l['quantity'], $data['line_items'] ?? [])) - (float) ($data['discount'] ?? 0), 2);
            $this->creditBalances[$id] = $total;

            return Http::response(['code' => 0, 'creditnote' => [
                'creditnote_id' => $id, 'creditnote_number' => 'CN-'.str_pad((string) count($this->creditBalances), 5, '0', STR_PAD_LEFT),
                'total' => $total, 'balance' => $total,
            ]]);
        }

        if (preg_match('#^/creditnotes/(\d+)(/invoices|/refunds)?$#', $path, $m) === 1 && isset($this->creditBalances[$m[1]])) {
            $id = $m[1];
            $step = $m[2] ?? '';

            if ($request->method() === 'GET' && $step === '') {
                return $this->answer('GET /creditnotes/{id}', ['code' => 0, 'creditnote' => [
                    'creditnote_id' => $id, 'creditnote_number' => 'CN-'.str_pad((string) ((int) $id - 6000), 5, '0', STR_PAD_LEFT),
                    'balance' => $this->creditBalances[$id],
                ]]);
            }

            if ($request->method() === 'POST' && $step === '/invoices') {
                if (isset($this->answers['POST /creditnotes/{id}/invoices'])) {
                    return $this->answer('POST /creditnotes/{id}/invoices', []);
                }

                $applied = (float) ($data['invoices'][0]['amount_applied'] ?? 0);
                $this->creditBalances[$id] = round($this->creditBalances[$id] - $applied, 2);
                $this->invoiceBalance = round($this->invoiceBalance - $applied, 2);

                return Http::response(['code' => 0, 'message' => 'Credits have been applied to the invoice(s).']);
            }

            if ($request->method() === 'POST' && $step === '/refunds') {
                if (isset($this->answers['POST /creditnotes/{id}/refunds'])) {
                    return $this->answer('POST /creditnotes/{id}/refunds', []);
                }

                $this->creditBalances[$id] = round($this->creditBalances[$id] - (float) ($data['amount'] ?? 0), 2);

                return Http::response(['code' => 0, 'creditnote_refund' => ['creditnote_refund_id' => (string) (6500 + (int) $id - 6000)]]);
            }
        }

        return Http::response(['code' => 5, 'message' => "Invalid URL passed ({$key})"], 404);
    }

    protected function answer(string $key, array|string $default)
    {
        $answer = $this->answers[$key] ?? [$default];

        if ($answer instanceof \Closure) {
            $answer = $answer();
        }

        return Http::response($answer[0], $answer[1] ?? 200);
    }

    /** @return list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>}> */
    protected function called(string $method, string $path): array
    {
        return array_values(array_filter($this->calls, fn ($c) => $c['method'] === $method && $c['path'] === $path));
    }

    /* ------------------------------------------------------------ helpers */

    /** An order that has been placed and not yet paid: one switch (×2), and — unless `digital` — nothing else. */
    protected function order(array $overrides = [], bool $digitalOnly = false): Order
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

    protected function dispatched(array $overrides = []): Order
    {
        $order = $this->order($overrides);
        $order->moveTo(OrderStatus::Paid);
        $order->moveTo(OrderStatus::Dispatched);

        return $order->fresh();
    }

    protected function staff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    protected function as(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$this->staff($role)->createToken('admin')->plainTextToken);
    }
}
