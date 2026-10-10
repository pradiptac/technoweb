<?php

namespace Tests\Support;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Store\Shipping\Shipments;
use Database\Seeders\SettingsSeeder;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

/**
 * A fake Shiprocket for the tests that drive it (`ShiprocketTest`): one
 * `Http::fake()` router, and `Http::preventStrayRequests()` so that nothing
 * a test does can reach the real service. **There is no Shiprocket sandbox —
 * every real call acts on a live account.**
 *
 * Every call is recorded in `$srCalls`; a test changes what a route answers
 * through `$srAnswers` ("METHOD /path" => [body, status] or a closure). The
 * fake issues tokens `tok-1`, `tok-2`… on each sign-in, and answers 401 to
 * any token listed in `$srRevoked`, which is how a test expires one.
 *
 * Modelled on `FakesZohoBooks`: two fakes of one API is two answers to what
 * it does.
 */
trait FakesShiprocket
{
    /** @var list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>, token: string|null}> */
    protected array $srCalls = [];

    /** @var array<string, array{0: array<string, mixed>|string, 1?: int}|\Closure> */
    protected array $srAnswers = [];

    /** @var list<string> tokens the fake treats as expired */
    protected array $srRevoked = [];

    protected int $srLogins = 0;

    /** Shiprocket switched on and fully set up, in front of a fake Shiprocket. */
    protected function setUpShiprocket(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-12 11:00:00', 'Asia/Kolkata'));
        Notification::fake();
        Cache::flush();

        Setting::put('store_courier_provider', 'shiprocket');
        Setting::put('shiprocket_email', 'api-user@technoware.test');
        Setting::put('shiprocket_password', 'api-password');
        Setting::put('shiprocket_pickup_location', 'Warehouse');
        Setting::put('shiprocket_webhook_token', 'a-long-shared-secret-token');

        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => $this->shiprocket($request));
    }

    protected function shiprocket(Request $request)
    {
        $url = parse_url($request->url());
        $host = $url['host'] ?? '';
        $path = Str::after($url['path'] ?? '', '/v1/external');
        parse_str($url['query'] ?? '', $query);
        $key = $request->method().' '.$path;
        $auth = (string) ($request->header('Authorization')[0] ?? '');
        $token = Str::after($auth, 'Bearer ') ?: null;

        $this->srCalls[] = ['method' => $request->method(), 'path' => $path, 'query' => $query, 'body' => $request->data(), 'token' => $token];

        if ($host !== 'apiv2.shiprocket.in') {
            return Http::response(['message' => "Unexpected host {$host}"], 500);
        }

        if ($key === 'POST /auth/login') {
            $this->srLogins++;

            return $this->srAnswer($key, ['id' => 1, 'email' => 'api-user@technoware.test', 'company_id' => 24797, 'token' => 'tok-'.$this->srLogins]);
        }

        if ($token === null || in_array($token, $this->srRevoked, true)) {
            return Http::response(['message' => 'Unauthenticated.'], 401);
        }

        return match (true) {
            $key === 'GET /settings/company/pickup' => $this->srAnswer($key, ['data' => ['shipping_address' => [
                ['id' => 4984500, 'pickup_location' => 'Warehouse', 'address' => '12 Industrial Road', 'address_2' => '', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin_code' => '700001', 'phone_verified' => 1],
                ['id' => 4984501, 'pickup_location' => 'Showroom', 'address' => '4 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin_code' => '700016', 'phone_verified' => 1],
            ], 'allow_more' => 'true']]),
            $key === 'POST /orders/create/adhoc' => $this->srAnswer($key, ['order_id' => 16161616, 'shipment_id' => 15151515, 'status' => 'NEW', 'status_code' => 1, 'awb_code' => null]),
            $key === 'POST /courier/assign/awb' => $this->srAnswer($key, ['awb_assign_status' => 1, 'response' => ['data' => [
                'courier_company_id' => 43, 'awb_code' => '321055706540', 'order_id' => 16161616, 'shipment_id' => 15151515, 'courier_name' => 'Delhivery Surface',
            ]]]),
            $key === 'POST /courier/generate/pickup' => $this->srAnswer($key, ['pickup_status' => 1, 'response' => ['pickup_scheduled_date' => '2026-10-13 12:00:00', 'data' => 'Pickup is confirmed by Delhivery Surface For AWB :- 321055706540']]),
            $key === 'POST /courier/generate/label' => $this->srAnswer($key, ['label_created' => 1, 'label_url' => 'https://labels.example.test/shipping-label-15151515.pdf', 'response' => 'Label has been created and uploaded successfully!', 'not_created' => []]),
            $key === 'POST /orders/cancel/shipment/awbs' => $this->srAnswer($key, ['message' => 'Bulk Shipment cancellation is in progress. Please wait for some time.']),
            $key === 'POST /orders/cancel' => $this->srAnswer($key, [], 204),
            str_starts_with($key, 'GET /courier/track/awb/') => $this->srAnswer('GET /courier/track/awb/{awb}', ['tracking_data' => [
                'track_status' => 1, 'shipment_status' => 18,
                'shipment_track' => [['awb_code' => Str::afterLast($path, '/'), 'current_status' => 'In Transit', 'delivered_date' => null]],
            ]]),
            default => Http::response(['message' => "Unexpected route ({$key})"], 404),
        };
    }

    protected function srAnswer(string $key, array|string $default, int $status = 200)
    {
        $answer = $this->srAnswers[$key] ?? [$default, $status];

        if ($answer instanceof \Closure) {
            $answer = $answer();
        }

        return Http::response($answer[0], $answer[1] ?? 200);
    }

    /** @return list<array{method: string, path: string, query: array<string, mixed>, body: array<string, mixed>, token: string|null}> */
    protected function srCalled(string $method, string $path): array
    {
        return array_values(array_filter($this->srCalls, fn ($c) => $c['method'] === $method && $c['path'] === $path));
    }

    /* ------------------------------------------------------------ helpers */

    /** A paid, physical order, ready to be booked. */
    protected function paidOrder(array $overrides = []): Order
    {
        $order = $this->srOrder(array_replace([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway', 'shipping_weight_grams' => 1750,
        ], $overrides));
        $order->moveTo(OrderStatus::Paid);

        return $order->fresh(['items']);
    }

    /** A cash-on-delivery order: confirmed, unpaid. */
    protected function codOrder(array $overrides = []): Order
    {
        return $this->srOrder(array_replace([
            'status' => OrderStatus::Confirmed, 'payment_method' => 'cod', 'shipping_weight_grams' => 1750,
        ], $overrides));
    }

    protected function srOrder(array $overrides = [], bool $digitalOnly = false): Order
    {
        $order = Order::create(array_replace([
            'status' => OrderStatus::PendingPayment, 'payment_method' => 'gateway',
            'subtotal_paise' => 2000000, 'discount_paise' => 0, 'taxable_paise' => 1694915, 'gst_paise' => 305085, 'total_paise' => 2000000,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in', 'customer_phone' => '+91 98000 00000',
            'customer_note' => 'Leave with security — private note',
            'gstin' => '19ABCDE1234F1Z5',
            'billing_address' => ['line1' => '9 Billing Lane', 'line2' => null, 'city' => 'Mumbai', 'state' => 'Maharashtra', 'pin' => '400001', 'country' => 'India'],
            'shipping_address' => ['line1' => '1 Park Street', 'line2' => 'Floor 2', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016', 'country' => 'India'],
            'placed_at' => now(),
        ], $overrides));

        $order->items()->create($digitalOnly
            ? ['name' => 'Central licence', 'sku' => 'LIC-1', 'type' => ProductType::Digital, 'quantity' => 2, 'unit_price_paise' => 1000000, 'line_total_paise' => 2000000]
            : ['name' => 'Aruba 2930F switch', 'variation_name' => '24 port', 'sku' => 'JL253A', 'type' => ProductType::Physical, 'quantity' => 2, 'unit_price_paise' => 1000000, 'line_total_paise' => 2000000]);

        return $order->fresh(['items']);
    }

    protected function srStaff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    protected function srAs(RoleEnum $role): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$this->srStaff($role)->createToken('admin')->plainTextToken);
    }

    /** A booked order: the claim won, Shiprocket's order made, a courier assigned. */
    protected function bookedOrder(array $overrides = []): Order
    {
        $order = $this->paidOrder($overrides);

        return Shipments::book($order);
    }
}
