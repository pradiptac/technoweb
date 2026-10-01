<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Models\NewsletterGroup;
use App\Models\NewsletterRejoinRequest;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\User;
use App\Notifications\NewsletterRejoinRequested;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Somebody who unsubscribed, coming back by signing up again and confirming
 * from their inbox (docs/newsletter.md, "Rejoining after an unsubscribe").
 *
 * The rules worth pinning: the signup still answers every address alike; the
 * signup alone changes nothing; only the person's own unsubscribe is ever
 * lifted; and the email cannot be used to pester an address.
 */
class NewsletterRejoinTest extends TestCase
{
    use RefreshDatabase;

    private NewsletterGroup $general;

    protected function setUp(): void
    {
        parent::setUp();

        $this->general = NewsletterGroup::create(['name' => 'General newsletter', 'slug' => 'general-newsletter']);
    }

    /** Subscribed, then unsubscribed through their own link. */
    private function leaver(string $email = 'left@example.test'): NewsletterSubscriber
    {
        $subscriber = SubscriberIntake::take($email, ['first_name' => 'Lee'], [], 'import')['subscriber'];
        $this->postJson("/api/v1/newsletter/unsubscribe/{$subscriber->unsubscribe_token}")->assertOk();

        return $subscriber->fresh();
    }

    private function signUp(string $email, array $extra = []): void
    {
        $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email, ...$extra])->assertStatus(202);
    }

    /** The raw token the email carried — the table holds only its hash. */
    private function tokenSentTo(string $email): string
    {
        $token = null;

        Notification::assertSentOnDemand(NewsletterRejoinRequested::class, function (NewsletterRejoinRequested $n, array $channels, object $notifiable) use ($email, &$token) {
            if ($notifiable->routes['mail'] !== $email) {
                return false;
            }
            $token = $n->token;

            return true;
        });

        return (string) $token;
    }

    public function test_an_unsubscribed_address_signing_up_is_mailed_a_link_and_nothing_else_changes(): void
    {
        Notification::fake();
        $subscriber = $this->leaver();

        $new = $this->postJson('/api/v1/newsletter/subscribe', ['email' => 'fresh@example.test'])->assertStatus(202);
        $back = $this->postJson('/api/v1/newsletter/subscribe', ['email' => 'LEFT@example.test'])->assertStatus(202);

        // The same bytes as for a new address: nothing here says who unsubscribed.
        $this->assertSame($new->getContent(), $back->getContent());

        Notification::assertSentOnDemandTimes(NewsletterRejoinRequested::class, 1);
        $token = $this->tokenSentTo('left@example.test');
        $this->assertSame(64, strlen($token));

        // Hashed at rest, and the signup itself moved nothing.
        $row = NewsletterRejoinRequest::sole();
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertSame([$this->general->id], $row->group_ids);
        $this->assertTrue(NewsletterSuppression::has('left@example.test'));
        $this->assertSame(SubscriberStatus::Unsubscribed, $subscriber->fresh()->status);
        $this->assertFalse($subscriber->fresh()->groups()->exists());
    }

    public function test_following_the_link_lifts_the_unsubscribe_and_is_idempotent(): void
    {
        Notification::fake();
        $subscriber = $this->leaver();
        $this->signUp('left@example.test');
        $token = $this->tokenSentTo('left@example.test');

        $this->getJson("/api/v1/newsletter/rejoin/{$token}")
            ->assertOk()->assertJsonPath('data.email', 'left@example.test')->assertJsonPath('data.confirmed', false);

        $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertOk()->assertJsonPath('data.email', 'left@example.test');

        $subscriber->refresh();
        $this->assertFalse(NewsletterSuppression::has('left@example.test'));
        $this->assertSame(SubscriberStatus::Active, $subscriber->status);
        $this->assertNull($subscriber->unsubscribed_at);
        $this->assertTrue($subscriber->groups()->whereKey($this->general->id)->exists());
        $this->assertNotNull(NewsletterRejoinRequest::sole()->confirmed_at);

        // A second press — a double click, a mail client fetching twice — says the same.
        $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertOk();
        $this->getJson("/api/v1/newsletter/rejoin/{$token}")->assertOk()->assertJsonPath('data.confirmed', true);
        $this->assertSame(SubscriberStatus::Active, $subscriber->fresh()->status);
    }

    /** A kept link cannot be replayed to undo a later unsubscribe. */
    public function test_an_old_link_is_dead_once_they_unsubscribe_again(): void
    {
        Notification::fake();
        $subscriber = $this->leaver();
        $this->signUp('left@example.test');
        $token = $this->tokenSentTo('left@example.test');
        $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertOk();

        $this->postJson("/api/v1/newsletter/unsubscribe/{$subscriber->unsubscribe_token}")->assertOk();

        $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertNotFound();
        $this->assertTrue(NewsletterSuppression::has('left@example.test'));
    }

    /** A subscriber row deleted since is re-created by the confirmation. */
    public function test_a_deleted_subscriber_row_comes_back(): void
    {
        Notification::fake();
        $this->leaver()->delete();

        $this->signUp('left@example.test', ['first_name' => 'Lee']);
        $this->postJson('/api/v1/newsletter/rejoin/'.$this->tokenSentTo('left@example.test'))->assertOk();

        $subscriber = NewsletterSubscriber::where('email', 'left@example.test')->sole();
        $this->assertSame(SubscriberStatus::Active, $subscriber->status);
        $this->assertSame('Lee', $subscriber->first_name);
    }

    public function test_an_unknown_or_expired_link_is_one_neutral_404(): void
    {
        Notification::fake();
        $this->leaver();
        $this->signUp('left@example.test');
        $token = $this->tokenSentTo('left@example.test');

        $unknown = $this->postJson('/api/v1/newsletter/rejoin/'.str_repeat('a', 64))->assertNotFound();
        $this->postJson('/api/v1/newsletter/rejoin/short')->assertNotFound();

        $this->travel(8)->days();

        $expired = $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertNotFound();
        $this->getJson("/api/v1/newsletter/rejoin/{$token}")->assertNotFound();

        $this->assertSame($unknown->getContent(), $expired->getContent());
        $this->assertTrue(NewsletterSuppression::has('left@example.test'));
    }

    /** A complaint, a bounce and a desk entry are never the signup's to undo. */
    public function test_a_complaint_or_a_bounce_is_silently_ignored(): void
    {
        Notification::fake();

        foreach ([
            'spam@example.test' => SuppressionReason::Complaint,
            'dead@example.test' => SuppressionReason::HardBounce,
            'desk@example.test' => SuppressionReason::Manual,
        ] as $email => $reason) {
            NewsletterSuppression::add($email, $reason);
            $this->signUp($email);
        }

        Notification::assertNothingSent();
        $this->assertSame(0, NewsletterRejoinRequest::count());
        $this->assertSame(3, NewsletterSuppression::count());
        $this->assertSame(0, NewsletterSubscriber::count());
    }

    /** A link issued while it was an unsubscribe cannot lift a complaint that replaced it. */
    public function test_a_link_cannot_lift_a_suppression_that_is_no_longer_an_unsubscribe(): void
    {
        Notification::fake();
        $this->leaver();
        $this->signUp('left@example.test');
        $token = $this->tokenSentTo('left@example.test');

        NewsletterSuppression::where('email', 'left@example.test')->update(['reason' => SuppressionReason::Complaint->value]);

        $this->postJson("/api/v1/newsletter/rejoin/{$token}")->assertNotFound();
        $this->assertTrue(NewsletterSuppression::has('left@example.test'));
    }

    public function test_one_confirmation_per_address_per_day(): void
    {
        Notification::fake();
        $this->leaver();

        $this->signUp('left@example.test');
        $this->signUp('left@example.test');
        $this->signUp('left@example.test');

        Notification::assertSentOnDemandTimes(NewsletterRejoinRequested::class, 1);
        $first = $this->tokenSentTo('left@example.test');

        $this->travel(25)->hours();
        $this->signUp('left@example.test');

        Notification::assertSentOnDemandTimes(NewsletterRejoinRequested::class, 2);

        // The newer link retires the older one.
        $this->assertSame(1, NewsletterRejoinRequest::count());
        $this->postJson("/api/v1/newsletter/rejoin/{$first}")->assertNotFound();
    }

    public function test_a_honeypot_signup_sends_nothing(): void
    {
        Notification::fake();
        $this->leaver();

        $this->signUp('left@example.test', ['website' => 'https://spam.example']);

        Notification::assertNothingSent();
        $this->assertSame(0, NewsletterRejoinRequest::count());
    }

    /** Staff still cannot lift an unsubscribe — that stays the person's. */
    public function test_staff_still_cannot_lift_an_unsubscribe(): void
    {
        $row = NewsletterSuppression::add('left@example.test', SuppressionReason::Unsubscribed);

        $admin = User::create(['name' => 'Nell Admin', 'email' => 'nell-rejoin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $admin->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$row->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['message' => 'This address unsubscribed itself. Only they can undo that — ask them to sign up again on the site, and confirm from the email we send them.']);
    }
}
