<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Meta catalogue feed's switch and its source (2026-09-26).
 *
 * The feed itself is rendered by the frontend (`/meta-catalogue.xml` and
 * `.csv`) from `GET /store/feed`, so what the API owes it is a public switch
 * the route can read — a 404 while it is off — and rows carrying everything
 * Meta's mapping reads: the three-valued availability it turns into "in
 * stock", "available for order" and "out of stock", both prices, and the
 * variant attributes it lists as `size` and `color`.
 */
class StoreMetaCatalogueTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    public function test_the_switch_is_seeded_on_in_the_public_store_group_and_can_be_turned_off(): void
    {
        $this->assertSame('store', Setting::query()->where('key', 'meta_catalogue_enabled')->value('group'));
        $this->assertSame('1', $this->getJson('/api/v1/settings')->assertOk()->json('data.meta_catalogue_enabled'));

        $admin = User::create([
            'name' => 'Admin', 'email' => 'meta-admin@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $admin->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'meta_catalogue_enabled', 'value' => '0']],
        ])->assertOk();

        $this->assertSame('0', $this->getJson('/api/v1/settings')->assertOk()->json('data.meta_catalogue_enabled'));
    }

    public function test_the_feed_rows_carry_what_the_meta_mapping_reads(): void
    {
        $brand = Brand::create(['name' => 'Lenovo', 'slug' => 'lenovo']);
        $product = StoreProduct::create([
            'name' => 'ThinkPad E14', 'slug' => 'thinkpad-e14', 'brand_id' => $brand->id,
            'price_paise' => 5500000, 'compare_at_paise' => 6000000, 'stock' => 0,
            'status' => 'published', 'images' => ['media/shop/e14.jpg'],
        ]);
        $product->variations()->create([
            'name' => 'Black, 14"', 'options' => ['Colour' => 'Black', 'Size' => '14 inch'],
            'stock' => 0, 'allow_oversell' => true,
        ]);

        $item = $this->getJson('/api/v1/store/feed')->assertOk()->json('data.0');

        $this->assertSame('backorder', $item['availability']);
        $this->assertSame('60000.00 INR', $item['price']);
        $this->assertSame('55000.00 INR', $item['sale_price']);
        $this->assertSame('Black', $item['color']);
        $this->assertSame('14 inch', $item['size']);
        $this->assertSame('Lenovo', $item['brand']);
        $this->assertSame('sp-'.$product->id, $item['item_group_id']);
    }
}
