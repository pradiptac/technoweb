<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Models\Cart;
use App\Models\StoreProduct;
use App\Support\Money;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The basket.
 *
 * Two rules run through all of it, and both are the brief's own. **The frontend
 * is never the authority for a price** — nothing about money is stored on a
 * cart line, so every figure is recomputed from the product as it is now. And
 * **a cart is addressed by a token**, so guest checkout works without an
 * account; which makes scoping every line to that token the whole of the
 * authorisation.
 */
class CartTest extends TestCase
{
    use RefreshDatabase;

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 5,
        ], $attributes));
    }

    /** @return array{0: string, 1: array<string, mixed>} */
    private function add(StoreProduct $product, array $payload = [], ?string $token = null): array
    {
        $response = $this
            ->withHeaders($token ? ['X-Cart-Token' => $token] : [])
            ->postJson('/api/v1/cart/items', array_merge(['product_id' => $product->id], $payload))
            ->assertCreated();

        return [$response->json('data.token'), $response->json('data')];
    }

    // ------------------------------------------------------ the token

    public function test_a_basket_is_handed_a_token_and_kept_by_it(): void
    {
        $product = $this->product();

        [$token, $data] = $this->add($product);

        $this->assertSame(64, strlen($token));
        $this->assertSame(1, $data['item_count']);

        $again = $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk();

        $this->assertSame($token, $again->json('data.token'));
        $this->assertSame(1, $again->json('data.item_count'));
    }

    /**
     * A basket somebody else holds the token to is not reachable.
     *
     * The line id is scoped to the cart the token resolves to, and a line
     * belonging to another basket is a **404** rather than a 403 — a 403
     * confirms it exists, which is the whole of what an attacker counting
     * upwards wants to learn.
     */
    public function test_a_line_in_somebody_elses_basket_cannot_be_touched(): void
    {
        $product = $this->product();

        [, $mine] = $this->add($product);
        $lineId = $mine['items'][0]['id'];

        $stranger = Cart::create(['token' => Cart::newToken()]);

        $this->withHeaders(['X-Cart-Token' => $stranger->token])
            ->patchJson("/api/v1/cart/items/{$lineId}", ['quantity' => 99])
            ->assertNotFound();

        $this->withHeaders(['X-Cart-Token' => $stranger->token])
            ->deleteJson("/api/v1/cart/items/{$lineId}")
            ->assertNotFound();
    }

    /** An unknown or malformed token is a new basket, never an error. */
    public function test_an_unknown_token_yields_an_empty_basket(): void
    {
        $response = $this->withHeaders(['X-Cart-Token' => 'not-a-real-token'])
            ->getJson('/api/v1/cart')
            ->assertOk();

        $this->assertSame(0, $response->json('data.item_count'));
        $this->assertSame(64, strlen($response->json('data.token')));
    }

    // ------------------------------------------------------ the arithmetic

    /**
     * The totals are the brief's worked example, computed by the server.
     *
     * GST is extracted from the inclusive total rather than added to it, and
     * the two halves sum to what is payable — which is the property an invoice
     * cannot do without.
     */
    public function test_the_server_works_out_every_figure(): void
    {
        $product = $this->product(['price_paise' => 1180000]);

        [, $data] = $this->add($product);

        $this->assertSame(1180000, $data['subtotal_paise']);
        $this->assertSame(1180000, $data['total_paise']);
        $this->assertSame(1000000, $data['taxable_paise']);
        $this->assertSame(180000, $data['gst_paise']);
        $this->assertSame('18%', $data['gst_rate']);
        $this->assertSame(
            $data['total_paise'],
            $data['taxable_paise'] + $data['gst_paise'],
            'the split does not add back up to what is payable',
        );
    }

    /**
     * A price change reaches a basket that is already full.
     *
     * Nothing about money is stored on a line, so this is not a feature that
     * had to be built — it is what *not* storing a price means. The alternative
     * is honouring a figure the shop has since corrected.
     */
    public function test_a_price_change_reaches_a_basket_already_filled(): void
    {
        $product = $this->product(['price_paise' => 1180000]);

        [$token] = $this->add($product);

        $product->update(['price_paise' => 990000]);

        $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk()
            ->assertJsonPath('data.total_paise', 990000);
    }

    public function test_a_variation_is_priced_at_its_own_price(): void
    {
        $product = $this->product(['price_paise' => 1180000]);
        $variation = $product->variations()->create(['name' => '48-Port', 'price_paise' => 1680000, 'stock' => 2]);

        [, $data] = $this->add($product, ['variation_id' => $variation->id]);

        $this->assertSame(1680000, $data['total_paise']);
        $this->assertSame('48-Port', $data['items'][0]['variation_name']);
    }

    /** A variation with no price of its own is sold at the product's. */
    public function test_a_variation_without_a_price_inherits(): void
    {
        $product = $this->product(['price_paise' => 1180000]);
        $variation = $product->variations()->create(['name' => '24-Port', 'stock' => 2]);

        [, $data] = $this->add($product, ['variation_id' => $variation->id]);

        $this->assertSame(1180000, $data['total_paise']);
    }

    // ------------------------------------------------------ what it refuses

    /**
     * A product with options cannot be bought without choosing one.
     *
     * Falling back to the product would sell "a switch" where the shop only
     * ever offered a 24-port and a 48-port, and somebody in the warehouse then
     * has to guess which was meant.
     */
    public function test_a_product_with_variations_needs_one_chosen(): void
    {
        $product = $this->product();
        $product->variations()->create(['name' => '24-Port', 'stock' => 2]);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])
            ->assertStatus(422);
    }

    /**
     * A variation belonging to another product would price this line from
     * somebody else's row.
     */
    public function test_a_variation_from_another_product_is_refused(): void
    {
        $product = $this->product();
        $other = $this->product(['price_paise' => 100]);
        $stray = $other->variations()->create(['name' => 'Cheap', 'price_paise' => 100, 'stock' => 9]);

        $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id,
            'variation_id' => $stray->id,
        ])->assertStatus(422);
    }

    public function test_a_draft_cannot_be_added(): void
    {
        $product = $this->product(['status' => PublishStatus::Draft]);

        $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])
            ->assertStatus(422);
    }

    // ------------------------------------------------------ stock

    /**
     * Too many is a warning on the line, not a refusal at the door.
     *
     * Somebody adding three when two are left wants the two. The basket says
     * so, and the checkout is where it is refused — which is the moment the
     * stock is actually committed, and the only moment where refusing costs
     * nothing.
     */
    public function test_asking_for_more_than_there_is_warns_rather_than_refuses(): void
    {
        $product = $this->product(['stock' => 2]);

        $response = $this->postJson('/api/v1/cart/items', [
            'product_id' => $product->id, 'quantity' => 3,
        ])->assertCreated();

        $this->assertNotNull($response->json('warning'));
        $this->assertStringContainsString('Only 2', $response->json('data.items.0.problem'));
    }

    public function test_an_untracked_product_never_reports_a_stock_problem(): void
    {
        $product = $this->product([
            'type' => ProductType::Service, 'track_stock' => false, 'stock' => 0,
        ]);

        [, $data] = $this->add($product, ['quantity' => 40]);

        $this->assertNull($data['items'][0]['problem']);
        $this->assertFalse($data['has_shippable'], 'a service does not need a courier');
    }

    // ------------------------------------------------------ editing

    /** Adding the same thing twice is one line, not two. */
    public function test_adding_the_same_thing_twice_increments_one_line(): void
    {
        $product = $this->product(['stock' => 10]);

        [$token] = $this->add($product, ['quantity' => 2]);
        [, $data] = $this->add($product, ['quantity' => 3], $token);

        $this->assertCount(1, $data['items']);
        $this->assertSame(5, $data['items'][0]['quantity']);
    }

    /**
     * Zero removes the line.
     *
     * It has to: otherwise a quantity stepper stops at one and the only way to
     * remove something is a different control somewhere else on the row.
     */
    public function test_a_quantity_of_zero_removes_the_line(): void
    {
        $product = $this->product();

        [$token, $data] = $this->add($product);
        $lineId = $data['items'][0]['id'];

        $this->withHeaders(['X-Cart-Token' => $token])
            ->patchJson("/api/v1/cart/items/{$lineId}", ['quantity' => 0])
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    public function test_a_basket_can_be_emptied(): void
    {
        $product = $this->product();

        [$token] = $this->add($product);

        $this->withHeaders(['X-Cart-Token' => $token])
            ->deleteJson('/api/v1/cart')
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    /**
     * A line whose product has gone is dropped rather than rendered dead.
     *
     * The foreign key cascades, which is right for a cart and wrong for an
     * order: a cart line is a *pointer* at something for sale, and a pointer at
     * a deleted product cannot be priced or bought.
     */
    public function test_deleting_a_product_empties_the_line_pointing_at_it(): void
    {
        $product = $this->product();

        [$token] = $this->add($product);

        $product->delete();

        $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    /** Non-returnable travels with the line, because it is a term of the sale. */
    public function test_a_non_returnable_line_says_so(): void
    {
        $product = $this->product(['returnable' => false]);

        [, $data] = $this->add($product);

        $this->assertFalse($data['items'][0]['returnable']);
    }

    /**
     * A line that has gone out of stock is reported, never quietly dropped.
     *
     * Silently removing it means somebody reaches the payment page with a
     * different basket from the one they built, and the first they know of it
     * is the total.
     */
    public function test_a_line_that_sold_out_is_reported(): void
    {
        $product = $this->product(['stock' => 3]);

        [$token] = $this->add($product, ['quantity' => 2]);

        $product->update(['stock' => 0]);

        $response = $this->withHeaders(['X-Cart-Token' => $token])
            ->getJson('/api/v1/cart')
            ->assertOk();

        $this->assertNotEmpty($response->json('data.problems'));
        // Still there, still two of them. `item_count` sums quantities, which
        // is what a cart badge means by "3 items".
        $this->assertCount(1, $response->json('data.items'), 'the line was dropped instead of reported');
        $this->assertSame(2, $response->json('data.item_count'));
    }

    /** The GST split holds for a basket of several lines at odd prices. */
    public function test_the_split_holds_across_a_mixed_basket(): void
    {
        $a = $this->product(['price_paise' => 299900, 'stock' => 9]);
        $b = $this->product(['price_paise' => 87550, 'stock' => 9]);

        [$token] = $this->add($a, ['quantity' => 3]);
        [, $data] = $this->add($b, ['quantity' => 2], $token);

        $expected = 299900 * 3 + 87550 * 2;

        $this->assertSame($expected, $data['total_paise']);
        $this->assertSame(Money::taxable($expected), $data['taxable_paise']);
        $this->assertSame($expected, $data['taxable_paise'] + $data['gst_paise']);
    }
}
