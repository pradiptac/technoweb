<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\StockMovementReason;
use App\Enums\SuppressionReason;
use App\Jobs\SendWishlistPriceDrops;
use App\Jobs\SyncWishlistStock;
use App\Models\Cart;
use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Models\Wishlist;
use App\Models\WishlistItem;
use App\Notifications\WishlistBackInStock;
use App\Notifications\WishlistPriceDrop;
use App\Support\Store\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The wishlist: a guest's list by token, an account's by the portal bearer,
 * the two merged on sign-in, and the two notices it feeds.
 *
 * What each test pins is a way this goes wrong silently: a line in somebody
 * else's list reachable by counting ids, an account's list handed to whoever
 * holds a stale cookie, a staff member's shopping folded into a customer's
 * account by "View as", a person told the same good news twice, a restock of
 * something that never ran out announced as a return, a price wobble mailed as
 * a drop, and a promotional email sent at midnight.
 *
 * Every request that stands for a signed-in customer carries a **real bearer
 * header**, never `actingAs`: the routes are public, and the guard has to be
 * named for the customer to be seen at all — the trap `CLAUDE.md` records.
 */
class WishlistTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Inside the promotional window, so a test about something else is
        // never quietly deferred by the clock the suite happens to run at.
        $this->travelTo(Carbon::parse('2026-09-25 11:00', 'Asia/Kolkata'));
    }

    private function product(array $attributes = []): StoreProduct
    {
        return StoreProduct::create(array_merge([
            'name' => 'A switch',
            'slug' => 'a-switch-'.uniqid(),
            'sku' => 'SW-'.strtoupper(uniqid()),
            'type' => ProductType::Physical,
            'status' => PublishStatus::Published,
            'price_paise' => 1000000,
            'track_stock' => true,
            'stock' => 5,
        ], $attributes));
    }

    private function customer(string $email = 'neil@example.test', CustomerStatus $status = CustomerStatus::Active): Customer
    {
        $customer = Customer::create([
            'name' => 'Neil Basu', 'email' => $email, 'password' => Hash::make('correct-horse-battery'), 'status' => $status,
        ]);
        $customer->forceFill(['email_verified_at' => now()])->save();

        return $customer;
    }

    private function bearer(Customer $customer): string
    {
        return $customer->createToken('portal', ['portal'])->plainTextToken;
    }

    /** A request carrying exactly the headers given — `withHeaders` is sticky across calls in one test. */
    private function hit(string $method, string $uri, array $body = [], array $headers = [])
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->json($method, $uri, $body, $headers);
    }

    private function add(StoreProduct $product, array $headers = [], ?int $variationId = null)
    {
        return $this->hit('POST', '/api/v1/wishlist/items', ['product_id' => $product->id, 'variation_id' => $variationId], $headers);
    }

    // ------------------------------------------------------------ the list

    public function test_a_read_with_nothing_in_hand_makes_no_row(): void
    {
        $this->hit('GET', '/api/v1/wishlist')
            ->assertOk()
            ->assertJsonPath('data.item_count', 0)
            ->assertJsonPath('data.token', null);

        $this->assertSame(0, Wishlist::count());
    }

    public function test_the_first_heart_mints_a_guest_list_and_a_second_press_is_the_same_line(): void
    {
        $product = $this->product();

        $token = $this->add($product)->assertCreated()->json('data.token');
        $this->assertSame(64, strlen((string) $token));

        $this->add($product, ['X-Wishlist-Token' => $token])
            ->assertCreated()
            ->assertJsonPath('data.item_count', 1)
            ->assertJsonPath('data.items.0.product_id', $product->id)
            ->assertJsonPath('data.items.0.price_at_save_paise', 1000000);

        $this->assertSame(1, Wishlist::count());
        $this->assertSame(1, WishlistItem::count());
    }

    public function test_a_draft_or_another_products_option_is_refused(): void
    {
        $draft = $this->product(['status' => PublishStatus::Draft]);
        $this->add($draft)->assertStatus(422);

        $a = $this->product();
        $b = $this->product();
        $bOption = $b->variations()->create(['name' => '48 port', 'price_paise' => 1500000, 'stock' => 2]);

        $this->add($a, [], $bOption->id)->assertStatus(422);
        $this->assertSame(0, WishlistItem::count());
    }

    public function test_a_line_in_somebody_elses_list_is_a_404(): void
    {
        $product = $this->product();

        $mine = $this->add($product)->json('data.token');
        $theirs = $this->add($product)->json('data.token');
        $theirLine = Wishlist::where('token', $theirs)->first()->items()->first();

        $this->hit('DELETE', "/api/v1/wishlist/items/{$theirLine->id}", [], ['X-Wishlist-Token' => $mine])->assertNotFound();
        $this->hit('POST', "/api/v1/wishlist/items/{$theirLine->id}/move-to-basket", [], ['X-Wishlist-Token' => $mine])->assertNotFound();
        $this->hit('DELETE', "/api/v1/wishlist/items/{$theirLine->id}")->assertNotFound();

        $this->assertTrue(WishlistItem::whereKey($theirLine->id)->exists());

        $this->hit('DELETE', "/api/v1/wishlist/items/{$theirLine->id}", [], ['X-Wishlist-Token' => $theirs])
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    public function test_a_signed_in_customer_keeps_one_list_and_its_token_is_never_sent_or_honoured(): void
    {
        $customer = $this->customer();
        $product = $this->product();

        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($customer)])
            ->assertCreated()
            ->assertJsonPath('data.account', true)
            ->assertJsonPath('data.token', null);

        $list = Wishlist::where('customer_id', $customer->id)->firstOrFail();

        // The account's own token reaches nothing: a cookie left on a shared
        // computer must not open the last customer's list.
        $this->hit('GET', '/api/v1/wishlist', [], ['X-Wishlist-Token' => $list->token])
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);
    }

    // -------------------------------------------------------------- merging

    public function test_the_first_request_carrying_both_merges_the_guest_list_into_the_account(): void
    {
        $customer = $this->customer();
        $a = $this->product();
        $b = $this->product();
        $bearer = 'Bearer '.$this->bearer($customer);

        $this->add($b, ['Authorization' => $bearer]);
        $accountLine = WishlistItem::first();

        $guest = $this->add($a)->json('data.token');
        $this->add($b, ['X-Wishlist-Token' => $guest]);

        $this->hit('GET', '/api/v1/wishlist', [], ['Authorization' => $bearer, 'X-Wishlist-Token' => $guest])
            ->assertOk()
            ->assertJsonPath('data.item_count', 2)
            ->assertJsonPath('data.token', null);

        $this->assertSame(1, Wishlist::count());
        $this->assertSame(2, WishlistItem::count());
        // The line both held keeps the account's row, whose save price is the older.
        $this->assertTrue(WishlistItem::whereKey($accountLine->id)->exists());
    }

    public function test_signing_in_with_the_token_forwarded_merges_the_list(): void
    {
        $customer = $this->customer();
        $product = $this->product();
        $guest = $this->add($product)->json('data.token');

        $this->hit('POST', '/api/v1/auth/login', ['email' => $customer->email, 'password' => 'correct-horse-battery'], ['X-Wishlist-Token' => $guest])
            ->assertOk();

        $list = Wishlist::sole();
        $this->assertSame($customer->id, $list->customer_id);
        $this->assertNotSame($guest, $list->token);
        $this->assertSame(1, $list->items()->count());
    }

    public function test_view_as_never_merges_a_staff_members_shopping_into_the_customers_list(): void
    {
        $customer = $this->customer();
        $product = $this->product();
        $guest = $this->add($product)->json('data.token');

        $impersonation = $customer->createToken('impersonation', ['portal', Customer::IMPERSONATION_ABILITY])->plainTextToken;

        $this->hit('GET', '/api/v1/wishlist', [], ['Authorization' => "Bearer {$impersonation}", 'X-Wishlist-Token' => $guest])
            ->assertOk()
            ->assertJsonPath('data.item_count', 0);

        $this->assertNull(Wishlist::where('token', $guest)->value('customer_id'));
        $this->assertSame(1, Wishlist::where('token', $guest)->first()->items()->count());
    }

    // -------------------------------------------------------- into a basket

    public function test_move_to_basket_puts_one_in_the_basket_and_takes_it_off_the_list(): void
    {
        $product = $this->product();
        $token = $this->add($product)->json('data.token');
        $line = WishlistItem::sole();

        $response = $this->hit('POST', "/api/v1/wishlist/items/{$line->id}/move-to-basket", [], ['X-Wishlist-Token' => $token])
            ->assertOk()
            ->assertJsonPath('data.item_count', 0)
            ->assertJsonPath('cart.item_count', 1);

        $cart = Cart::where('token', $response->json('cart.token'))->firstOrFail();
        $this->assertSame(1, $cart->items()->sole()->quantity);
        $this->assertSame(0, WishlistItem::count());
    }

    public function test_a_product_with_options_saved_without_one_stays_on_the_list(): void
    {
        $product = $this->product();
        $product->variations()->create(['name' => '24 port', 'price_paise' => 1000000, 'stock' => 3]);

        $token = $this->add($product)->json('data.token');
        $line = WishlistItem::sole();

        $this->hit('GET', '/api/v1/wishlist', [], ['X-Wishlist-Token' => $token])
            ->assertJsonPath('data.items.0.needs_choice', true);

        $this->hit('POST', "/api/v1/wishlist/items/{$line->id}/move-to-basket", [], ['X-Wishlist-Token' => $token])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Choose an option before adding this to your basket.');

        $this->assertSame(1, WishlistItem::count());
        $this->assertSame(0, Cart::count());
    }

    // --------------------------------------------------------- back in stock

    public function test_a_movement_queues_the_sync_only_for_a_product_somebody_saved(): void
    {
        $saved = $this->product(['stock' => 0]);
        $unsaved = $this->product(['stock' => 0]);
        $this->add($saved, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);

        Queue::fake();

        StockLedger::record($saved, null, 4, StockMovementReason::Adjustment, 4);
        StockLedger::record($unsaved, null, 4, StockMovementReason::Adjustment, 4);

        Queue::assertPushed(SyncWishlistStock::class, 1);
        Queue::assertPushed(SyncWishlistStock::class, fn (SyncWishlistStock $job) => $job->productId === $saved->id);
    }

    public function test_back_in_stock_tells_the_holder_once_and_re_arms_when_it_runs_out_again(): void
    {
        Notification::fake();

        $customer = $this->customer();
        $product = $this->product(['stock' => 0]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($customer)]);

        $this->assertNotNull(WishlistItem::sole()->awaiting_stock_at, 'Saved while empty, so armed at once.');

        $product->update(['stock' => 4]);
        (new SyncWishlistStock($product->id))->handle();
        (new SyncWishlistStock($product->id))->handle();

        Notification::assertSentOnDemandTimes(WishlistBackInStock::class, 1);
        Notification::assertSentOnDemand(WishlistBackInStock::class, fn ($n, $channels, $notifiable) => $notifiable->routes['mail'] === 'neil@example.test');

        // Sold out: armed again. Back: told again.
        $product->update(['stock' => 0]);
        (new SyncWishlistStock($product->id))->handle();
        $this->assertNotNull(WishlistItem::sole()->awaiting_stock_at);

        $product->update(['stock' => 2]);
        (new SyncWishlistStock($product->id))->handle();

        Notification::assertSentOnDemandTimes(WishlistBackInStock::class, 2);
    }

    public function test_a_restock_of_something_that_never_ran_out_tells_nobody(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 3]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);

        $product->update(['stock' => 10]);
        (new SyncWishlistStock($product->id))->handle();

        Notification::assertNothingSent();
    }

    public function test_a_guest_is_told_only_once_they_give_an_address_and_a_suppressed_one_is_left_owed(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 0]);
        $token = $this->add($product)->json('data.token');

        $product->update(['stock' => 1]);
        (new SyncWishlistStock($product->id))->handle();
        Notification::assertNothingSent();
        $this->assertNotNull(WishlistItem::sole()->awaiting_stock_at, 'A guest with no address is told nothing and stays owed.');

        $this->hit('PATCH', '/api/v1/wishlist', ['email' => 'Guest@Example.test'], ['X-Wishlist-Token' => $token])
            ->assertOk()
            ->assertJsonPath('data.email', 'guest@example.test')
            ->assertJsonPath('data.alerts', true);

        NewsletterSuppression::add('guest@example.test', SuppressionReason::Unsubscribed);
        (new SyncWishlistStock($product->id))->handle();
        Notification::assertNothingSent();
        $this->assertNotNull(WishlistItem::sole()->awaiting_stock_at, 'Suppressed: skipped, not stamped.');

        NewsletterSuppression::query()->delete();
        (new SyncWishlistStock($product->id))->handle();
        Notification::assertSentOnDemandTimes(WishlistBackInStock::class, 1);
    }

    public function test_outside_quiet_hours_it_arms_and_waits_for_the_window(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 0]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);
        $product->update(['stock' => 3]);

        $this->travelTo(Carbon::parse('2026-09-25 23:30', 'Asia/Kolkata'));
        Queue::fake();

        (new SyncWishlistStock($product->id))->handle();

        Notification::assertNothingSent();
        Queue::assertPushed(SyncWishlistStock::class, function (SyncWishlistStock $job) {
            return $job->delay instanceof \DateTimeInterface
                && Carbon::instance($job->delay)->setTimezone('Asia/Kolkata')->format('Y-m-d H:i') === '2026-09-26 09:00';
        });

        $this->travelTo(Carbon::parse('2026-09-26 09:00', 'Asia/Kolkata'));
        (new SyncWishlistStock($product->id))->handle();
        Notification::assertSentOnDemandTimes(WishlistBackInStock::class, 1);
    }

    public function test_the_stop_link_switches_the_lists_emails_off_and_answers_the_same_for_any_token(): void
    {
        Notification::fake();

        $customer = $this->customer();
        $product = $this->product(['stock' => 0]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($customer)]);
        $list = Wishlist::sole();

        $sentence = $this->hit('GET', "/api/v1/wishlist/alerts/{$list->alerts_token}/stop")->assertOk()->json('message');
        $this->hit('GET', '/api/v1/wishlist/alerts/'.str_repeat('a', 64).'/stop')->assertOk()->assertJsonPath('message', $sentence);

        $product->update(['stock' => 5]);
        (new SyncWishlistStock($product->id))->handle();

        Notification::assertNothingSent();
        $this->assertNotNull($list->fresh()->alerts_off_at);
    }

    public function test_an_accounts_list_takes_no_email_of_its_own(): void
    {
        $customer = $this->customer();
        $bearer = 'Bearer '.$this->bearer($customer);
        $this->add($this->product(), ['Authorization' => $bearer]);

        $this->hit('PATCH', '/api/v1/wishlist', ['email' => 'elsewhere@example.test'], ['Authorization' => $bearer])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    // ------------------------------------------------------------ price drop

    public function test_a_price_cut_queues_the_check_for_a_saved_product(): void
    {
        $product = $this->product();
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);

        Queue::fake();

        $product->update(['price_paise' => 1200000]);
        Queue::assertNotPushed(SendWishlistPriceDrops::class);

        $product->update(['price_paise' => 900000]);
        Queue::assertPushed(SendWishlistPriceDrops::class, fn (SendWishlistPriceDrops $job) => $job->productId === $product->id);
    }

    public function test_a_drop_is_told_once_above_the_threshold_and_only_a_further_fall_is_news(): void
    {
        Notification::fake();

        $product = $this->product(['price_paise' => 1000000]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);
        Setting::where('key', 'store_price_drop_min_percent')->update(['value' => '5']);
        Setting::flushCache();

        // 4% off: under the line.
        $product->update(['price_paise' => 960000]);
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertNothingSent();

        // 5% off: told, and told once however often the job runs.
        $product->update(['price_paise' => 950000]);
        (new SendWishlistPriceDrops($product->id))->handle();
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertSentOnDemandTimes(WishlistPriceDrop::class, 1);
        Notification::assertSentOnDemand(WishlistPriceDrop::class, fn (WishlistPriceDrop $n) => $n->oldPaise === 1000000 && $n->newPaise === 950000);

        // Back up and down to the same price: not a new drop.
        $product->update(['price_paise' => 1000000]);
        $product->update(['price_paise' => 950000]);
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertSentOnDemandTimes(WishlistPriceDrop::class, 1);

        // A further 5% below what they were told: news again.
        $product->update(['price_paise' => 900000]);
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertSentOnDemandTimes(WishlistPriceDrop::class, 2);
    }

    public function test_a_price_drop_respects_quiet_hours_and_the_suppression_list(): void
    {
        Notification::fake();

        $customer = $this->customer();
        $product = $this->product(['price_paise' => 1000000]);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($customer)]);

        // Suppressed before the cut: the queue is `sync` here, so the model's
        // own hook runs the job the moment the price is saved.
        NewsletterSuppression::add($customer->email, SuppressionReason::Complaint);
        $product->update(['price_paise' => 800000]);
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertNothingSent();
        $this->assertNull(WishlistItem::sole()->price_drop_notified_paise, 'Suppressed: left unclaimed.');

        NewsletterSuppression::query()->delete();
        $this->travelTo(Carbon::parse('2026-09-25 06:00', 'Asia/Kolkata'));
        Queue::fake();
        (new SendWishlistPriceDrops($product->id))->handle();
        Notification::assertNothingSent();
        Queue::assertPushed(SendWishlistPriceDrops::class);
    }

    // -------------------------------------------------------------- console

    public function test_the_store_dashboard_lists_the_most_wished_products_by_list(): void
    {
        $popular = $this->product(['name' => 'Popular']);
        $option = $popular->variations()->create(['name' => '48 port', 'price_paise' => 1000000, 'stock' => 3]);
        $quiet = $this->product(['name' => 'Quiet']);

        $one = $this->add($popular)->json('data.token');
        // A second line of the same product in the same list is still one wish.
        $this->add($popular, ['X-Wishlist-Token' => $one], $option->id);
        $this->add($popular);
        $this->add($quiet);

        $manager = User::create(['name' => 'Store Manager', 'email' => 'wish-manager@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $manager->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::StoreManager->value], ['name' => RoleEnum::StoreManager->label()]));

        $this->flushHeaders();
        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()
            ->assertJsonPath('data.most_wished.0.name', 'Popular')
            ->assertJsonPath('data.most_wished.0.wishes', 2)
            ->assertJsonPath('data.most_wished.1.wishes', 1);
    }

    public function test_the_prune_takes_old_guest_lists_and_keeps_accounts(): void
    {
        $product = $this->product();
        $this->add($product);
        $this->add($product, ['Authorization' => 'Bearer '.$this->bearer($this->customer())]);

        Wishlist::query()->update(['updated_at' => now()->subDays(200)]);

        $this->artisan('technoware:prune-wishlists')->assertSuccessful();

        $this->assertSame(1, Wishlist::count());
        $this->assertNotNull(Wishlist::sole()->customer_id);
    }
}
