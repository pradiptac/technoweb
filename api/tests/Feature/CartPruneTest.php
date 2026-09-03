<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\StoreProduct;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Abandoned baskets are deleted, and live ones are not.
 *
 * `carts` is the only table in the product that grows from a plain **read** —
 * `GET /cart` with no token mints and persists a row, which is how a first
 * "add to basket" gets a cart without the page that drew the button having to
 * make one. Nothing pruned it, and `lib/cart.ts` carried a comment claiming
 * "The API prunes abandoned carts on its own schedule" for as long as no such
 * command existed.
 */
class CartPruneTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_deletes_baskets_untouched_for_longer_than_the_window(): void
    {
        $stale = Cart::create(['token' => Cart::newToken()]);
        $stale->forceFill(['updated_at' => now()->subDays(40)])->saveQuietly();

        $this->artisan('technoware:prune-carts')->assertSuccessful();

        $this->assertDatabaseMissing('carts', ['id' => $stale->id]);
    }

    /**
     * The half that matters more.
     *
     * A prune that is too eager empties somebody's basket in front of them,
     * which is worse than a table that grows — so the window is checked from
     * both ends rather than only from the side that deletes.
     */
    public function test_it_keeps_a_basket_inside_the_window(): void
    {
        $fresh = Cart::create(['token' => Cart::newToken()]);
        $fresh->forceFill(['updated_at' => now()->subDays(20)])->saveQuietly();

        $this->artisan('technoware:prune-carts')->assertSuccessful();

        $this->assertDatabaseHas('carts', ['id' => $fresh->id]);
    }

    /**
     * `updated_at`, never `created_at`.
     *
     * A basket opened two months ago and added to this morning is in active
     * use. Ranging on when the row was written would throw it away with
     * somebody's shopping still in it — the same distinction the sales report
     * makes between `placed_at` and `created_at`.
     */
    public function test_a_basket_created_long_ago_but_used_today_survives(): void
    {
        $cart = Cart::create(['token' => Cart::newToken()]);
        $cart->forceFill([
            'created_at' => now()->subDays(120),
            'updated_at' => now()->subHour(),
        ])->saveQuietly();

        $this->artisan('technoware:prune-carts')->assertSuccessful();

        $this->assertDatabaseHas('carts', ['id' => $cart->id]);
    }

    /** The lines go with the basket rather than being orphaned by it. */
    public function test_the_lines_go_with_the_basket(): void
    {
        // Created directly, the way every other store test does it: there is
        // no factory for this model.
        $product = StoreProduct::create([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 5,
        ]);

        $cart = Cart::create(['token' => Cart::newToken()]);
        $item = CartItem::create([
            'cart_id' => $cart->id,
            'store_product_id' => $product->id,
            'quantity' => 1,
        ]);
        $cart->forceFill(['updated_at' => now()->subDays(60)])->saveQuietly();

        $this->artisan('technoware:prune-carts')->assertSuccessful();

        $this->assertDatabaseMissing('carts', ['id' => $cart->id]);
        $this->assertDatabaseMissing('cart_items', ['id' => $item->id]);
    }

    /**
     * `GET /cart` is throttled, because it is a read that writes.
     *
     * It was the one cart route with no limit at all, which made it a public
     * endpoint an anonymous caller could use to insert unbounded rows at
     * whatever rate they liked. The frontend never did this — `lib/cart.ts`
     * returns early with no cookie — but the frontend is not the boundary.
     */
    public function test_the_cart_read_is_throttled(): void
    {
        $route = collect(Route::getRoutes())
            ->first(fn ($r) => $r->uri() === 'api/v1/cart' && in_array('GET', $r->methods(), true));

        $this->assertNotNull($route, 'GET /cart should exist.');

        $throttles = collect($route->gatherMiddleware())
            ->filter(fn ($m) => is_string($m) && str_starts_with($m, 'throttle:'));

        $this->assertNotEmpty(
            $throttles,
            'GET /cart mints a cart row on every tokenless request, so it must carry a rate limit.'
        );
    }
}
