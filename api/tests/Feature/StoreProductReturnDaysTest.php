<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Store\Returns\ReturnPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * A return window per product (docs/store.md "Returns"): the product's own
 * `return_days`, else the shop's, frozen on each order line at checkout and
 * closing line by line.
 */
class StoreProductReturnDaysTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'return-days@example.test'],
            ['name' => 'Rita Returns', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch', 'slug' => 'sw-'.uniqid(), 'type' => ProductType::Physical,
            'status' => PublishStatus::Published, 'price_paise' => 1180000, 'track_stock' => true, 'stock' => 5,
        ], $attributes));
    }

    private function save(array $extra): TestResponse
    {
        return $this->actingAs($this->manager(), 'sanctum')->postJson('/api/v1/admin/store/products', array_merge([
            'name' => 'CBS350', 'type' => 'physical', 'status' => 'published', 'price_paise' => 100000,
        ], $extra));
    }

    public function test_the_window_is_validated_and_blank_means_the_shop_figure(): void
    {
        foreach ([0, 366, 'abc'] as $bad) {
            $this->save(['return_days' => $bad])->assertUnprocessable()->assertJsonValidationErrors('return_days');
        }

        $this->save(['return_days' => ''])->assertCreated()
            ->assertJsonPath('data.return_days', null)
            ->assertJsonPath('data.return_days_effective', 7);

        $this->save(['return_days' => 14])->assertCreated()
            ->assertJsonPath('data.return_days', 14)
            ->assertJsonPath('data.return_days_effective', 14);
    }

    public function test_the_public_read_carries_the_override_and_the_shop_fallback(): void
    {
        $own = $this->product(['return_days' => 30]);
        $plain = $this->product();

        $this->getJson("/api/v1/store/products/{$own->slug}")->assertOk()->assertJsonPath('data.return_days', 30);
        $this->getJson("/api/v1/store/products/{$plain->slug}")->assertOk()->assertJsonPath('data.return_days', 7);

        Setting::updateOrCreate(['key' => 'store_return_days'], ['group' => 'store', 'value' => '10', 'type' => 'string']);
        Setting::flushCache();

        $this->getJson("/api/v1/store/products/{$plain->slug}")->assertJsonPath('data.return_days', 10);
    }

    public function test_checkout_freezes_the_window_on_the_line(): void
    {
        $product = $this->product(['return_days' => 3]);
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 1])
            ->assertCreated()->json('data.token');

        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '+91 98765 43210',
            'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
        ])->assertCreated();

        $product->update(['return_days' => 60]);

        $this->assertSame(3, OrderItem::query()->firstOrFail()->return_days);
    }

    public function test_a_line_closes_on_its_own_window_and_an_old_order_falls_back(): void
    {
        $this->travelTo(Carbon::parse('2026-10-08 11:00:00', 'Asia/Kolkata'));

        $order = Order::create([
            'status' => OrderStatus::Completed, 'payment_method' => 'gateway',
            'subtotal_paise' => 2000000, 'discount_paise' => 0, 'taxable_paise' => 1694915, 'gst_paise' => 305085, 'total_paise' => 2000000,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in', 'customer_phone' => '9800000000',
            'billing_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
            'placed_at' => now()->subDays(8), 'paid_at' => now()->subDays(8),
            'dispatched_at' => now()->subDays(6), 'completed_at' => now()->subDays(3),
        ]);
        $line = fn (array $o) => $order->items()->create(array_merge([
            'name' => 'Switch', 'sku' => 'S', 'type' => ProductType::Physical,
            'quantity' => 1, 'unit_price_paise' => 1000000, 'line_total_paise' => 1000000, 'returnable' => true,
        ], $o));
        $short = $line(['return_days' => 2]);   // delivered 3 days ago: closed
        $long = $line(['return_days' => 30]);   // open
        $old = $line([]);                       // no snapshot, no product: the shop's 7 days, open

        $order = $order->fresh();
        $this->assertSame([$short->id => 0, $long->id => 1, $old->id => 1], ReturnPolicy::returnable($order));

        $describe = ReturnPolicy::describe($order);
        $this->assertTrue($describe['open']);
        $this->assertSame(30, $describe['days']);
        $this->assertSame('2026-11-04', $describe['closes_on']);
        $byId = collect($describe['items'])->keyBy('order_item_id');
        $this->assertSame('2026-10-07', $byId[$short->id]['closes_on']);
        $this->assertSame('2026-10-12', $byId[$old->id]['closes_on']);

        $this->postJson("/api/v1/orders/{$order->order_number}/returns", [
            'token' => $order->access_token, 'reason' => 'damaged',
            'details' => 'The box was crushed and one port is bent.',
            'items' => [['order_item_id' => $short->id, 'quantity' => 1]],
        ])->assertUnprocessable()->assertJsonPath('errors', ['items.0.quantity' => ['The return window for that item has closed.']]);
    }
}
