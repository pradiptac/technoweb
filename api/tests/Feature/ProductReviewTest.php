<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\ReviewStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SuppressionReason;
use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\Order;
use App\Models\ProductReview;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Notifications\ReviewRequested;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Reviews on the shop's products (`docs/store-reviews-plan.md`).
 *
 * What each test pins is something that fails silently: a review from
 * nobody, two from one person, a badge nobody earned, a pending review on a
 * product page, a card whose stars disagree with the reviews under it, and
 * a "How was it?" email about a parcel still in the warehouse.
 */
class ProductReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'sku' => 'SW-'.strtoupper(uniqid()),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1180000,
            'track_stock' => true,
            'stock' => 5,
        ], $attributes));
    }

    private function customer(string $email = 'neil@example.test', string $name = 'Neil Basu'): Customer
    {
        return Customer::create([
            'name' => $name, 'email' => $email,
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);
    }

    private function bearer(Customer $customer): array
    {
        return ['Authorization' => 'Bearer '.$customer->createToken('portal')->plainTextToken];
    }

    /** @param  array<string, mixed>  $attributes */
    private function order(?Customer $customer, StoreProduct $product, array $attributes = [], array $line = []): Order
    {
        $order = Order::create(array_merge([
            'customer_id' => $customer?->id,
            'status' => OrderStatus::Paid,
            'subtotal_paise' => 1180000, 'taxable_paise' => 1000000,
            'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => $customer?->name ?? 'Guest', 'customer_email' => $customer?->email ?? 'guest@example.test',
            'placed_at' => now(),
            'paid_at' => now(),
        ], $attributes));

        $order->items()->create(array_merge([
            'store_product_id' => $product->id,
            'name' => $product->name, 'sku' => $product->sku, 'type' => $product->type,
            'quantity' => 1, 'unit_price_paise' => 1180000, 'line_total_paise' => 1180000,
            'returnable' => true,
        ], $line));

        return $order;
    }

    private function manager(string $role = 'store_manager'): User
    {
        $user = User::create(['name' => 'Staff '.$role, 'email' => "{$role}@example.test", 'password' => 'password-for-tests', 'is_active' => true]);
        $enum = RoleEnum::from($role);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $enum->value], ['name' => $enum->label()]));

        return $user;
    }

    private function write(StoreProduct $product, Customer $customer, array $body)
    {
        return $this->withHeaders($this->bearer($customer))
            ->postJson("/api/v1/store/products/{$product->slug}/reviews", $body);
    }

    private function review(StoreProduct $product, Customer $customer, int $rating, ReviewStatus $status = ReviewStatus::Published, array $extra = []): ProductReview
    {
        return ProductReview::create(array_merge([
            'store_product_id' => $product->id,
            'customer_id' => $customer->id,
            'rating' => $rating,
            'body' => "Rated {$rating}.",
            'display_name' => ProductReview::displayNameFor($customer->name),
            'status' => $status,
            'published_at' => $status === ReviewStatus::Published ? now() : null,
        ], $extra));
    }

    // ------------------------------------------------------------ writing

    public function test_signed_out_and_staff_cannot_write_one(): void
    {
        $product = $this->product();

        $this->postJson("/api/v1/store/products/{$product->slug}/reviews", ['rating' => 5, 'body' => 'Great'])
            ->assertStatus(401);

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/store/products/{$product->slug}/reviews", ['rating' => 5, 'body' => 'Great'])
            ->assertStatus(403);

        $this->assertDatabaseCount('product_reviews', 0);
    }

    public function test_one_review_per_customer_and_an_edit_goes_back_to_the_queue(): void
    {
        $product = $this->product();
        $customer = $this->customer();

        $this->write($product, $customer, ['rating' => 4, 'title' => 'Solid', 'body' => 'Quiet and fast.'])
            ->assertStatus(202)
            ->assertJsonPath('message', 'Thanks — we will publish it once it has been checked.');

        $review = ProductReview::sole();
        $this->assertSame(ReviewStatus::Pending, $review->status);
        $this->assertSame('Neil B.', $review->display_name);
        $this->assertFalse($review->isVerified());

        $review->moveTo(ReviewStatus::Published, $this->manager());
        $review->forceFill(['is_featured' => true])->save();
        $publishedAt = $review->fresh()->published_at;
        $this->assertSame(1, $product->fresh()->rating_count);

        $this->flushHeaders();
        $this->write($product, $customer, ['rating' => 2, 'body' => 'Fan died after a week.'])->assertStatus(202);

        $this->assertDatabaseCount('product_reviews', 1);
        $review = $review->fresh();
        $this->assertSame(ReviewStatus::Pending, $review->status);
        $this->assertSame(2, $review->rating);
        $this->assertNull($review->title);
        $this->assertFalse($review->is_featured, 'an edited review loses the featured flag');
        $this->assertEquals($publishedAt, $review->published_at, 'published_at is never cleared');
        // Back in the queue, so off the product's summary.
        $this->assertSame(0, $product->fresh()->rating_count);
        $this->assertNull($product->fresh()->rating_average);
    }

    public function test_the_honeypot_answers_the_same_and_stores_nothing(): void
    {
        $product = $this->product();

        $this->write($product, $this->customer(), ['rating' => 5, 'body' => 'Great', 'website' => 'http://spam.test'])
            ->assertStatus(202)
            ->assertJsonPath('message', 'Thanks — we will publish it once it has been checked.');

        $this->assertDatabaseCount('product_reviews', 0);
    }

    public function test_validation(): void
    {
        $product = $this->product();

        $this->write($product, $this->customer(), ['rating' => 6, 'body' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rating', 'body']);
    }

    public function test_verified_only_with_a_paid_order_and_the_variant_comes_from_the_line(): void
    {
        $product = $this->product();
        $customer = $this->customer();
        $other = $this->customer('other@example.test', 'Other Person');

        // Unpaid, and somebody else's paid order: neither verifies.
        $this->order($customer, $product, ['status' => OrderStatus::PendingPayment, 'paid_at' => null]);
        $this->order($other, $product);

        $this->withHeaders($this->bearer($customer))
            ->getJson("/api/v1/store/products/{$product->slug}/reviews/mine")
            ->assertOk()
            ->assertJsonPath('data', null)
            ->assertJsonPath('meta.can_review', true)
            ->assertJsonPath('meta.verified', false);

        $this->flushHeaders();
        $this->write($product, $customer, ['rating' => 5, 'body' => 'Good.'])->assertStatus(202);
        $this->assertFalse(ProductReview::sole()->isVerified());

        // Paid now, with a variation on the line: the next edit verifies.
        $paid = $this->order($customer, $product, [], ['variation_name' => 'Black / XL']);

        $this->flushHeaders();
        $this->write($product, $customer, ['rating' => 5, 'body' => 'Good.'])->assertStatus(202);

        $review = ProductReview::sole();
        $this->assertTrue($review->isVerified());
        $this->assertSame($paid->id, $review->order_id);
        $this->assertSame('Black / XL', $review->variant_label);

        $this->flushHeaders();
        $this->withHeaders($this->bearer($customer))
            ->getJson("/api/v1/store/products/{$product->slug}/reviews/mine")
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.verified', true)
            ->assertJsonPath('meta.verified', true);
    }

    public function test_the_variant_label_falls_back_to_the_options(): void
    {
        $product = $this->product();
        $customer = $this->customer();
        $this->order($customer, $product, [], ['options' => ['Colour' => 'Black', 'Size' => 'XL']]);

        $this->write($product, $customer, ['rating' => 4, 'body' => 'Fits.'])->assertStatus(202);

        $this->assertSame('Black / XL', ProductReview::sole()->variant_label);
    }

    public function test_an_unpublished_product_takes_no_reviews(): void
    {
        $product = $this->product(['status' => PublishStatus::Draft]);

        $this->write($product, $this->customer(), ['rating' => 5, 'body' => 'x y'])->assertNotFound();
        $this->getJson("/api/v1/store/products/{$product->slug}/reviews")->assertNotFound();
    }

    // ------------------------------------------------------------ reading

    public function test_only_published_reviews_are_listed_and_nothing_private_travels(): void
    {
        $product = $this->product();
        $a = $this->customer('a@example.test', 'Asha Rao');
        $b = $this->customer('b@example.test', 'Bina Das');
        $c = $this->customer('c@example.test', 'Chand');

        $this->review($product, $a, 5);
        $this->review($product, $b, 1, ReviewStatus::Pending);
        $this->review($product, $c, 3, ReviewStatus::Spam);

        $res = $this->getJson("/api/v1/store/products/{$product->slug}/reviews")->assertOk();

        $res->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.display_name', 'Asha R.')
            ->assertJsonPath('meta.count', 1)
            ->assertJsonPath('meta.average', 5)
            ->assertJsonPath('meta.distribution', ['5' => 1, '4' => 0, '3' => 0, '2' => 0, '1' => 0]);

        $row = $res->json('data.0');
        $this->assertSame(['id', 'display_name', 'verified', 'variant_label', 'rating', 'title', 'body', 'published_at'], array_keys($row));
        $this->assertStringNotContainsString('a@example.test', $res->getContent());
    }

    public function test_the_four_sorts_and_the_unknown_one(): void
    {
        $product = $this->product();
        $mk = fn (string $e) => $this->customer($e, ucfirst(strtok($e, '@')));

        Carbon::setTestNow('2026-09-01 12:00:00');
        $old = $this->review($product, $mk('old@x.test'), 5);
        Carbon::setTestNow('2026-09-10 12:00:00');
        $low = $this->review($product, $mk('low@x.test'), 1);
        Carbon::setTestNow('2026-09-20 12:00:00');
        $mid = $this->review($product, $mk('mid@x.test'), 3, ReviewStatus::Published, ['is_featured' => true]);
        Carbon::setTestNow();

        $ids = fn (string $sort) => collect($this->getJson("/api/v1/store/products/{$product->slug}/reviews?sort={$sort}")->json('data'))->pluck('id')->all();

        $this->assertSame([$mid->id, $old->id, $low->id], $ids('featured'));
        $this->assertSame([$mid->id, $low->id, $old->id], $ids('newest'));
        $this->assertSame([$old->id, $mid->id, $low->id], $ids('highest'));
        $this->assertSame([$low->id, $mid->id, $old->id], $ids('lowest'));
        $this->assertSame($ids('featured'), $ids('nonsense'));
    }

    public function test_six_a_page(): void
    {
        $product = $this->product();

        foreach (range(1, 8) as $i) {
            $this->review($product, $this->customer("p{$i}@x.test", "P {$i}"), 4);
        }

        $this->getJson("/api/v1/store/products/{$product->slug}/reviews")
            ->assertJsonCount(6, 'data')
            ->assertJsonPath('meta.last_page', 2)
            ->assertJsonPath('meta.total', 8);
    }

    public function test_the_summary_follows_publish_unpublish_and_delete(): void
    {
        $product = $this->product();
        $x = $this->review($product, $this->customer('x@x.test', 'X Y'), 5, ReviewStatus::Pending);
        $y = $this->review($product, $this->customer('y@x.test', 'Y Z'), 4, ReviewStatus::Pending);

        $this->assertSame(0, $product->fresh()->rating_count);

        $x->moveTo(ReviewStatus::Published);
        $y->moveTo(ReviewStatus::Published);
        $fresh = $product->fresh();
        $this->assertSame(2, $fresh->rating_count);
        $this->assertSame('4.5', $fresh->rating_average);

        $this->getJson("/api/v1/store/products/{$product->slug}")
            ->assertJsonPath('data.rating', ['average' => 4.5, 'count' => 2]);
        $this->getJson('/api/v1/store/products')
            ->assertJsonPath('data.0.rating', ['average' => 4.5, 'count' => 2]);

        $x->moveTo(ReviewStatus::Rejected);
        $this->assertSame(1, $product->fresh()->rating_count);
        $this->assertSame('4.0', $product->fresh()->rating_average);

        $y->delete();
        $this->assertSame(0, $product->fresh()->rating_count);
        $this->assertNull($product->fresh()->rating_average);

        $this->getJson("/api/v1/store/products/{$product->slug}")->assertJsonPath('data.rating', null);
    }

    public function test_the_product_graph_carries_the_rating_only_when_there_is_one(): void
    {
        $product = $this->product();

        $graph = $this->getJson("/api/v1/store/products/{$product->slug}")->json('data.schema');
        $this->assertArrayNotHasKey('aggregateRating', $graph);
        $this->assertArrayNotHasKey('review', $graph);

        $this->review($product, $this->customer(), 4, ReviewStatus::Published, ['title' => 'Good kit']);
        $this->review($product, $this->customer('p@x.test', 'Pending Person'), 1, ReviewStatus::Pending);

        $graph = $this->getJson("/api/v1/store/products/{$product->slug}")->json('data.schema');
        $this->assertSame(['@type' => 'AggregateRating', 'ratingValue' => '4.0', 'reviewCount' => 1, 'bestRating' => 5, 'worstRating' => 1], $graph['aggregateRating']);
        $this->assertCount(1, $graph['review']);
        $this->assertSame('Neil B.', $graph['review'][0]['author']['name']);
        $this->assertSame(4, $graph['review'][0]['reviewRating']['ratingValue']);
    }

    // ------------------------------------------------------------ the console

    public function test_the_queue_is_store_manager_only(): void
    {
        $this->actingAs($this->manager('content_manager'), 'sanctum')
            ->getJson('/api/v1/admin/store/reviews')->assertForbidden();
    }

    public function test_the_queue_defaults_to_waiting_and_moderation_moves_and_stamps(): void
    {
        $product = $this->product();
        $waiting = $this->review($product, $this->customer('w@x.test', 'W X'), 4, ReviewStatus::Pending);
        $this->review($product, $this->customer('p@x.test', 'P Q'), 5);
        $manager = $this->manager();

        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/admin/store/reviews')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $waiting->id)
            ->assertJsonPath('data.0.customer.email', 'w@x.test')
            ->assertJsonPath('meta.pending_count', 1);

        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/admin/store/reviews?status=all')
            ->assertJsonCount(2, 'data');

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/reviews/moderate', ['ids' => [$waiting->id], 'status' => 'published'])
            ->assertOk()
            ->assertJsonPath('data.moved', 1)
            ->assertJsonPath('data.pending_count', 0)
            ->assertJsonPath('data.slugs', [$product->slug]);

        $waiting = $waiting->fresh();
        $this->assertSame(ReviewStatus::Published, $waiting->status);
        $this->assertNotNull($waiting->published_at);
        $this->assertSame($manager->id, $waiting->moderated_by);
        $this->assertSame(2, $product->fresh()->rating_count);

        $this->actingAs($manager, 'sanctum')
            ->postJson('/api/v1/admin/store/reviews/moderate', ['ids' => [$waiting->id], 'status' => 'nonsense'])
            ->assertStatus(422);

        $this->actingAs($manager, 'sanctum')
            ->patchJson("/api/v1/admin/store/reviews/{$waiting->id}", ['is_featured' => true])
            ->assertOk()
            ->assertJsonPath('data.is_featured', true);

        $this->actingAs($manager, 'sanctum')
            ->deleteJson("/api/v1/admin/store/reviews/{$waiting->id}")
            ->assertNoContent();
        $this->assertSame(1, $product->fresh()->rating_count);
    }

    public function test_the_dashboard_counts_the_queue(): void
    {
        $this->review($this->product(), $this->customer(), 3, ReviewStatus::Pending);

        $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard')
            ->assertJsonPath('data.attention.reviews_pending', 1);
    }

    public function test_the_portal_order_says_which_lines_have_a_review(): void
    {
        $product = $this->product();
        $other = $this->product();
        $customer = $this->customer();
        $order = $this->order($customer, $product);
        $order->items()->create([
            'store_product_id' => $other->id, 'name' => $other->name, 'type' => ProductType::Physical,
            'quantity' => 1, 'unit_price_paise' => 100, 'line_total_paise' => 100, 'returnable' => true,
        ]);
        $this->review($product, $customer, 5, ReviewStatus::Pending);

        $res = $this->withHeaders($this->bearer($customer))
            ->getJson("/api/v1/my/orders/{$order->order_number}")->assertOk();

        $res->assertJsonPath('data.items.0.slug', $product->slug)
            ->assertJsonPath('data.items.0.my_review.status', 'pending')
            ->assertJsonPath('data.items.1.my_review', null);
    }

    // ------------------------------------------------------------ the request email

    private function inWindow(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-26 12:00:00', 'Asia/Kolkata'));
    }

    public function test_the_request_waits_for_the_delay_after_dispatch(): void
    {
        Notification::fake();
        $this->inWindow();
        $customer = $this->customer();
        $product = $this->product();

        $recent = $this->order($customer, $product, ['status' => OrderStatus::Dispatched, 'dispatched_at' => now()->subDays(3)]);
        $undispatched = $this->order($customer, $product, ['paid_at' => now()->subDays(30)]);
        $due = $this->order($customer, $product, ['status' => OrderStatus::Dispatched, 'dispatched_at' => now()->subDays(8)]);

        $this->artisan('technoware:request-reviews')->assertSuccessful();

        $this->assertNull($recent->fresh()->review_requested_at);
        $this->assertNull($undispatched->fresh()->review_requested_at, 'a parcel still in the warehouse is never asked about');
        $this->assertNotNull($due->fresh()->review_requested_at);

        Notification::assertSentOnDemandTimes(ReviewRequested::class, 1);
        Notification::assertSentOnDemand(ReviewRequested::class, fn (ReviewRequested $n, $channels, $notifiable) => $notifiable->routes['mail'] === 'neil@example.test'
            && $n->order->is($due) && count($n->products) === 1);

        // Once per order: a second run sends nothing more.
        $this->artisan('technoware:request-reviews')->assertSuccessful();
        Notification::assertSentOnDemandTimes(ReviewRequested::class, 1);
    }

    public function test_a_digital_only_order_counts_from_payment(): void
    {
        Notification::fake();
        $this->inWindow();
        $customer = $this->customer();
        $licence = $this->product(['type' => ProductType::Digital]);

        $order = $this->order($customer, $licence, ['status' => OrderStatus::Completed, 'paid_at' => now()->subDays(8)]);

        $this->artisan('technoware:request-reviews')->assertSuccessful();

        $this->assertNotNull($order->fresh()->review_requested_at);
        Notification::assertSentOnDemandTimes(ReviewRequested::class, 1);
    }

    public function test_suppressed_reviewed_cancelled_and_guest_orders_are_not_asked(): void
    {
        Notification::fake();
        $this->inWindow();
        $product = $this->product();

        $gone = $this->customer('gone@example.test', 'Gone Away');
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);
        $suppressed = $this->order($gone, $product, ['status' => OrderStatus::Dispatched, 'dispatched_at' => now()->subDays(9)]);

        $done = $this->customer('done@example.test', 'Done Already');
        $this->review($product, $done, 5, ReviewStatus::Pending);
        $reviewed = $this->order($done, $product, ['status' => OrderStatus::Dispatched, 'dispatched_at' => now()->subDays(9)]);

        $cancelled = $this->order($this->customer('c@x.test', 'C D'), $product, ['status' => OrderStatus::Cancelled, 'dispatched_at' => now()->subDays(9)]);
        $guest = $this->order(null, $product, ['status' => OrderStatus::Dispatched, 'dispatched_at' => now()->subDays(9)]);

        $this->artisan('technoware:request-reviews')->assertSuccessful();

        Notification::assertNothingSent();
        // Asked about once, and never again: stamped though nothing went.
        $this->assertNotNull($suppressed->fresh()->review_requested_at);
        $this->assertNotNull($reviewed->fresh()->review_requested_at);
        $this->assertNull($cancelled->fresh()->review_requested_at);
        $this->assertNull($guest->fresh()->review_requested_at);
    }

    public function test_quiet_hours_and_the_switch_hold_the_request(): void
    {
        Notification::fake();
        $customer = $this->customer();
        $order = $this->order($customer, $this->product(), ['status' => OrderStatus::Dispatched, 'dispatched_at' => Carbon::parse('2026-09-10')]);

        Carbon::setTestNow(Carbon::parse('2026-09-26 03:00:00', 'Asia/Kolkata'));
        $this->artisan('technoware:request-reviews')->assertSuccessful();
        $this->assertNull($order->fresh()->review_requested_at);

        $this->inWindow();
        Setting::create(['group' => 'store', 'key' => 'store_review_requests_enabled', 'value' => '0', 'type' => 'boolean']);
        $this->artisan('technoware:request-reviews')->assertSuccessful();
        $this->assertNull($order->fresh()->review_requested_at);

        Notification::assertNothingSent();
    }

    public function test_the_email_links_each_product_with_the_review_flag(): void
    {
        $product = $this->product(['slug' => 'cbs-350']);
        $order = $this->order($this->customer(), $product);

        $mail = (new ReviewRequested($order, [$product]))->toMail(new AnonymousNotifiable);

        $this->assertStringContainsString('/store/products/cbs-350?review=1', (string) $mail->render());
    }
}
