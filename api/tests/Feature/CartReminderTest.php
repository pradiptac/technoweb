<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SuppressionReason;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\User;
use App\Notifications\CartReminder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use PHPUnit\Framework\AssertionFailedError;
use Tests\TestCase;

/**
 * Abandoned baskets: the contact typed at the checkout, the two reminders, the
 * restore link and what counts as a recovery.
 *
 * What a feature like this gets wrong silently is *who* it mails, so most of
 * this file is the command's selection, each rule from both sides: the switch,
 * the quiet hours, the idle clock, the consent stamp, the suppression list, an
 * order already placed, an emptied basket, a basket too stale to wake — and
 * that sending a reminder does not itself move the idle clock the prune and
 * the second reminder read.
 */
class CartReminderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        // Noon IST on a weekday: inside the 09:00–21:00 promotional window.
        $this->travelTo(Carbon::parse('2026-09-25 12:00:00', 'Asia/Kolkata'));
        Notification::fake();
    }

    private function setting(string $key, ?string $value): void
    {
        Setting::where('key', $key)->firstOrFail()->forceFill(['value' => $value])->save();
    }

    private function switchOn(): void
    {
        $this->setting('store_cart_reminders_enabled', '1');
    }

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

    /**
     * A basket with a line in it and a consented guest address, idle for as
     * long as asked.
     */
    private function basket(array $attributes = [], ?Carbon $idleSince = null): Cart
    {
        $cart = Cart::create(array_merge([
            'token' => Cart::newToken(),
            'email' => 'neil@example.test',
            'contact_consent_at' => now()->subDay(),
        ], $attributes));

        $cart->items()->create(['store_product_id' => $this->product()->id, 'quantity' => 2]);

        $cart->forceFill(['updated_at' => $idleSince ?? now()->subHours(2)])->saveQuietly();

        return $cart->fresh();
    }

    private function remind(): void
    {
        $this->artisan('technoware:remind-abandoned-carts')->assertSuccessful();
    }

    private function sentOnDemand(string $email, int $number): bool
    {
        try {
            Notification::assertSentOnDemand(
                CartReminder::class,
                fn (CartReminder $n, array $channels, $notifiable) => $n->number === $number
                    && ($notifiable->routes['mail'] ?? null) === $email,
            );

            return true;
        } catch (AssertionFailedError) {
            return false;
        }
    }

    // ------------------------------------------------------ the contact

    public function test_the_contact_is_saved_field_by_field_and_consent_follows_the_switch(): void
    {
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $this->product()->id])
            ->assertCreated()->json('data.token');

        // Switched off: kept, but nobody was told a reminder might follow.
        $this->withHeader('X-Cart-Token', $token)
            ->patchJson('/api/v1/cart/contact', ['email' => 'Neil@Example.test'])
            ->assertOk()
            ->assertJsonPath('data.contact.email', 'neil@example.test')
            ->assertJsonPath('data.contact.reminders', false);

        $cart = Cart::where('token', $token)->sole();
        $this->assertSame('neil@example.test', $cart->email);
        $this->assertNull($cart->contact_consent_at);

        // Switched on, the same address saved again is stamped.
        $this->switchOn();
        $this->withHeader('X-Cart-Token', $token)
            ->patchJson('/api/v1/cart/contact', ['email' => 'neil@example.test'])
            ->assertOk()
            ->assertJsonPath('data.contact.reminders', true);
        $this->assertNotNull($cart->fresh()->contact_consent_at);

        // The phone alone leaves the email where it was.
        $this->withHeader('X-Cart-Token', $token)
            ->patchJson('/api/v1/cart/contact', ['phone' => '+91 98765  43210'])
            ->assertOk()
            ->assertJsonPath('data.contact.phone', '+91 98765 43210')
            ->assertJsonPath('data.contact.email', 'neil@example.test');

        // The checkout's own mobile rule.
        $this->withHeader('X-Cart-Token', $token)
            ->patchJson('/api/v1/cart/contact', ['phone' => '12345'])
            ->assertStatus(422)->assertJsonValidationErrors('phone');

        // A cleared address withdraws it, consent and all.
        $this->withHeader('X-Cart-Token', $token)
            ->patchJson('/api/v1/cart/contact', ['email' => ''])
            ->assertOk();
        $this->assertNull($cart->fresh()->email);
        $this->assertNull($cart->fresh()->contact_consent_at);
    }

    public function test_a_signed_in_customer_claims_an_unclaimed_basket_and_view_as_does_not(): void
    {
        $customer = Customer::create([
            'name' => 'Priya Sharma', 'email' => 'priya@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);

        // A real bearer header: the route is public, so the guard has to be
        // named for the customer to be seen at all.
        $portal = $customer->createToken('portal', ['portal'])->plainTextToken;
        $cart = $this->basket(['email' => null]);

        $this->withHeaders(['X-Cart-Token' => $cart->token, 'Authorization' => "Bearer {$portal}"])
            ->getJson('/api/v1/cart')->assertOk();

        $this->assertSame($customer->id, $cart->fresh()->customer_id);
        // Claiming is not activity: the idle clock stays where it was.
        $this->assertTrue($cart->fresh()->updated_at->equalTo($cart->updated_at));

        // A staff member's "View as" token claims nothing.
        $this->app['auth']->forgetGuards();
        $viewAs = $customer->createToken(Customer::IMPERSONATION_TOKEN, ['portal', Customer::IMPERSONATION_ABILITY])->plainTextToken;
        $other = $this->basket(['email' => null]);

        $this->flushHeaders()
            ->withHeaders(['X-Cart-Token' => $other->token, 'Authorization' => "Bearer {$viewAs}"])
            ->getJson('/api/v1/cart')->assertOk();

        $this->assertNull($other->fresh()->customer_id);
    }

    // ------------------------------------------------------- the command

    public function test_the_first_reminder_goes_after_the_delay_and_not_before(): void
    {
        $this->switchOn();
        $due = $this->basket([], now()->subHours(2));
        $early = $this->basket(['email' => 'early@example.test'], now()->subMinutes(30));

        $this->remind();

        $this->assertTrue($this->sentOnDemand('neil@example.test', 1));
        $this->assertFalse($this->sentOnDemand('early@example.test', 1));

        $due->refresh();
        $this->assertSame(1, $due->reminders_sent);
        $this->assertNotNull($due->last_reminded_at);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', (string) $due->restore_token);
        $this->assertNotSame($due->token, $due->restore_token);
        // The reminder did not move the idle clock.
        $this->assertTrue($due->updated_at->equalTo(now()->subHours(2)));
        $this->assertSame(0, $early->fresh()->reminders_sent);

        // A second run tells nobody twice.
        Notification::fake();
        $this->remind();
        Notification::assertNothingSent();
    }

    public function test_nothing_goes_while_switched_off_or_outside_the_hours(): void
    {
        $this->basket();

        $this->remind();
        Notification::assertNothingSent();

        $this->switchOn();
        $this->travelTo(Carbon::parse('2026-09-25 23:30:00', 'Asia/Kolkata'));
        $this->basket(['email' => 'late@example.test'], now()->subHours(3));

        $this->remind();
        Notification::assertNothingSent();

        // The morning run sends what the night held back.
        $this->travelTo(Carbon::parse('2026-09-26 09:05:00', 'Asia/Kolkata'));
        $this->remind();
        $this->assertTrue($this->sentOnDemand('late@example.test', 1));
    }

    public function test_who_is_never_reminded(): void
    {
        $this->switchOn();

        // An address typed while no line promised a reminder.
        $this->basket(['email' => 'unconsented@example.test', 'contact_consent_at' => null]);
        // On the do-not-mail list.
        $this->basket(['email' => 'gone@example.test']);
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);
        // Already an order.
        $order = Order::create([
            'order_number' => Order::nextNumber(), 'status' => OrderStatus::PendingPayment, 'customer_name' => 'X', 'customer_email' => 'x@example.test',
            'subtotal_paise' => 100, 'total_paise' => 100, 'taxable_paise' => 85, 'gst_paise' => 15, 'placed_at' => now(),
        ]);
        $this->basket(['email' => 'ordered@example.test', 'recovered_order_id' => $order->id]);
        // Emptied.
        $empty = $this->basket(['email' => 'empty@example.test']);
        $empty->items()->delete();
        // Left long before reminders were switched on.
        $this->basket(['email' => 'stale@example.test'], now()->subDays(10));
        // No contact at all.
        $this->basket(['email' => null]);

        $this->remind();

        Notification::assertNothingSent();
    }

    public function test_an_account_holder_is_reminded_at_the_accounts_address(): void
    {
        $this->switchOn();
        $customer = Customer::create([
            'name' => 'Priya Sharma', 'email' => 'priya@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);
        $this->basket(['email' => null, 'contact_consent_at' => null, 'customer_id' => $customer->id]);

        $this->remind();

        $this->assertTrue($this->sentOnDemand('priya@example.test', 1));
    }

    public function test_the_second_reminder_waits_its_days_and_a_gap_after_the_first(): void
    {
        $this->switchOn();
        $this->setting('store_cart_reminder_2_days', '2');

        $cart = $this->basket([], now()->subDays(3));
        // Reminded eleven hours ago — the late-switch-on case, or a first
        // reminder the quiet hours held overnight. Too soon for another.
        Cart::whereKey($cart->id)->toBase()->update(['reminders_sent' => 1, 'last_reminded_at' => now()->subHours(11), 'restore_token' => Cart::newToken()]);

        $this->remind();
        Notification::assertNothingSent();

        $this->travel(1)->hours();
        $this->remind();
        $this->assertTrue($this->sentOnDemand('neil@example.test', 2));
        $this->assertSame(2, $cart->fresh()->reminders_sent);

        // And there is no third.
        Notification::fake();
        $this->travel(5)->days();
        $this->travelTo(now()->setTime(12, 0));
        $this->remind();
        Notification::assertNothingSent();
    }

    public function test_the_second_reminder_carries_the_coupon_only_while_the_basket_can_use_it(): void
    {
        $this->switchOn();
        Coupon::create(['code' => 'COMEBACK10', 'type' => 'percentage', 'value' => 10, 'is_active' => true]);
        Coupon::create(['code' => 'BIGONLY', 'type' => 'percentage', 'value' => 10, 'is_active' => true, 'minimum_order_paise' => 99_000_000]);

        $this->setting('store_cart_reminder_coupon', 'COMEBACK10');
        $usable = $this->basket(['email' => 'usable@example.test'], now()->subDays(2));
        Cart::whereKey($usable->id)->toBase()->update(['reminders_sent' => 1, 'last_reminded_at' => now()->subDay(), 'restore_token' => Cart::newToken()]);

        $this->remind();

        Notification::assertSentOnDemand(CartReminder::class, fn (CartReminder $n) => $n->number === 2 && $n->couponCode === 'COMEBACK10');

        Notification::fake();
        $this->setting('store_cart_reminder_coupon', 'BIGONLY');
        $small = $this->basket(['email' => 'small@example.test'], now()->subDays(2));
        Cart::whereKey($small->id)->toBase()->update(['reminders_sent' => 1, 'last_reminded_at' => now()->subDay(), 'restore_token' => Cart::newToken()]);

        $this->remind();

        Notification::assertSentOnDemand(CartReminder::class, fn (CartReminder $n) => $n->number === 2 && $n->couponCode === null);
    }

    public function test_the_email_restores_the_basket_and_unsubscribes_by_the_restore_token(): void
    {
        $this->switchOn();
        $cart = $this->basket();
        $this->remind();

        $cart->refresh();
        $mail = (new CartReminder($cart, 1))->toMail(new AnonymousNotifiable);
        $html = (string) $mail->render();

        $this->assertStringContainsString('/store/basket/restore/'.$cart->restore_token, $html);
        $this->assertStringContainsString('/newsletter/unsubscribe/'.$cart->restore_token, $html);
        $this->assertStringNotContainsString($cart->token, $html);

        // Restore answers the basket's own token for the cookie.
        $this->getJson("/api/v1/cart/restore/{$cart->restore_token}")
            ->assertOk()->assertJsonPath('data.token', $cart->token);
        $this->getJson('/api/v1/cart/restore/'.str_repeat('a', 64))->assertNotFound();
        $this->getJson("/api/v1/cart/restore/{$cart->token}")->assertNotFound();

        // The newsletter's own unsubscribe route takes the same token.
        $this->getJson("/api/v1/newsletter/unsubscribe/{$cart->restore_token}")
            ->assertOk()->assertJsonPath('data.email', 'neil@example.test')->assertJsonPath('data.already', false);
        $this->postJson("/api/v1/newsletter/unsubscribe/{$cart->restore_token}")->assertOk();
        $this->assertTrue(NewsletterSuppression::has('neil@example.test'));
    }

    // -------------------------------------------------------- recovery

    public function test_the_checkout_stamps_the_basket_and_a_recovered_basket_does_not_restore(): void
    {
        $product = $this->product();
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id])->assertCreated()->json('data.token');

        $number = $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '9876543210',
            'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
        ])->assertCreated()->json('data.order_number');

        $cart = Cart::where('token', $token)->sole();
        $this->assertSame(Order::where('order_number', $number)->value('id'), $cart->recovered_order_id);

        $cart->forceFill(['restore_token' => Cart::newToken()])->saveQuietly();
        $this->getJson("/api/v1/cart/restore/{$cart->restore_token}")->assertNotFound();
    }

    public function test_the_dashboard_counts_recoveries_only_among_reminded_baskets_and_is_null_before_any(): void
    {
        $manager = User::create(['name' => 'Store', 'email' => 'store-rem@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $manager->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::StoreManager->value], ['name' => RoleEnum::StoreManager->label()]));

        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()->assertJsonPath('data.recovered', null);

        $paid = Order::create([
            'order_number' => Order::nextNumber(), 'status' => OrderStatus::Paid, 'customer_name' => 'X', 'customer_email' => 'x@example.test',
            'subtotal_paise' => 500000, 'total_paise' => 500000, 'taxable_paise' => 423729, 'gst_paise' => 76271,
            'placed_at' => now(), 'paid_at' => now(),
        ]);
        $unreminded = Order::create([
            'order_number' => Order::nextNumber(), 'status' => OrderStatus::Paid, 'customer_name' => 'Y', 'customer_email' => 'y@example.test',
            'subtotal_paise' => 900000, 'total_paise' => 900000, 'taxable_paise' => 762712, 'gst_paise' => 137288,
            'placed_at' => now(), 'paid_at' => now(),
        ]);

        Cart::create(['token' => Cart::newToken(), 'reminders_sent' => 1, 'last_reminded_at' => now()->subDay(), 'recovered_order_id' => $paid->id]);
        Cart::create(['token' => Cart::newToken(), 'reminders_sent' => 2, 'last_reminded_at' => now()->subDay()]);
        // An order from a basket nobody was reminded about is not a recovery.
        Cart::create(['token' => Cart::newToken(), 'recovered_order_id' => $unreminded->id]);

        $this->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()
            ->assertJsonPath('data.recovered.reminded', 2)
            ->assertJsonPath('data.recovered.recovered', 1)
            ->assertJsonPath('data.recovered.revenue_paise', 500000)
            ->assertJsonPath('data.recovered.rate', 0.5);
    }

    public function test_the_prune_keeps_a_reminded_basket_for_the_dashboards_window(): void
    {
        $plain = Cart::create(['token' => Cart::newToken()]);
        $reminded = Cart::create(['token' => Cart::newToken(), 'reminders_sent' => 1, 'last_reminded_at' => now()->subDays(39)]);
        $ancient = Cart::create(['token' => Cart::newToken(), 'reminders_sent' => 2, 'last_reminded_at' => now()->subDays(95)]);

        foreach ([$plain, $reminded] as $cart) {
            $cart->forceFill(['updated_at' => now()->subDays(40)])->saveQuietly();
        }
        $ancient->forceFill(['updated_at' => now()->subDays(100)])->saveQuietly();

        $this->artisan('technoware:prune-carts')->assertSuccessful();

        $this->assertDatabaseMissing('carts', ['id' => $plain->id]);
        $this->assertDatabaseHas('carts', ['id' => $reminded->id]);
        $this->assertDatabaseMissing('carts', ['id' => $ancient->id]);
    }

    // -------------------------------------------------------- settings

    public function test_the_settings_refuse_a_delay_past_the_prune_and_an_unknown_coupon(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'rem-admin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $admin->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        $save = fn (string $key, string $value) => $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $value]]]);

        $save('store_cart_reminders_enabled', 'yes')->assertStatus(422);
        $save('store_cart_reminder_2_days', '26')->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $save('store_cart_reminder_1_hours', '0')->assertStatus(422);
        $save('store_cart_reminder_2_days', '25')->assertOk();
        $save('store_cart_reminder_coupon', 'NOPE')->assertStatus(422);

        Coupon::create(['code' => 'COMEBACK10', 'type' => 'percentage', 'value' => 10, 'is_active' => true]);
        $save('store_cart_reminder_coupon', 'comeback10')->assertOk();
        $this->assertSame('COMEBACK10', Setting::get('store_cart_reminder_coupon'));

        // Private: a coupon code on the public map is a discount for anybody.
        $this->assertArrayNotHasKey('store_cart_reminder_coupon', $this->getJson('/api/v1/settings')->json('data'));
    }
}
