<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Product;
use App\Models\Role;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The store's own catalogue.
 *
 * The instruction this is built on: **what the store sells is maintained
 * separately from what the site advertises.** So there is no `is_sellable` flag
 * anywhere, nothing here touches `products`, and everything in `store_products`
 * is for sale by definition — which is what removes the whole class of bug
 * where a Buy button appears with no price behind it.
 */
class StoreCatalogueTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label()],
            ));
        }

        return $user;
    }

    private function manager(): User
    {
        return $this->staff(RoleEnum::StoreManager, 'store-manager@example.test');
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'CBS350 24-Port Switch',
            'type' => ProductType::Physical->value,
            'status' => PublishStatus::Published->value,
            'price_paise' => 1180000,
        ], $overrides);
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch',
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
        ], $attributes));
    }

    // ------------------------------------------------------ the role

    /**
     * The point of splitting a role is what it *cannot* reach.
     *
     * `NewsletterTest` makes the same assertion in the same shape for the
     * campaign manager, and for the same reason: a role that is a superset of
     * `content_manager` has not narrowed anything.
     */
    public function test_the_store_is_not_reachable_by_a_content_manager(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'cm-store-cat@example.test');

        $this->actingAs($editor, 'sanctum')
            ->getJson('/api/v1/admin/store/products')
            ->assertForbidden();
    }

    public function test_a_store_manager_cannot_edit_the_blog(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/blog-posts')
            ->assertForbidden();
    }

    // ------------------------------------------------------ creating

    /**
     * Everything in the store has a price, and that is the whole of what this
     * table buys over a flag on the catalogue: there is no tick to forget.
     */
    public function test_a_price_is_required(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', [
                'name' => 'Priceless', 'type' => 'physical', 'status' => 'published',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('price_paise');
    }

    /**
     * A created record comes back shaped like every read of one.
     *
     * `response()->json($resource)` serialises through `jsonSerialize()`, which
     * drops the `data` wrapper — so the console's `res.data` is undefined and it
     * reports a failure for something it just created. That has happened on two
     * modules here already, which is what earns a test rather than a comment.
     */
    public function test_a_created_product_is_wrapped_like_every_other_read(): void
    {
        $response = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload())
            ->assertCreated();

        $this->assertIsInt($response->json('data.id'));
        $this->assertSame(1180000, $response->json('data.price_paise'));
    }

    // ------------------------------------------------------ the storefront

    /**
     * The public endpoint publishes whether you can buy it, never how many are
     * left.
     *
     * An exact count tells anybody who curls the endpoint what this business
     * holds, and it is stale between the page and the checkout anyway.
     */
    public function test_the_storefront_never_publishes_a_stock_count(): void
    {
        $product = $this->product(['track_stock' => true, 'stock' => 7]);

        $response = $this->getJson("/api/v1/store/products/{$product->slug}")->assertOk();

        $this->assertTrue($response->json('data.in_stock'));
        $this->assertArrayNotHasKey('stock', $response->json('data'));
    }

    public function test_a_tracked_product_with_no_stock_is_out_of_stock(): void
    {
        $product = $this->product(['track_stock' => true, 'stock' => 0]);

        $this->getJson("/api/v1/store/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.in_stock', false);
    }

    /**
     * A service does not run out because nobody counted it.
     *
     * Which is why `service` is a type of its own rather than a digital product
     * with the code inventory switched off: there is nothing to issue and
     * nothing to ship, and an order for one waits on a person rather than on
     * stock.
     */
    public function test_an_untracked_service_is_always_available(): void
    {
        $product = $this->product([
            'slug' => 'managed-hosting',
            'type' => ProductType::Service,
            'track_stock' => false,
            'stock' => 0,
        ]);

        $this->getJson("/api/v1/store/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.in_stock', true)
            ->assertJsonPath('data.type', 'service');
    }

    public function test_a_draft_is_not_in_the_shop(): void
    {
        $product = $this->product(['status' => PublishStatus::Draft]);

        $this->getJson("/api/v1/store/products/{$product->slug}")->assertNotFound();
        $this->getJson('/api/v1/store/products')->assertOk()->assertJsonCount(0, 'data');
    }

    /**
     * A struck-through price is only sent when it is genuinely higher.
     *
     * Equal or lower is either a mistake or a lie, and both render as a
     * discount that is not there.
     */
    public function test_a_compare_at_price_below_the_real_one_is_not_published(): void
    {
        $product = $this->product(['compare_at_paise' => 1000000]);

        $response = $this->getJson("/api/v1/store/products/{$product->slug}")->assertOk();

        $this->assertArrayNotHasKey('compare_at_paise', $response->json('data'));
    }

    // ------------------------------------------------------ variations

    public function test_variations_keep_their_option_order(): void
    {
        $response = $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload([
                'variations' => [
                    [
                        'name' => '16 GB / 1 TB',
                        // Deliberately in an order MySQL would re-sort: it
                        // normalises JSON object keys by length, then
                        // alphabetically, so "RAM" would come back first
                        // whatever anybody typed.
                        'options' => ['Storage' => '1 TB', 'RAM' => '16 GB'],
                        'price_paise' => 1380000,
                        'stock' => 3,
                    ],
                    ['name' => '8 GB / 512 GB', 'stock' => 0],
                ],
            ]))
            ->assertCreated();

        $product = StoreProduct::with('variations')->find($response->json('data.id'));

        $this->assertSame(
            ['Storage' => '1 TB', 'RAM' => '16 GB'],
            $product->variations->first()->options,
            'the option order did not survive the JSON column',
        );

        // The second carries no price of its own and inherits the product's.
        $this->assertNull($product->variations->last()->price_paise);
        $this->assertSame(1180000, $product->variations->last()->pricePaise());
    }

    /**
     * A variation keeps its id when it is the same variation.
     *
     * An order item will record the variation it was bought as, so
     * delete-and-recreate on every save would renumber the ids underneath every
     * historical order and quietly re-point them at another configuration.
     */
    public function test_editing_a_variation_keeps_its_id(): void
    {
        $manager = $this->manager();

        $created = $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload([
                'variations' => [['name' => '24-Port', 'stock' => 5]],
            ]))
            ->assertCreated();

        $product = StoreProduct::with('variations')->find($created->json('data.id'));
        $id = $product->variations->first()->id;

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", [
                'variations' => [
                    ['id' => $id, 'name' => '24-Port', 'stock' => 2],
                    ['name' => '48-Port', 'stock' => 1],
                ],
            ])
            ->assertOk();

        $product->refresh()->load('variations');

        $this->assertCount(2, $product->variations);
        $this->assertSame($id, $product->variations->firstWhere('name', '24-Port')->id);
        $this->assertSame(2, $product->variations->firstWhere('name', '24-Port')->stock);
    }

    /** Sending an empty array clears them, or the last one could never go. */
    public function test_an_empty_array_clears_the_variations(): void
    {
        $manager = $this->manager();

        $id = $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload([
                'variations' => [['name' => '24-Port']],
            ]))
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$id}", ['variations' => []])
            ->assertOk();

        $this->assertCount(0, StoreProduct::find($id)->variations);
    }

    /** Omitting the key leaves them alone -- the rule every relation follows. */
    public function test_omitting_variations_leaves_them_alone(): void
    {
        $manager = $this->manager();

        $id = $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload([
                'variations' => [['name' => '24-Port']],
            ]))
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$id}", ['name' => 'Renamed only'])
            ->assertOk();

        $this->assertCount(1, StoreProduct::find($id)->variations);
    }

    /**
     * A product with variations is in stock while any variation is.
     *
     * The 24-port being gone does not make the 48-port unavailable, and the
     * product's own counter is not the answer once variations exist — the
     * variation is the thing with a shelf.
     */
    public function test_stock_is_answered_by_the_variations_when_there_are_any(): void
    {
        $product = $this->product(['track_stock' => true, 'stock' => 0]);

        $product->variations()->create(['name' => '24-Port', 'stock' => 0]);
        $product->variations()->create(['name' => '48-Port', 'stock' => 4]);

        $this->getJson("/api/v1/store/products/{$product->slug}")
            ->assertOk()
            ->assertJsonPath('data.in_stock', true);
    }

    // ------------------------------------------------------ categories

    /**
     * Deleting a category does not delete what is in it.
     *
     * Same rule the media library follows for a folder: a category is a label,
     * the products are the expensive thing, and losing a shop's stock to one
     * confirmation dialog is not a mistake anybody recovers from.
     */
    public function test_deleting_a_category_keeps_its_products(): void
    {
        $category = StoreCategory::create(['name' => 'Switches', 'slug' => 'switches']);
        $product = $this->product(['store_category_id' => $category->id]);

        $this->actingAs($this->manager(), 'sanctum')
            ->deleteJson("/api/v1/admin/store/categories/{$category->id}")
            ->assertNoContent();

        $product->refresh();

        $this->assertNull($product->store_category_id);
        $this->getJson("/api/v1/store/products/{$product->slug}")->assertOk();
    }

    /**
     * A facet that can only ever return nothing is worse than an absent one.
     *
     * The visitor reads an empty listing as "they do not sell this" rather than
     * "that filter was never going to match". Same rule `/brands` follows.
     */
    public function test_an_empty_category_is_not_offered_as_a_filter(): void
    {
        StoreCategory::create(['name' => 'Empty', 'slug' => 'empty']);
        $stocked = StoreCategory::create(['name' => 'Switches', 'slug' => 'switches']);
        $this->product(['store_category_id' => $stocked->id]);

        $response = $this->getJson('/api/v1/store/categories')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame('switches', $response->json('data.0.slug'));
    }

    /** Nothing in the store touches the site's own catalogue. */
    public function test_the_two_catalogues_are_separate(): void
    {
        $this->actingAs($this->manager(), 'sanctum')
            ->postJson('/api/v1/admin/store/products', $this->payload())
            ->assertCreated();

        $this->assertSame(0, Product::count(), 'the store wrote into the site catalogue');
    }
}
