<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\StockMovementReason;
use App\Enums\SuppressionReason;
use App\Jobs\SendStockNotices;
use App\Models\Customer;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\StockNotice;
use App\Models\StoreProduct;
use App\Models\User;
use App\Notifications\BackInStock;
use App\Support\Store\StockLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * "Email me when this is back."
 *
 * Three things a feature like this gets wrong silently, each pinned here:
 * the request answering differently for an address it recognises (a
 * membership oracle, so every case answers 202 and only one writes), a
 * person told twice because two movements queued two jobs (the stamp is
 * per row, so the second job finds nothing), and an unsubscribe that does
 * not hold across every kind of message the site sends (the suppression
 * list is read at send time, not only at request time).
 */
class StockNoticeTest extends TestCase
{
    use RefreshDatabase;

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
            'stock' => 0,
        ], $attributes));
    }

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-notices@example.test'],
            ['name' => 'Store Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function ask(StoreProduct $product, array $body)
    {
        return $this->postJson("/api/v1/store/products/{$product->slug}/notify", $body);
    }

    // ------------------------------------------------------------ asking

    public function test_every_request_answers_202_and_only_a_real_one_writes(): void
    {
        $out = $this->product(['stock' => 0]);
        $in = $this->product(['stock' => 5]);
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $sentence = 'Thank you. If it comes back into stock, we will email you once.';

        // A new address: written.
        $this->ask($out, ['email' => 'Neil@Example.test'])->assertStatus(202)->assertJsonPath('message', $sentence);
        // The same address again: the same row.
        $this->ask($out, ['email' => 'neil@example.test'])->assertStatus(202)->assertJsonPath('message', $sentence);
        // A suppressed address: accepted, never written.
        $this->ask($out, ['email' => 'gone@example.test'])->assertStatus(202)->assertJsonPath('message', $sentence);
        // A filled honeypot: the ordinary answer, nothing stored.
        $this->ask($out, ['email' => 'bot@example.test', 'website' => 'http://spam.test'])->assertStatus(202)->assertJsonPath('message', $sentence);
        // A product that is in stock: nothing to wait for.
        $this->ask($in, ['email' => 'eager@example.test'])->assertStatus(202)->assertJsonPath('message', $sentence);

        $notice = StockNotice::sole();

        $this->assertSame('neil@example.test', $notice->email);
        $this->assertSame($out->id, $notice->store_product_id);
        $this->assertNull($notice->store_product_variation_id);
        $this->assertNull($notice->customer_id);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $notice->token);
    }

    public function test_a_back_ordered_shelf_and_an_unknown_variation_write_nothing(): void
    {
        $oversold = $this->product(['stock' => 0, 'allow_oversell' => true]);
        $this->ask($oversold, ['email' => 'neil@example.test'])->assertStatus(202);

        $product = $this->product(['stock' => 0]);
        $this->ask($product, ['email' => 'neil@example.test', 'variation_id' => 9999])->assertStatus(202);

        $this->assertDatabaseCount('stock_notices', 0);
    }

    public function test_a_signed_in_customer_is_stamped_and_a_repeat_re_arms_a_notified_row(): void
    {
        $product = $this->product(['stock' => 0]);
        $customer = Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test',
            'password' => bcrypt('x'), 'status' => CustomerStatus::Active,
        ]);

        // A real bearer token, not `actingAs`: the route is public, so the
        // guard has to be named for the customer to be seen at all.
        $token = $customer->createToken('portal')->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$token}")
            ->ask($product, ['email' => 'neil@example.test'])
            ->assertStatus(202);

        $notice = StockNotice::sole();
        $this->assertSame($customer->id, $notice->customer_id);

        $notice->forceFill(['notified_at' => now()->subDay()])->save();

        $this->flushHeaders()->ask($product, ['email' => 'neil@example.test'])->assertStatus(202);

        $this->assertDatabaseCount('stock_notices', 1);
        $this->assertNull($notice->fresh()->notified_at);
    }

    // ---------------------------------------------------------- the trigger

    public function test_a_positive_movement_queues_the_job_and_a_negative_one_does_not(): void
    {
        Queue::fake();

        $product = $this->product(['stock' => 3]);
        $variation = $product->variations()->create(['name' => '48 port', 'sku' => 'SW-48', 'stock' => 0]);

        StockLedger::record($product, null, -2, StockMovementReason::Adjustment, 1);
        Queue::assertNothingPushed();

        StockLedger::record($product, $variation, 4, StockMovementReason::Adjustment, 4);

        Queue::assertPushed(SendStockNotices::class, fn (SendStockNotices $job) => $job->productId === $product->id && $job->variationId === $variation->id);
    }

    /** Through the form, the way an editor actually restocks: the level typed on the product. */
    public function test_raising_the_stock_on_the_product_form_queues_the_job(): void
    {
        Queue::fake();

        $product = $this->product(['stock' => 0]);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/products/{$product->id}", ['stock' => 12])
            ->assertOk();

        Queue::assertPushed(SendStockNotices::class, fn (SendStockNotices $job) => $job->productId === $product->id && $job->variationId === null);
    }

    // -------------------------------------------------------------- the job

    public function test_the_job_sends_once_per_row_skips_the_suppressed_and_stamps_what_it_sent(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 0]);
        $waiting = StockNotice::arm($product, null, 'neil@example.test', null);
        $suppressed = StockNotice::arm($product, null, 'gone@example.test', null);
        $told = StockNotice::arm($product, null, 'already@example.test', null);
        $told->forceFill(['notified_at' => now()->subDay()])->save();
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        // Still out of stock: nothing goes.
        (new SendStockNotices($product->id))->handle();
        Notification::assertNothingSent();
        $this->assertNull($waiting->fresh()->notified_at);

        $product->update(['stock' => 6]);

        (new SendStockNotices($product->id))->handle();

        Notification::assertSentOnDemand(BackInStock::class, fn (BackInStock $n, array $channels, object $notifiable) => $notifiable->routes['mail'] === 'neil@example.test'
            && $n->product->is($product) && $n->notice->is($waiting));
        Notification::assertSentOnDemandTimes(BackInStock::class, 1);

        $this->assertNotNull($waiting->fresh()->notified_at);
        // Suppressed: neither sent nor stamped, so a lifted suppression is
        // still owed its notice.
        $this->assertNull($suppressed->fresh()->notified_at);

        // Running again — a second movement in the same minute — tells nobody twice.
        (new SendStockNotices($product->id))->handle();
        Notification::assertSentOnDemandTimes(BackInStock::class, 1);
    }

    public function test_a_variation_arriving_tells_those_waiting_on_it_and_on_any(): void
    {
        Notification::fake();

        $product = $this->product(['stock' => 0]);
        $small = $product->variations()->create(['name' => '24 port', 'sku' => 'SW-24', 'stock' => 0]);
        $large = $product->variations()->create(['name' => '48 port', 'sku' => 'SW-48', 'stock' => 0]);

        StockNotice::arm($product, $small, 'small@example.test', null);
        StockNotice::arm($product, $large, 'large@example.test', null);
        StockNotice::arm($product, null, 'any@example.test', null);

        $large->update(['stock' => 2]);

        (new SendStockNotices($product->id, $large->id))->handle();

        $sentTo = [];
        Notification::assertSentOnDemand(BackInStock::class, function (BackInStock $n, array $channels, object $notifiable) use (&$sentTo) {
            $sentTo[] = $notifiable->routes['mail'];

            return true;
        });

        sort($sentTo);
        $this->assertSame(['any@example.test', 'large@example.test'], $sentTo);
        $this->assertNull(StockNotice::where('email', 'small@example.test')->sole()->notified_at);
    }

    public function test_the_email_names_the_product_the_price_and_the_cancel_link(): void
    {
        config(['app.frontend_url' => 'https://www.technoware.in']);

        $product = $this->product(['name' => 'Cisco CBS350', 'slug' => 'cisco-cbs350', 'stock' => 4, 'price_paise' => 2360000]);
        $notice = StockNotice::arm($product, null, 'neil@example.test', null);

        $mail = (new BackInStock($notice, $product))->toMail((object) []);
        $rendered = $mail->render()->toHtml();

        $this->assertSame('Cisco CBS350 is back in stock', $mail->subject);
        $this->assertStringContainsString('₹23,600', $rendered);
        $this->assertStringContainsString('https://www.technoware.in/store/products/cisco-cbs350', $rendered);
        $this->assertStringContainsString("https://www.technoware.in/store/notify/cancel/{$notice->token}", $rendered);
        // Still a link: mail lines are text under secured encoding, and this
        // is the one line that deliberately carries Markdown.
        $this->assertStringContainsString("href=\"https://www.technoware.in/store/notify/cancel/{$notice->token}\"", $rendered);
    }

    // -------------------------------------------------------------- cancel

    public function test_cancel_removes_the_notice_and_is_idempotent(): void
    {
        $product = $this->product(['stock' => 0]);
        $notice = StockNotice::arm($product, null, 'neil@example.test', null);
        StockNotice::arm($product, null, 'other@example.test', null);

        $this->getJson("/api/v1/store/stock-notices/{$notice->token}/cancel")
            ->assertOk()
            ->assertJsonPath('message', 'Done. We will not email you about that product.');

        $this->assertDatabaseMissing('stock_notices', ['id' => $notice->id]);
        $this->assertDatabaseCount('stock_notices', 1);

        // Again, and with a token nobody has: the same answer.
        $this->getJson("/api/v1/store/stock-notices/{$notice->token}/cancel")->assertOk();
        $this->getJson('/api/v1/store/stock-notices/'.str_repeat('0', 64).'/cancel')->assertOk();
    }

    // ------------------------------------------------------------- console

    public function test_the_console_counts_the_waiting_filters_on_them_and_the_dashboard_names_them(): void
    {
        $wanted = $this->product(['stock' => 0]);
        $quiet = $this->product(['stock' => 0]);
        StockNotice::arm($wanted, null, 'one@example.test', null);
        StockNotice::arm($wanted, null, 'two@example.test', null);
        StockNotice::arm($quiet, null, 'told@example.test', null)->forceFill(['notified_at' => now()])->save();

        $manager = $this->manager();

        $index = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/products')
            ->assertOk()
            ->json('data');

        $byId = collect($index)->keyBy('id');
        $this->assertSame(2, $byId[$wanted->id]['notices_waiting']);
        $this->assertSame(0, $byId[$quiet->id]['notices_waiting']);

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/products?notices=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $wanted->id);

        $this->actingAs($manager, 'sanctum')
            ->getJson("/api/v1/admin/store/products/{$wanted->id}")
            ->assertOk()
            ->assertJsonPath('data.notices_waiting', 2);

        $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/dashboard')
            ->assertOk()
            ->assertJsonPath('data.attention.awaiting_stock', 1);
    }
}
