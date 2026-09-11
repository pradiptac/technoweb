<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\Role;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The shop as Google Merchant Center reads it.
 *
 * A feed is a set of claims made to an advertising platform that suspends
 * accounts for the ones it finds untrue, so the tests that matter are about
 * what it must *not* say — a back-order called in stock, a SKU passed off as a
 * part number, an SVG offered as a photograph — and about the one thing that
 * must never change under an item: its id.
 */
class StoreFeedTest extends TestCase
{
    use RefreshDatabase;

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'NETGEAR GS308',
            'slug' => 'gs308-'.fake()->unique()->numberBetween(1, 100000),
            'sku' => 'GS308',
            'short_description' => 'An unmanaged 8-port Gigabit switch.',
            'price_paise' => 219900,
            'stock' => 5,
            'status' => 'published',
            'images' => ['media/shop/gs308.jpg'],
            ...$attributes,
        ]);
    }

    private function items(): array
    {
        return $this->getJson('/api/v1/store/feed')->assertOk()->json('data');
    }

    public function test_a_published_product_is_listed_with_what_google_requires(): void
    {
        $brand = Brand::create(['name' => 'NETGEAR', 'slug' => 'netgear']);
        $this->product(['brand_id' => $brand->id]);

        $item = $this->items()[0];

        $this->assertSame('NETGEAR GS308', $item['title']);
        $this->assertSame('2199.00 INR', $item['price']);
        $this->assertSame('in_stock', $item['availability']);
        $this->assertSame('new', $item['condition']);
        $this->assertSame('NETGEAR', $item['brand']);
        $this->assertStringEndsWith('/store/products/'.StoreProduct::sole()->slug, $item['link']);
        $this->assertStringEndsWith('gs308.jpg', $item['image_link']);
        $this->assertSame('0.00 INR', $item['shipping_price']);
        $this->assertSame('IN', $item['shipping_country']);
    }

    /**
     * The id is built from the row ids and never from the SKU.
     *
     * A SKU is nullable, editable and unique by nothing; changing an item's id
     * in a feed deletes one item and creates another, which throws away its
     * whole performance history. Renaming the SKU must leave the id alone.
     */
    public function test_the_item_id_is_stable_across_a_sku_change(): void
    {
        $product = $this->product();
        $before = $this->items()[0]['id'];

        $product->update(['sku' => 'GS308-V2']);

        $this->assertSame($before, $this->items()[0]['id']);
        $this->assertSame('sp-'.$product->id, $before);
    }

    /**
     * Google's two price fields are the other way round from ours.
     *
     * `price_paise` is what is charged; in a feed, `price` is the regular
     * figure and `sale_price` the reduced one. The first cut sent both through
     * unchanged and produced a "sale" at the same price as the "regular" — a
     * claimed saving with no reduction behind it, which is a misrepresentation
     * rather than a mistake to the platform reading it.
     */
    public function test_a_compare_at_price_becomes_the_regular_price_and_the_charge_becomes_the_sale(): void
    {
        $this->product(['compare_at_paise' => 299900]);

        $item = $this->items()[0];

        $this->assertSame('2999.00 INR', $item['price']);
        $this->assertSame('2199.00 INR', $item['sale_price']);
    }

    public function test_a_price_that_is_not_reduced_carries_no_sale_price(): void
    {
        $this->product(['compare_at_paise' => 219900]);

        $this->assertArrayNotHasKey('sale_price', $this->items()[0]);
    }

    /**
     * Three availabilities, not two.
     *
     * `inStock()` answers true for a back-ordered product, correctly — it can be
     * bought. Reused in a feed that is a claim the thing is on the shelf, which
     * Merchant Center treats as a policy violation when it is not.
     */
    public function test_an_oversold_product_is_on_back_order(): void
    {
        $this->product(['stock' => 0, 'allow_oversell' => true]);

        $this->assertSame('backorder', $this->items()[0]['availability']);
    }

    public function test_an_empty_shelf_with_no_back_order_is_out_of_stock(): void
    {
        $this->product(['stock' => 0]);

        $this->assertSame('out_of_stock', $this->items()[0]['availability']);
    }

    /**
     * One item per variation, grouped under the product.
     *
     * "A switch" at one price when the shop sells a 24-port and a 48-port gives
     * Google one figure for two products, and whichever it picks is wrong on the
     * page it links to.
     */
    public function test_variations_are_separate_items_sharing_a_group(): void
    {
        $product = $this->product();

        $ids = [];
        foreach ([['24-port', 219900, '0846127000123'], ['48-port', 459900, null]] as $i => [$name, $paise, $gtin]) {
            $ids[] = StoreProductVariation::create([
                'store_product_id' => $product->id, 'name' => $name, 'gtin' => $gtin,
                'price_paise' => $paise, 'stock' => 5, 'sort_order' => $i,
                'options' => ['Ports' => $name],
            ])->id;
        }

        $items = $this->items();

        $this->assertCount(2, $items);
        // Read back rather than assumed: auto-increment survives the
        // transaction `RefreshDatabase` rolls back, so under the full suite
        // these are never 1 and 2.
        $this->assertSame(
            array_map(fn ($id) => 'sp-'.$product->id.'-'.$id, $ids),
            array_column($items, 'id'),
        );
        $this->assertSame('sp-'.$product->id, $items[0]['item_group_id']);
        $this->assertSame('sp-'.$product->id, $items[1]['item_group_id']);
        $this->assertSame('NETGEAR GS308 — 24-port', $items[0]['title']);
        $this->assertSame('4599.00 INR', $items[1]['price']);

        // The variation's own barcode wins; the one without says so.
        $this->assertSame('0846127000123', $items[0]['gtin']);
        $this->assertArrayNotHasKey('gtin', $items[1]);
        $this->assertSame('no', $items[1]['identifier_exists']);

        // An option with no Google attribute still travels, as a detail.
        $this->assertSame(
            [['section' => 'Specification', 'name' => 'Ports', 'value' => '24-port']],
            $items[0]['product_detail'],
        );
    }

    /**
     * An inactive variation is not for sale and is not listed.
     */
    public function test_an_inactive_variation_is_absent(): void
    {
        $product = $this->product();
        StoreProductVariation::create([
            'store_product_id' => $product->id, 'name' => 'Old', 'price_paise' => 100, 'is_active' => false,
        ]);
        StoreProductVariation::create([
            'store_product_id' => $product->id, 'name' => 'Current', 'price_paise' => 200, 'stock' => 1,
        ]);

        $this->assertSame(['NETGEAR GS308 — Current'], array_column($this->items(), 'title'));
    }

    /**
     * `identifier_exists` is "no" only when both identifiers are blank, and a
     * SKU is not an identifier.
     *
     * A SKU is this shop's own filing code. Passing it off as an MPN would
     * claim a part number no manufacturer has ever issued.
     */
    public function test_a_sku_is_never_offered_as_a_manufacturer_part_number(): void
    {
        $this->product(['sku' => 'OUR-CODE']);

        $item = $this->items()[0];

        $this->assertArrayNotHasKey('mpn', $item);
        $this->assertSame('no', $item['identifier_exists']);
    }

    public function test_a_manufacturer_part_number_means_an_identifier_exists(): void
    {
        $this->product(['mpn' => 'GS308-100PES']);

        $item = $this->items()[0];

        $this->assertSame('GS308-100PES', $item['mpn']);
        $this->assertArrayNotHasKey('identifier_exists', $item);
    }

    /**
     * The category's Google taxonomy is inherited, and a blank override does
     * not beat it.
     */
    public function test_google_category_is_inherited_from_the_store_category(): void
    {
        $category = StoreCategory::create([
            'name' => 'Switches', 'slug' => 'switches', 'google_product_category' => '3312',
        ]);

        $this->product(['store_category_id' => $category->id, 'google_product_category' => '']);

        $item = $this->items()[0];

        $this->assertSame('3312', $item['google_product_category']);
        $this->assertSame('Switches', $item['product_type']);
    }

    /**
     * What is left out, and why — each for a stated reason.
     */
    public function test_withheld_unpublished_and_service_products_are_absent(): void
    {
        $this->product(['name' => 'Withheld', 'feed_include' => false]);
        $this->product(['name' => 'Draft', 'status' => 'draft']);
        $this->product(['name' => 'Install day', 'type' => 'service']);
        $this->product(['name' => 'Listed']);

        $response = $this->getJson('/api/v1/store/feed')->assertOk();

        $this->assertSame(['Listed'], array_column($response->json('data'), 'title'));
        // Deliberate exclusions are counted, not reported as problems.
        $this->assertSame(['withheld' => 1, 'service' => 1], $response->json('meta.skipped'));
        $this->assertSame([], $response->json('meta.problems'));
    }

    /**
     * Google rejects SVG, and this library is largely SVG placeholder art.
     *
     * Feeding one anyway is an item disapproved for a reason nothing on our
     * side explains, so it is left out and **named** — on the screen where
     * somebody can replace the picture.
     */
    public function test_a_product_with_only_svg_images_is_left_out_and_named(): void
    {
        $vector = $this->product(['name' => 'Vector only', 'images' => ['media/seed/switch.svg']]);
        $this->product(['name' => 'No picture', 'images' => []]);
        $this->product(['name' => 'Mixed', 'images' => ['media/seed/a.svg', 'media/shop/real.png']]);

        $response = $this->getJson('/api/v1/store/feed')->assertOk();
        $items = $response->json('data');

        $this->assertSame(['Mixed'], array_column($items, 'title'));
        // The SVG is dropped from the gallery, not just from the lead image.
        $this->assertStringEndsWith('real.png', $items[0]['image_link']);
        $this->assertArrayNotHasKey('additional_image_link', $items[0]);

        $problems = collect($response->json('meta.problems'))->keyBy('name');
        $this->assertSame('unsupported_image_format', $problems['Vector only']['reason']);
        $this->assertSame($vector->id, $problems['Vector only']['id']);
        $this->assertSame('no_image', $problems['No picture']['reason']);
    }

    /**
     * A shopping listing whose landing page carries no price is a listing
     * Google cannot show — and the page was doing exactly that until now.
     */
    public function test_the_product_page_carries_its_graph_and_a_listing_does_not(): void
    {
        $product = $this->product();

        $this->getJson('/api/v1/store/products/'.$product->slug)
            ->assertOk()
            ->assertJsonPath('data.schema.@type', 'Product')
            ->assertJsonPath('data.schema.offers.price', '2199.00');

        $this->getJson('/api/v1/store/products')
            ->assertOk()
            ->assertJsonMissingPath('data.0.schema');
    }

    /**
     * A GTIN is a barcode number and nothing else, refused before Google sees
     * it — the console is behind the admin session, so the refusal is the
     * only feedback there is.
     */
    public function test_a_gtin_that_is_not_a_barcode_is_refused(): void
    {
        $manager = User::create([
            'name' => 'Store manager', 'email' => 'store-manager@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $manager->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::StoreManager->value],
            ['name' => RoleEnum::StoreManager->label()],
        ));

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/products', [
                'name' => 'X', 'price_paise' => 100, 'gtin' => 'ABC-123',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('gtin');
    }
}
