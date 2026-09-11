<?php

namespace Tests\Feature;

use App\Enums\LocationLevel;
use App\Models\BlogPost;
use App\Models\Brand;
use App\Models\Location;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Service;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Models\User;
use App\Support\StructuredData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The claims this site makes to a search engine.
 *
 * Structured data is not decoration — it is a set of assertions Google acts on,
 * so the tests that matter here are about the things it must *not* say. A
 * plausible guess in a schema block is a lie with machine-readable markup
 * around it, and the two ways to make one are inventing a fact nobody entered
 * and repeating a fact that has gone stale.
 */
class StructuredDataTest extends TestCase
{
    use RefreshDatabase;

    /* ------------------------------------------------------------ products */

    public function test_a_product_carries_the_identifiers_a_search_engine_can_match_on(): void
    {
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        $category = ProductCategory::create(['name' => 'Network Switches', 'slug' => 'switches']);

        $product = Product::create([
            'name' => 'Catalyst CBS350-24T-4G', 'slug' => 'cbs350-24t-4g', 'sku' => 'CBS350-24T-4G',
            'short_description' => '24-port Gigabit managed switch with 4 SFP uplinks.',
            'brand_id' => $brand->id, 'product_category_id' => $category->id,
            'status' => 'published', 'availability' => 'BackOrder',
        ])->load(['brand', 'category']);

        $schema = StructuredData::product($product);

        $this->assertSame('Product', $schema['@type']);
        $this->assertSame('https://schema.org', $schema['@context']);
        // Both were sitting unused on the row while the frontend helper took a
        // name, a description, a slug and a brand name.
        $this->assertSame('CBS350-24T-4G', $schema['sku']);
        $this->assertSame('Cisco', $schema['brand']['name']);
    }

    /**
     * The marketing catalogue makes no offer at all, and that reverses an
     * earlier decision in this file.
     *
     * It used to emit an `Offer` carrying a URL, a currency and sometimes an
     * availability, on the argument that it was honest and still useful. It was
     * honest and it was **invalid**: an `Offer` without a `price` is a declared
     * node missing a required field, which Google reports as an error on every
     * product page. No offer at all is merely incomplete — a warning — and is
     * the truthful description of a catalogue nobody can buy from.
     *
     * The price-bearing half of this application is the store, and
     * `test_a_store_product_carries_a_real_price` below is its opposite number.
     */
    public function test_the_marketing_catalogue_makes_no_offer(): void
    {
        $product = Product::create([
            'name' => 'Unknown Widget', 'slug' => 'unknown-widget', 'sku' => 'UW-1',
            'status' => 'published', 'availability' => 'BackOrder',
        ]);

        $schema = StructuredData::product($product);

        $this->assertArrayNotHasKey('offers', $schema);
        // The identifiers are the reason the graph is still worth emitting.
        $this->assertSame('UW-1', $schema['sku']);
    }

    /**
     * No price, ever — on the marketing catalogue.
     *
     * The brief rules out carts, checkout, payments and quotations *there*, so
     * there is no price to state and inventing one would be the worst thing in
     * this file. Nothing anywhere in that graph may carry one, at any depth,
     * which is what a recursive search asserts and a top-level check would not.
     */
    public function test_no_price_is_ever_emitted(): void
    {
        $product = Product::create(['name' => 'A', 'slug' => 'a', 'sku' => 'A-1', 'status' => 'published']);

        $this->assertStringNotContainsString(
            'price',
            json_encode(StructuredData::product($product)),
        );
    }

    /* -------------------------------------------------- the store's own */

    private function shopProduct(array $attributes = []): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'NETGEAR GS308',
            'slug' => 'netgear-gs308-'.fake()->unique()->numberBetween(1, 100000),
            'sku' => 'GS308',
            'short_description' => 'An unmanaged 8-port Gigabit switch.',
            'price_paise' => 219900,
            'stock' => 5,
            'status' => 'published',
            'images' => ['media/shop/gs308.jpg'],
            ...$attributes,
        ]);
    }

    /**
     * The opposite number of `test_no_price_is_ever_emitted`.
     *
     * The marketing catalogue may not state a price because nothing there is
     * for sale. The store is the half that sells, and a shopping listing with
     * no price is not a cautious listing — it is one Google cannot show. This
     * is also what Merchant Center reads to keep a price current between feed
     * fetches, so it has to agree with the page to the paisa.
     */
    public function test_a_store_product_carries_a_real_price(): void
    {
        $schema = StructuredData::storeProduct($this->shopProduct()->load('variations'));

        $this->assertSame('Product', $schema['@type']);
        $this->assertSame('2199.00', $schema['offers']['price']);
        $this->assertSame('INR', $schema['offers']['priceCurrency']);
        $this->assertSame('https://schema.org/InStock', $schema['offers']['availability']);
        $this->assertSame('https://schema.org/NewCondition', $schema['offers']['itemCondition']);
    }

    /**
     * The price is GST-inclusive and says so, rather than leaving it to be
     * guessed at.
     *
     * India requires a tax-inclusive figure and `Money` extracts the GST rather
     * than adding it, so the number is already right — this asserts the claim
     * is *made*. The page has carried the sentence "Includes 18% GST. This is
     * the price you pay" all along; nothing machine-readable said it.
     */
    public function test_the_price_declares_that_tax_is_included(): void
    {
        $schema = StructuredData::storeProduct($this->shopProduct()->load('variations'));

        $this->assertTrue($schema['offers']['priceSpecification']['valueAddedTaxIncluded']);
    }

    /**
     * A back-order is not "in stock", and this is the rule that needs a test.
     *
     * `inStock()` is a boolean because a Buy button needs one, and it answers
     * *true* for a product with an empty shelf the shop has agreed to
     * back-order — correctly, since it can be bought. Reused as an availability
     * it would be a claim that the thing is held here, which is exactly the
     * kind of overstatement Merchant Center suspends accounts for. Three
     * states, not two.
     */
    public function test_an_oversold_product_is_on_back_order_not_in_stock(): void
    {
        $product = $this->shopProduct(['stock' => 0, 'allow_oversell' => true]);

        $this->assertTrue($product->inStock(), 'it can still be bought');
        $this->assertSame(
            'https://schema.org/BackOrder',
            StructuredData::storeProduct($product->load('variations'))['offers']['availability'],
        );
    }

    /**
     * A product with variations is a range, not one offer.
     *
     * Picking either price would be wrong on the page the block is rendered on:
     * a 24-port and a 48-port are two prices, and the page shows both.
     */
    public function test_variations_are_an_aggregate_offer(): void
    {
        $product = $this->shopProduct();

        foreach ([['24-port', 219900], ['48-port', 459900]] as $i => [$name, $paise]) {
            StoreProductVariation::create([
                'store_product_id' => $product->id, 'name' => $name,
                'price_paise' => $paise, 'stock' => 5, 'sort_order' => $i,
            ]);
        }

        $offers = StructuredData::storeProduct($product->load('variations'))['offers'];

        $this->assertSame('AggregateOffer', $offers['@type']);
        $this->assertSame('2199.00', $offers['lowPrice']);
        $this->assertSame('4599.00', $offers['highPrice']);
        $this->assertSame(2, $offers['offerCount']);
    }

    /**
     * A non-returnable product says so in the markup, not only on the page.
     *
     * `returnable` is a term of the sale already shown before somebody pays.
     * Omitting the node for those would leave the listing silent while the page
     * makes a claim — and Google requires a return policy to be stated either
     * way, so "not permitted" is the answer rather than the absence of one.
     */
    public function test_a_non_returnable_product_says_returns_are_not_permitted(): void
    {
        $policy = StructuredData::storeProduct(
            $this->shopProduct(['returnable' => false])->load('variations'),
        )['offers']['hasMerchantReturnPolicy'];

        $this->assertSame('https://schema.org/MerchantReturnNotPermitted', $policy['returnPolicyCategory']);
        $this->assertArrayNotHasKey('merchantReturnDays', $policy);
    }

    /* ------------------------------------------------------------ articles */

    /**
     * The bug that prompted moving this to the backend.
     *
     * Both article blocks used to send `datePublished` for `dateModified`, so
     * an article revised two years later still told Google it had never
     * changed. Freshness is one of the few things structured data genuinely
     * moves, and this was silently throwing it away on every post, case study
     * and knowledge-base article on the site.
     */
    public function test_a_revised_article_reports_when_it_was_revised(): void
    {
        $post = BlogPost::create([
            'title' => 'Firewall rules that stop working', 'slug' => 'firewall-rules',
            'excerpt' => 'Five policy patterns that pass review and fail in production.',
            'status' => 'published', 'published_at' => now()->subYears(2),
        ]);

        $post->update(['excerpt' => 'Revised.']);

        $schema = StructuredData::article($post->fresh());

        $this->assertNotSame(
            $schema['datePublished'], $schema['dateModified'],
            'a post edited two years after publication must not claim it never changed',
        );
        $this->assertStringStartsWith(now()->format('Y-m-d'), $schema['dateModified']);
    }

    /**
     * The real author, where there is one.
     *
     * Naming the Organization was not wrong — a company can author an article —
     * but the record has carried `author_id` the whole time and the frontend
     * could not see it.
     */
    public function test_an_article_names_its_author(): void
    {
        $author = User::create([
            'name' => 'A Person', 'email' => 'writer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);

        $post = BlogPost::create([
            'title' => 'Something', 'slug' => 'something', 'status' => 'published',
            'published_at' => now(), 'author_id' => $author->id,
        ])->load('author');

        $schema = StructuredData::article($post);

        $this->assertSame('Person', $schema['author']['@type']);
        $this->assertSame('A Person', $schema['author']['name']);
    }

    public function test_an_article_without_an_author_falls_back_to_the_company(): void
    {
        $post = BlogPost::create([
            'title' => 'Something', 'slug' => 'something-else', 'status' => 'published',
            'published_at' => now(),
        ])->load('author');

        $this->assertSame('Organization', StructuredData::article($post)['author']['@type']);
    }

    /* ------------------------------------------------- services and places */

    /**
     * `areaServed` is a list somebody ticked, not the office address repeated.
     *
     * This is the tie-in that makes the location tree worth having for SEO: a
     * coverage claim built from `location_service` is a fact, and one built
     * from "wherever the company is" is noise a search engine should ignore.
     */
    public function test_a_service_serves_the_places_it_was_assigned(): void
    {
        $wb = Location::create(['name' => 'West Bengal', 'slug' => 'west-bengal', 'level' => LocationLevel::State]);
        $kolkata = Location::create([
            'name' => 'Kolkata', 'slug' => 'kolkata', 'level' => LocationLevel::City, 'parent_id' => $wb->id,
        ]);

        $service = Service::create(['title' => 'Network Installation', 'slug' => 'network-installation', 'status' => 'published']);
        $service->locations()->attach($kolkata->id);

        $schema = StructuredData::service($service->load('locations'));

        $this->assertSame('Service', $schema['@type']);
        $this->assertCount(1, $schema['areaServed']);
        $this->assertSame('Kolkata', $schema['areaServed'][0]['name']);
        // Derived from the tree rather than stored twice.
        $this->assertSame('West Bengal', $schema['areaServed'][0]['address']['addressRegion']);
    }

    public function test_a_service_assigned_nowhere_claims_no_coverage(): void
    {
        $service = Service::create(['title' => 'Web Hosting', 'slug' => 'web-hosting', 'status' => 'published']);

        $this->assertArrayNotHasKey('areaServed', StructuredData::service($service->load('locations')));
    }

    /**
     * `LocalBusiness` asserts a physical presence, so it is only for a place.
     *
     * Putting it on every page of a site with one office is a claim to serve
     * everywhere from nowhere.
     */
    public function test_a_place_is_a_local_business_covering_its_own_subtree(): void
    {
        $wb = Location::create([
            'name' => 'West Bengal', 'slug' => 'west-bengal', 'level' => LocationLevel::State,
            'summary' => 'Two bases covering the state.',
        ]);
        Location::create(['name' => 'Kolkata', 'slug' => 'kolkata', 'level' => LocationLevel::City, 'parent_id' => $wb->id]);
        Location::create([
            'name' => 'Siliguri', 'slug' => 'siliguri', 'level' => LocationLevel::City,
            'parent_id' => $wb->id, 'is_active' => false,
        ]);

        $schema = StructuredData::localBusiness($wb->fresh());

        $this->assertSame('LocalBusiness', $schema['@type']);
        $this->assertSame('West Bengal', $schema['address']['addressLocality']);

        $served = array_column($schema['areaServed'], 'name');
        $this->assertContains('Kolkata', $served);
        // A place switched off is a place no longer covered, and the markup
        // must stop saying otherwise.
        $this->assertNotContains('Siliguri', $served);
    }

    /* ------------------------------------------------------------- the FAQ */

    public function test_an_faq_page_with_no_questions_is_absent_rather_than_empty(): void
    {
        $this->assertNull(StructuredData::faqPage([]));
    }

    /* -------------------------------------------------------- over the wire */

    /**
     * A nested record must not think it is the page.
     *
     * The first cut gated `schema` on `routeIs('*.show')`, which is wrong in a
     * way that only shows up through a relation: a nested resource inherits its
     * parent's route name, so every product rendered inside
     * `/solutions/networking` believed it was a detail view and built a Product
     * graph — touching `brand` and `category`, which are not eager-loaded there,
     * which with `preventLazyLoading` on made the endpoint 500.
     *
     * `ProductResource` has carried a comment about this exact trap for its
     * `seo` key the whole time. The comment did not prevent it; a test will.
     */
    public function test_a_nested_record_carries_no_graph_and_does_not_break_the_page(): void
    {
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        $category = ProductCategory::create(['name' => 'Switches', 'slug' => 'switches']);
        $solution = Solution::create([
            'title' => 'Enterprise networking', 'slug' => 'networking', 'status' => 'published',
        ]);
        $product = Product::create([
            'name' => 'Catalyst', 'slug' => 'catalyst', 'sku' => 'C-1',
            'brand_id' => $brand->id, 'product_category_id' => $category->id, 'status' => 'published',
        ]);
        $solution->products()->attach($product->id);

        $response = $this->getJson('/api/v1/solutions/networking')->assertOk();

        $this->assertSame('Service', $response->json('data.schema.@type'), 'the page itself has a graph');
        $this->assertNotEmpty($response->json('data.products'), 'the relation really is populated');
        $this->assertArrayNotHasKey(
            'schema',
            $response->json('data.products.0'),
            'a product nested in a solution is not the page and must not build one',
        );
    }

    public function test_the_detail_endpoint_carries_the_graph_and_the_index_does_not(): void
    {
        $brand = Brand::create(['name' => 'Cisco', 'slug' => 'cisco']);
        Product::create([
            'name' => 'Catalyst', 'slug' => 'catalyst', 'sku' => 'C-1',
            'brand_id' => $brand->id, 'status' => 'published',
        ]);

        $this->getJson('/api/v1/products/catalyst')
            ->assertOk()
            ->assertJsonPath('data.schema.@type', 'Product');

        // An index of twenty products has no use for twenty schema graphs, and
        // each one costs a Brand and a set of image URLs.
        $this->getJson('/api/v1/products')
            ->assertOk()
            ->assertJsonMissingPath('data.0.schema');
    }

    /* --------------------------------------------- the schema_type override */

    /**
     * An editor's refinement reaches the markup.
     *
     * The whole point of turning that field into a dropdown: it was free text
     * that nothing read, so picking a type was a note to yourself. `Article`
     * to `BlogPosting` is the case it exists for — a real distinction a search
     * engine acts on, and one only a person can make.
     */
    public function test_an_editor_can_refine_the_type_a_record_declares(): void
    {
        $post = BlogPost::create([
            'title' => 'Firewall rules that stop working',
            'slug' => 'firewall-rules', 'body' => '<p>Body.</p>', 'status' => 'published',
            'published_at' => now()->subDays(3),
        ]);
        $post->seo()->create(['schema_type' => 'BlogPosting']);

        $graph = StructuredData::article($post->fresh()->load('seo'));

        $this->assertSame('BlogPosting', $graph['@type']);
    }

    /**
     * A type this record may not be is ignored, not emitted.
     *
     * The stored value outlives the rule that let it in — narrowing the list
     * later, or a row written before the allowlist existed, both land here.
     * Falling back to the derived type is right: a page with a slightly less
     * specific `@type` is a far better outcome than a `Product` block on a
     * blog post, which validates as neither.
     */
    public function test_a_type_the_record_cannot_support_falls_back_to_the_derived_one(): void
    {
        $post = BlogPost::create([
            'title' => 'Sizing a UPS', 'slug' => 'sizing-a-ups',
            'body' => '<p>Body.</p>', 'status' => 'published', 'published_at' => now(),
        ]);
        // Written straight to the column, past validation — which is exactly
        // the case this guard is for.
        $post->seo()->create(['schema_type' => 'Product']);

        $graph = StructuredData::article($post->fresh()->load('seo'));

        $this->assertSame('Article', $graph['@type']);
    }

    /** A record with no override declares what it derives, as it always did. */
    public function test_no_override_still_derives_the_type(): void
    {
        $post = BlogPost::create([
            'title' => 'Switch stacking', 'slug' => 'switch-stacking',
            'body' => '<p>Body.</p>', 'status' => 'published', 'published_at' => now(),
        ]);

        $this->assertSame('Article', StructuredData::article($post->fresh()->load('seo'))['@type']);
    }

    /**
     * The console's dropdown is built from the record, not from a list in the
     * frontend.
     *
     * Two hand-written copies of the same list of strings is the drift nothing
     * type-checks across the wire — the same reasoning that put the mail
     * transports in one enum.
     */
    public function test_a_record_ships_the_types_it_may_choose_between(): void
    {
        $post = BlogPost::create([
            'title' => 'Options', 'slug' => 'options',
            'body' => '<p>Body.</p>', 'status' => 'published', 'published_at' => now(),
        ]);

        $options = $post->resolvedSeo()['schema_type_options'];

        $this->assertSame(['Article', 'BlogPosting', 'NewsArticle'], $options);
        $this->assertNotContains('Recipe', $options);
        $this->assertNotContains('Product', $options);
    }
}
