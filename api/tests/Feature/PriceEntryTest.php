<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Money;
use App\Support\Store\Tax;
use App\Support\Upgrade\Steps\PricesIncludeGst;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * A stored price always includes GST, and two settings decide only how a
 * price is typed and how it is shown (0.178.0, docs/store.md "Tax").
 *
 * The rule each test pins: neither switch moves what a customer pays.
 */
class PriceEntryTest extends TestCase
{
    use RefreshDatabase;

    private function set(string $key, string $value): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'invoicing', 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'price-entry@example.test'],
            ['name' => 'Pia Price', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'CBS350 24-Port Switch',
            'type' => ProductType::Physical->value,
            'status' => PublishStatus::Published->value,
            'price_paise' => 100000,
        ], $overrides);
    }

    /** A price with GST that does not survive the trip to "before GST" and back. */
    private function fragile(int $rate = 1800): int
    {
        for ($gross = 99900; ; $gross++) {
            if (Tax::addTo(Money::taxable($gross, $rate), $rate) !== $gross) {
                return $gross;
            }
        }
    }

    public function test_a_price_typed_before_gst_is_stored_with_it(): void
    {
        $this->set('store_price_entry', 'exclusive');

        $data = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload(['compare_at_paise' => 150000]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(118000, $data['price_paise']);
        $this->assertSame(177000, $data['compare_at_paise']);
        $this->assertSame(100000, $data['entry_price_paise']);
    }

    public function test_a_price_typed_with_gst_is_stored_as_typed(): void
    {
        $data = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload(['price_paise' => 118000]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(118000, $data['price_paise']);
        $this->assertSame(118000, $data['entry_price_paise']);
    }

    /**
     * Saving an untouched form under exclusive entry keeps the stored price,
     * even one whose before-GST figure would convert back a paisa away.
     */
    public function test_saving_an_untouched_form_moves_no_price_by_a_paisa(): void
    {
        $gross = $this->fragile();
        $product = StoreProduct::create($this->payload(['slug' => 'fragile', 'price_paise' => $gross, 'type' => ProductType::Physical]));
        $this->set('store_price_entry', 'exclusive');

        $shown = $this->actingAs($this->manager(), 'sanctum')
            ->getJson("/api/v1/admin/store/products/{$product->id}")
            ->json('data.entry_price_paise');

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['price_paise' => $shown])
            ->assertOk();

        $this->assertSame($gross, (int) $product->fresh()->price_paise);
    }

    /** Under exclusive entry the typed figure is before GST, so a new rate re-prices it. */
    public function test_changing_the_rate_under_exclusive_entry_converts_again(): void
    {
        $product = StoreProduct::create($this->payload(['slug' => 'rated', 'price_paise' => 118000, 'type' => ProductType::Physical]));
        $this->set('store_price_entry', 'exclusive');

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['price_paise' => 100000, 'gst_percent' => '5'])
            ->assertOk();

        $this->assertSame(105000, (int) $product->fresh()->price_paise);
    }

    public function test_a_variation_is_converted_at_its_parents_rate(): void
    {
        $this->set('store_price_entry', 'exclusive');

        $data = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload([
                'gst_percent' => '12',
                'variations' => [['name' => '48-port', 'price_paise' => 200000]],
            ]))
            ->assertCreated()
            ->json('data');

        $this->assertSame(112000, $data['price_paise']);
        $this->assertSame(224000, $data['variations'][0]['price_paise']);
        $this->assertSame(200000, $data['variations'][0]['entry_price_paise']);
    }

    /** The website shows the price before GST and says so; what is charged does not move. */
    public function test_the_shop_shows_prices_before_gst_when_asked(): void
    {
        StoreProduct::create($this->payload(['slug' => 'shown', 'price_paise' => 118000, 'compare_at_paise' => 236000, 'type' => ProductType::Physical]));

        $with = $this->getJson('/api/v1/store/products/shown')->assertOk()->json('data');
        $this->assertSame(118000, $with['price_paise']);
        $this->assertTrue($with['price_includes_gst']);

        $this->set('store_price_basis', 'exclusive');

        $before = $this->getJson('/api/v1/store/products/shown')->assertOk()->json('data');
        $this->assertSame(100000, $before['price_paise']);
        $this->assertSame(200000, $before['compare_at_paise']);
        $this->assertFalse($before['price_includes_gst']);
        $this->assertSame(118000, (int) StoreProduct::where('slug', 'shown')->value('price_paise'));
    }

    /** The CSV is in the console's basis, and a round trip moves nothing. */
    public function test_the_catalogue_csv_round_trips_under_exclusive_entry(): void
    {
        Storage::fake('local');
        $gross = $this->fragile();
        StoreProduct::create($this->payload(['slug' => 'csv', 'sku' => 'CSV-1', 'price_paise' => $gross, 'type' => ProductType::Physical]));
        $this->set('store_price_entry', 'exclusive');

        $csv = $this->actingAs($this->manager(), 'sanctum')
            ->get('/api/v1/admin/store/products/export')
            ->assertOk()
            ->streamedContent();

        $this->assertStringContainsString(Money::toRupeeString(Money::taxable($gross, 1800)), $csv);

        $analysis = $this->actingAs($this->manager(), 'sanctum')
            ->post('/api/v1/admin/store/products/import/analyse', [
                'file' => UploadedFile::fake()->createWithContent('catalogue.csv', $csv),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('data');

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products/import', [
                'file' => $analysis['file'],
                'original_name' => $analysis['original_name'],
                'mapping' => $analysis['mapping'],
            ])
            ->assertCreated();

        $this->assertSame($gross, (int) StoreProduct::where('sku', 'CSV-1')->value('price_paise'));
    }

    public function test_the_upgrade_converts_a_shop_that_typed_prices_before_gst(): void
    {
        $a = StoreProduct::create($this->payload(['slug' => 'up-a', 'price_paise' => 100000, 'type' => ProductType::Physical]));
        $b = StoreProduct::create($this->payload(['slug' => 'up-b', 'price_paise' => 100000, 'gst_percent' => '5', 'type' => ProductType::Physical]));
        $this->set('store_price_basis', 'exclusive');

        app(PricesIncludeGst::class)->run();
        Setting::flushCache();

        $this->assertSame(118000, (int) $a->fresh()->price_paise);
        $this->assertSame(105000, (int) $b->fresh()->price_paise);
        $this->assertSame('exclusive', Tax::entry());
    }

    public function test_the_upgrade_leaves_an_inclusive_shop_alone(): void
    {
        $a = StoreProduct::create($this->payload(['slug' => 'keep', 'price_paise' => 118000, 'type' => ProductType::Physical]));

        app(PricesIncludeGst::class)->run();
        Setting::flushCache();

        $this->assertSame(118000, (int) $a->fresh()->price_paise);
        $this->assertSame('inclusive', Tax::entry());
    }
}
