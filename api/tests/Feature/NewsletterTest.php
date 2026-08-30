<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\AudienceResolver;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\Csv;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The newsletter module.
 *
 * The tests worth having here are not the CRUD ones. This module mails
 * thousands of real people and keeps a do-not-mail list with legal weight, so
 * the failures worth engineering against are: mailing somebody who asked not
 * to be, mailing somebody twice, and losing an unsubscribe.
 */
class NewsletterTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'nell-newsletter@example.test'],
            ['name' => 'Nell Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $role = Role::firstOrCreate(
                ['slug' => RoleEnum::Admin->value],
                ['name' => RoleEnum::Admin->label()],
            );
            $user->roles()->attach($role);
        }

        return $user;
    }

    private function subscriber(string $email, ?NewsletterGroup $group = null, array $attributes = []): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email, ...$attributes]);

        if ($group) {
            $s->groups()->attach($group->id);
        }

        return $s;
    }

    // ---------------------------------------------------------------- intake

    /**
     * The rule with legal weight, and the one every path must obey.
     *
     * Somebody who unsubscribed is on a spreadsheet a colleague uploads six
     * months later. If the import puts them back, the company mails a person
     * who asked it not to — which is the complaint this whole module is shaped
     * around avoiding.
     */
    public function test_a_suppressed_address_is_refused_however_it_arrives(): void
    {
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        foreach (['import', 'manual', 'signup', 'customer'] as $source) {
            $result = SubscriberIntake::take('GONE@Example.test', ['first_name' => 'Back'], [], $source);

            $this->assertSame(SubscriberIntake::SUPPRESSED, $result['outcome'], "source: {$source}");
        }

        $this->assertSame(0, NewsletterSubscriber::count());
    }

    /** Case is not identity. */
    public function test_addresses_are_matched_without_regard_to_case(): void
    {
        SubscriberIntake::take('John@Example.TEST', ['first_name' => 'John']);
        $second = SubscriberIntake::take('john@example.test', []);

        $this->assertSame(SubscriberIntake::DUPLICATE, $second['outcome']);
        $this->assertSame(1, NewsletterSubscriber::count());
        $this->assertSame('john@example.test', NewsletterSubscriber::first()->email);
    }

    /**
     * An import adds what it knows and never clears what it does not.
     *
     * A second spreadsheet with the address but no company column must not
     * erase a company somebody typed in — treating a missing column as an
     * instruction to blank the field is how a list quietly loses everything.
     */
    public function test_an_import_enriches_and_never_blanks(): void
    {
        SubscriberIntake::take('a@example.test', ['first_name' => 'Ann', 'company' => 'ABC Ltd']);
        SubscriberIntake::take('a@example.test', ['first_name' => '', 'company' => '', 'last_name' => 'Lee']);

        $s = NewsletterSubscriber::first();

        $this->assertSame('Ann', $s->first_name);
        $this->assertSame('ABC Ltd', $s->company);
        $this->assertSame('Lee', $s->last_name);
    }

    // -------------------------------------------------------------- audience

    /**
     * Who a campaign reaches, and everything that must be removed first.
     *
     * The one that is easy to get wrong is the duplicate: somebody in two of
     * the chosen groups is one contact and must receive one email.
     */
    public function test_the_audience_excludes_the_unmailable_and_deduplicates(): void
    {
        $a = NewsletterGroup::create(['name' => 'Group A']);
        $b = NewsletterGroup::create(['name' => 'Group B']);

        $both = $this->subscriber('both@example.test', $a);
        $both->groups()->attach($b->id);

        $this->subscriber('ok@example.test', $a);
        $this->subscriber('left@example.test', $a, ['status' => SubscriberStatus::Unsubscribed]);
        $this->subscriber('dead@example.test', $a, ['status' => SubscriberStatus::Bounced]);

        // Active, in the group, and suppressed anyway — the case a status
        // filter alone would let through, and the one a hard bounce creates.
        $this->subscriber('hidden@example.test', $a);
        NewsletterSuppression::add('hidden@example.test', SuppressionReason::HardBounce);

        $eligible = AudienceResolver::eligible([$a->id, $b->id]);

        $this->assertEqualsCanonicalizing(
            ['both@example.test', 'ok@example.test'],
            $eligible->pluck('email')->all(),
        );

        $preview = AudienceResolver::preview([$a->id, $b->id]);

        $this->assertSame(6, $preview['group_contacts']);
        $this->assertSame(1, $preview['duplicates_removed']);
        $this->assertSame(1, $preview['unsubscribed_removed']);
        $this->assertSame(1, $preview['bounced_removed']);
        $this->assertSame(1, $preview['suppressed_removed']);
        $this->assertSame(2, $preview['final_recipients']);
    }

    // ---------------------------------------------------------------- sending

    /**
     * A campaign is never sent twice.
     *
     * The worst mistake this module can make, and there is no undo. Two
     * requests arriving together — a double-click, a retried POST — must
     * produce one send.
     */
    public function test_a_campaign_cannot_be_queued_twice(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = $this->readyCampaign($group);

        $first = CampaignSender::queue($campaign->fresh());
        $second = CampaignSender::queue($campaign->fresh());

        $this->assertTrue($first['queued']);
        $this->assertFalse($second['queued']);
        $this->assertSame(1, $campaign->fresh()->recipients()->count());
    }

    /**
     * Somebody who unsubscribes mid-send does not get the rest of it.
     *
     * The list is frozen when the campaign is queued, and a large one takes
     * minutes to work through — so the recipient's eligibility is checked
     * again inside the batch, immediately before the send.
     */
    public function test_a_recipient_suppressed_after_freezing_is_skipped(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('leaver@example.test', $group);

        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        // They unsubscribe between the freeze and the batch running.
        NewsletterSuppression::add('leaver@example.test', SuppressionReason::Unsubscribed);

        (new SendCampaignBatch($campaign->id, [$recipient->id]))->handle();

        $this->assertSame('skipped', $recipient->fresh()->status);
    }

    // ----------------------------------------------------------- unsubscribe

    /** No login, no confirmation step, and safe to call twice. */
    public function test_unsubscribing_is_idempotent_and_suppresses_the_address(): void
    {
        $s = $this->subscriber('bye@example.test');
        $token = $s->unsubscribe_token;

        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();
        $this->postJson("/api/v1/newsletter/unsubscribe/{$token}")->assertOk();

        $this->assertSame(SubscriberStatus::Unsubscribed, $s->fresh()->status);
        $this->assertSame(1, NewsletterSuppression::count());
    }

    /**
     * The suppression outlives the subscriber row.
     *
     * That is the entire reason suppressions are keyed on the address. Delete
     * somebody and re-import them, and they must stay off the list.
     */
    public function test_a_suppression_survives_deleting_the_subscriber(): void
    {
        $s = $this->subscriber('bye@example.test');
        $this->postJson("/api/v1/newsletter/unsubscribe/{$s->unsubscribe_token}")->assertOk();

        $s->delete();

        $this->assertSame(
            SubscriberIntake::SUPPRESSED,
            SubscriberIntake::take('bye@example.test', [], [], 'import')['outcome'],
        );
    }

    /** Staff may undo a bounce; they may not undo somebody's decision. */
    public function test_staff_cannot_lift_a_suppression_the_person_chose(): void
    {
        $theirs = NewsletterSuppression::add('left@example.test', SuppressionReason::Unsubscribed);
        $ours = NewsletterSuppression::add('dead@example.test', SuppressionReason::HardBounce);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$theirs->id}")
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/suppressions/{$ours->id}")
            ->assertNoContent();
    }

    /** The signup form must not reveal who is already on the list. */
    public function test_signing_up_answers_identically_for_every_address(): void
    {
        $this->subscriber('known@example.test');
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $responses = collect(['new@example.test', 'known@example.test', 'gone@example.test'])
            ->map(fn ($email) => $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email]));

        foreach ($responses as $response) {
            $response->assertStatus(202);
        }

        // Byte-identical, not merely all-successful — the distinction
        // `CustomerRegistrationTest` already makes for the same reason.
        $this->assertCount(1, $responses->map(fn ($r) => $r->getContent())->unique());
    }

    // --------------------------------------------------------- health check

    /**
     * A campaign with no way out is refused, whatever it scores.
     *
     * The blocking checks are the legal ones, and they are re-run on the
     * server at the moment of sending rather than read from a stored number.
     */
    public function test_a_campaign_without_an_unsubscribe_link_cannot_be_sent(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('one@example.test', $group);

        $campaign = NewsletterCampaign::create([
            'name' => 'No way out',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Words that fill the body. ', 20).'</p></body></html>',
            'text_content' => str_repeat('Words that fill the body. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);
        $campaign->groups()->attach($group->id);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/send")
            ->assertStatus(422);

        $this->assertContains('An unsubscribe link', $response->json('errors.health'));
        $this->assertSame(CampaignStatus::Draft, $campaign->fresh()->status);
    }

    /** Scored out of what applies, so a text-only campaign is not punished
     *  for the image checks it can never satisfy. */
    public function test_image_checks_do_not_apply_to_a_campaign_with_no_images(): void
    {
        $campaign = new NewsletterCampaign([
            'subject' => 'A subject of reasonable length',
            'html_content' => '<html><body><p>'.str_repeat('Plenty of readable words here. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Plenty of readable words here. ', 20),
        ]);

        $keys = array_column(HealthCheck::run($campaign)['checks'], 'key');

        $this->assertNotContains('alt_text', $keys);
        $this->assertNotContains('image_ratio', $keys);
    }

    // ---------------------------------------------------------------- safety

    /** An export is opened in Excel, and Excel executes a leading `=`. */
    public function test_csv_export_escapes_formula_injection(): void
    {
        $this->assertSame("'=HYPERLINK(\"http://x\")", Csv::escape('=HYPERLINK("http://x")'));
        $this->assertSame("'+1", Csv::escape('+1'));
        $this->assertSame("'@x", Csv::escape('@x'));
        $this->assertSame('ABC Ltd', Csv::escape('ABC Ltd'));
    }

    /** A mail merge that leaves `{{firstname}}` in somebody's inbox is the
     *  most obviously amateur thing a mailing can do. */
    public function test_unknown_placeholders_are_removed_rather_than_sent(): void
    {
        $out = EmailRenderer::personalise('Hi {{first_name}}, {{firstname}} {{nonsense}}', null);

        $this->assertStringContainsString('Hi there,', $out);
        $this->assertStringNotContainsString('{{', $out);
    }

    /** A test send must not touch the figures the report is drawn from. */
    public function test_a_test_send_creates_no_recipient_and_no_events(): void
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => 'Kolkata', 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);

        $campaign = NewsletterCampaign::create([
            'name' => 'Test only',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>Hello {{first_name}}</p><a href="{{unsubscribe_url}}">Out</a></body></html>',
            'text_content' => 'Hello',
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Draft,
        ]);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/test");

        $response->assertOk();

        $this->assertSame(0, $campaign->recipients()->count());
        $this->assertSame(0, $campaign->events()->count());
        $this->assertNotNull($campaign->fresh()->test_sent_at);
    }

    /** The pixel answers identically whatever the token, so nothing can be
     *  probed with it — and records the open once. */
    public function test_the_open_pixel_is_constant_and_stamps_once(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $this->subscriber('reader@example.test', $group);
        $campaign = $this->readyCampaign($group);
        CampaignSender::queue($campaign->fresh());

        $recipient = $campaign->recipients()->firstOrFail();

        $real = $this->get("/api/v1/newsletter/open/{$recipient->token}")->assertOk();
        $fake = $this->get('/api/v1/newsletter/open/not-a-real-token')->assertOk();

        $this->assertSame($real->getContent(), $fake->getContent());
        $this->assertSame('image/gif', $real->headers->get('Content-Type'));

        $first = $recipient->fresh()->opened_at;
        $this->get("/api/v1/newsletter/open/{$recipient->token}");

        // Stamped once; the second open is an event, not a new timestamp.
        $this->assertEquals($first, $recipient->fresh()->opened_at);
        $this->assertSame(2, $campaign->events()->where('event_type', 'opened')->count());
    }

    private function readyCampaign(NewsletterGroup $group): NewsletterCampaign
    {
        $campaign = NewsletterCampaign::create([
            'name' => 'A campaign',
            'subject' => 'A subject long enough to pass',
            'html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20)
                .'</p><a href="{{unsubscribe_url}}">Unsubscribe</a></body></html>',
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Ready,
        ]);

        $campaign->groups()->attach($group->id);

        return $campaign;
    }
}
