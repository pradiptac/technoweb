<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\EnrolmentStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSequence;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\Sequences;
use App\Support\Newsletter\SubscriberIntake;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Automation sequences.
 *
 * What is worth pinning: that a subscriber goes through a sequence **once**
 * — joining the group twice, or being enrolled by hand again, is a no-op;
 * that the runner sends the due step through the same batch job a campaign
 * uses, advances the cursor by the *next* step's delay and completes after
 * the last; that somebody who unsubscribed between steps is cancelled with
 * a reason and gets no recipient row; and that a step is a campaign row the
 * rest of the module refuses to treat as a campaign — hidden from the index,
 * refused by `queue()`, its status not editable through the campaign
 * endpoint.
 */
class NewsletterSequenceTest extends TestCase
{
    use RefreshDatabase;

    private const ADDRESS = '12 Park Street, Kolkata 700016';

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'nell-sequences@example.test'],
            ['name' => 'Nell Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::Admin->value],
                ['name' => RoleEnum::Admin->label()],
            ));
        }

        return $user;
    }

    private function subscriber(string $email, ?NewsletterGroup $group = null): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email]);

        if ($group) {
            $s->groups()->attach($group->id);
        }

        return $s;
    }

    /** A sequence with the given step delays, each step carrying a message the health gate passes. */
    private function sequence(array $delays, ?NewsletterGroup $group = null, string $status = 'active'): NewsletterSequence
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => self::ADDRESS, 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $sequence = NewsletterSequence::create([
            'name' => 'Welcome series',
            'status' => $status,
            'newsletter_group_id' => $group?->id,
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
        ]);

        foreach ($delays as $i => $delay) {
            $this->step($sequence, $i + 1, $delay);
        }

        return $sequence;
    }

    private function step(NewsletterSequence $sequence, int $position, int $delay): NewsletterCampaign
    {
        return NewsletterCampaign::create([
            'sequence_id' => $sequence->id,
            'sequence_position' => $position,
            'delay_days' => $delay,
            'name' => 'Welcome series — step '.$position,
            'subject' => 'Step '.$position.' of the welcome series',
            'html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20).'</p>'
                .'<a href="{{unsubscribe_url}}">Unsubscribe</a><p>'.self::ADDRESS.'</p></body></html>',
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Automation,
        ]);
    }

    // ------------------------------------------------------------ enrolling

    /** Joining the group enrols; joining it again — a second import — does not. */
    public function test_joining_a_group_with_an_active_sequence_enrols_once(): void
    {
        $group = NewsletterGroup::create(['name' => 'Customers']);
        $sequence = $this->sequence([0, 3], $group);

        $first = SubscriberIntake::take('ann@example.test', ['first_name' => 'Ann'], [$group->id], 'import');
        $this->assertSame(SubscriberIntake::CREATED, $first['outcome']);

        $enrolment = $sequence->enrolments()->sole();
        $this->assertSame($first['subscriber']->id, $enrolment->newsletter_subscriber_id);
        $this->assertSame(1, $enrolment->next_position);
        $this->assertSame(EnrolmentStatus::Active, $enrolment->status);
        // Step one's delay is zero: due now.
        $this->assertTrue($enrolment->next_at->lte(now()));

        // The same address from a second spreadsheet, and from the group screen.
        SubscriberIntake::take('ann@example.test', [], [$group->id], 'import');
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/groups/{$group->id}/members", ['action' => 'add', 'subscriber_ids' => [$first['subscriber']->id]])
            ->assertOk();

        $this->assertSame(1, $sequence->enrolments()->count());

        // And leaving the group and rejoining it is not a second series either.
        $group->subscribers()->detach($first['subscriber']->id);
        SubscriberIntake::take('ann@example.test', [], [$group->id], 'import');
        $this->assertSame(1, $sequence->enrolments()->count());
        $this->assertSame(Sequences::ALREADY_ENROLLED, Sequences::enrol($sequence, $first['subscriber']));
    }

    /** The suppression list wins here as everywhere: a suppressed address is never enrolled. */
    public function test_a_suppressed_subscriber_is_not_enrolled(): void
    {
        $group = NewsletterGroup::create(['name' => 'Customers']);
        $sequence = $this->sequence([0], $group);

        $s = $this->subscriber('gone@example.test');
        NewsletterSuppression::add('gone@example.test', SuppressionReason::Unsubscribed);

        $this->assertSame(Sequences::SUPPRESSED, Sequences::enrol($sequence, $s));

        // A subscriber who is not active is refused too, and a group with
        // nobody in a sequence with no steps enrols nobody.
        $s->update(['status' => SubscriberStatus::Bounced]);
        NewsletterSuppression::where('email', 'gone@example.test')->delete();
        $this->assertSame(Sequences::NOT_ACTIVE, Sequences::enrol($sequence, $s));

        $empty = NewsletterSequence::create(['name' => 'Empty', 'status' => 'active']);
        $this->assertSame(Sequences::NO_STEPS, Sequences::enrol($empty, $this->subscriber('new@example.test')));
        $this->assertSame(0, $sequence->enrolments()->count());
    }

    /** A sequence with no group enrols every new subscriber, whichever group they arrive in. */
    public function test_a_group_less_sequence_enrols_every_new_subscriber(): void
    {
        $sequence = $this->sequence([1]);
        $paused = $this->sequence([1], null, 'paused');
        $other = NewsletterGroup::create(['name' => 'Other']);

        SubscriberIntake::take('one@example.test', [], [], 'signup');
        SubscriberIntake::take('two@example.test', [], [$other->id], 'import');
        // An existing row updated by a later import is not new.
        SubscriberIntake::take('one@example.test', ['company' => 'ABC'], [], 'import');

        $this->assertSame(2, $sequence->enrolments()->count());
        // A paused sequence does not enrol by trigger; its existing enrolments merely wait.
        $this->assertSame(0, $paused->enrolments()->count());
    }

    // ------------------------------------------------------------ the runner

    /**
     * The runner, end to end: step one goes out (a recipient row on the step
     * campaign and the same batch job a campaign uses), the cursor moves to
     * step two by step two's delay, and after the last step the enrolment is
     * completed. Nothing is sent twice however often it runs.
     */
    public function test_the_runner_sends_the_due_step_and_advances_then_completes(): void
    {
        Queue::fake();

        $sequence = $this->sequence([0, 3]);
        $s = $this->subscriber('ann@example.test');
        $this->assertSame(Sequences::ENROLLED, Sequences::enrol($sequence, $s));

        [$one, $two] = $sequence->steps()->get();

        $this->artisan('technoware:run-sequences')->expectsOutputToContain('1 sent, 0 completed, 0 cancelled, 0 held')->assertSuccessful();

        $recipient = $one->recipients()->sole();
        $this->assertSame($s->id, $recipient->newsletter_subscriber_id);
        $this->assertSame('pending', $recipient->status);
        $this->assertNotEmpty($recipient->token);
        Queue::assertPushed(SendCampaignBatch::class, fn (SendCampaignBatch $job) => $job->campaignId === $one->id && $job->recipientIds === [$recipient->id]);

        // The step's HTML was prepared — the pixel is in it, once.
        $this->assertSame(1, substr_count((string) $one->fresh()->html_content, '/newsletter/open/'));

        $enrolment = $sequence->enrolments()->sole();
        $this->assertSame(2, $enrolment->next_position);
        $this->assertSame(EnrolmentStatus::Active, $enrolment->status);
        $this->assertEqualsWithDelta(now()->addDays(3)->timestamp, $enrolment->next_at->timestamp, 5);

        // Not due: a second run sends nothing.
        $this->artisan('technoware:run-sequences')->expectsOutputToContain('0 sent')->assertSuccessful();
        $this->assertSame(0, $two->recipients()->count());
        Queue::assertPushed(SendCampaignBatch::class, 1);

        // The wait passes: step two goes, and that was the last.
        $enrolment->update(['next_at' => now()->subMinute()]);
        $this->artisan('technoware:run-sequences')->expectsOutputToContain('1 sent, 1 completed')->assertSuccessful();

        $this->assertSame(1, $two->recipients()->count());
        $enrolment->refresh();
        $this->assertSame(EnrolmentStatus::Completed, $enrolment->status);
        $this->assertNotNull($enrolment->completed_at);
        Queue::assertPushed(SendCampaignBatch::class, 2);

        // The step is not a campaign: never "done", never completable.
        CampaignSender::completeIfDone($one->fresh());
        $this->assertSame(CampaignStatus::Automation, $one->fresh()->status);
    }

    /** Somebody who unsubscribed between steps is cancelled with the reason, and gets no row. */
    public function test_a_subscriber_who_left_between_steps_is_cancelled_with_a_reason(): void
    {
        Queue::fake();

        $sequence = $this->sequence([0, 0]);
        $left = $this->subscriber('left@example.test');
        $suppressed = $this->subscriber('suppressed@example.test');
        $stays = $this->subscriber('stays@example.test');

        foreach ([$left, $suppressed, $stays] as $s) {
            Sequences::enrol($sequence, $s);
        }

        $left->update(['status' => SubscriberStatus::Unsubscribed]);
        NewsletterSuppression::add('suppressed@example.test', SuppressionReason::HardBounce);

        $this->artisan('technoware:run-sequences')->expectsOutputToContain('1 sent, 0 completed, 2 cancelled')->assertSuccessful();

        $one = $sequence->steps()->first();
        $this->assertSame([$stays->id], $one->recipients()->pluck('newsletter_subscriber_id')->all());

        $cancelled = $sequence->enrolments()->where('status', 'cancelled')->get()->keyBy('newsletter_subscriber_id');
        $this->assertSame('The subscriber is Unsubscribed.', $cancelled[$left->id]->cancelled_reason);
        $this->assertSame('The address is on the do-not-mail list.', $cancelled[$suppressed->id]->cancelled_reason);

        // A paused sequence's enrolments wait: nothing goes, nothing is cancelled.
        $sequence->update(['status' => 'paused']);
        $this->artisan('technoware:run-sequences')->expectsOutputToContain('0 sent, 0 completed, 0 cancelled')->assertSuccessful();
        $this->assertSame(EnrolmentStatus::Active, $sequence->enrolments()->where('newsletter_subscriber_id', $stays->id)->sole()->status);
    }

    /** A step that would be refused as a campaign is not sent as a step: held, and the run says so. */
    public function test_a_step_failing_a_blocking_check_is_held(): void
    {
        Queue::fake();

        $sequence = $this->sequence([0]);
        $step = $sequence->steps()->first();
        $step->update(['html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20).'</p></body></html>']);
        Sequences::enrol($sequence, $this->subscriber('ann@example.test'));

        $this->artisan('technoware:run-sequences')->expectsOutputToContain('0 sent, 0 completed, 0 cancelled, 1 held')->assertSuccessful();

        $this->assertSame(0, $step->recipients()->count());
        $this->assertSame(1, $sequence->enrolments()->where('next_position', 1)->where('status', 'active')->count());
        Queue::assertNothingPushed();
    }

    // ------------------------------------------------------------ the API

    /** Manual enrolment by ids, by a group, and by pasted addresses, with a count per outcome. */
    public function test_manual_enrolment_by_group_and_by_ids_and_by_address(): void
    {
        $group = NewsletterGroup::create(['name' => 'Customers']);
        $sequence = $this->sequence([1]);

        $a = $this->subscriber('a@example.test', $group);
        $b = $this->subscriber('b@example.test', $group);
        $c = $this->subscriber('c@example.test');
        $d = $this->subscriber('d@example.test');
        $d->update(['status' => SubscriberStatus::Bounced]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrol", ['group_id' => $group->id])
            ->assertOk()
            ->assertJsonPath('data.enrolled', 2);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrol", [
                'subscriber_ids' => [$a->id, $c->id],
                'emails' => ['D@example.test', 'nobody@example.test'],
            ])
            ->assertOk()
            ->assertJsonPath('data.enrolled', 1)
            ->assertJsonPath('data.already_enrolled', 1)
            ->assertJsonPath('data.not_active', 1)
            ->assertJsonPath('data.unknown', 1);

        $this->assertEqualsCanonicalizing(
            [$a->id, $b->id, $c->id],
            $sequence->enrolments()->pluck('newsletter_subscriber_id')->all(),
        );

        // Nothing named is a 422, not an enrolment of nobody.
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrol", [])
            ->assertStatus(422);

        // The enrolments list, and cancelling one.
        $enrolment = $sequence->enrolments()->where('newsletter_subscriber_id', $b->id)->sole();
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrolments?status=active")
            ->assertOk()
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('meta.total', 3);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrolments/{$enrolment->id}/cancel")
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.cancelled_reason', 'Cancelled by staff.');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/enrolments/{$enrolment->id}/cancel")
            ->assertStatus(422);
    }

    /** The steps: added at the end, reordered by id, delay edited here, removed with the rest renumbered. */
    public function test_steps_are_created_reordered_and_removed_through_the_sequence(): void
    {
        $id = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/newsletter/sequences', [
                'name' => 'Onboarding', 'from_name' => 'Technoware', 'from_email' => 'news@example.test',
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.steps', [])
            ->json('data.id');

        foreach ([['Welcome', 0], ['Getting set up', 2], ['Anything we can help with?', 7]] as [$subject, $delay]) {
            $this->actingAs($this->admin(), 'sanctum')
                ->postJson("/api/v1/admin/newsletter/sequences/{$id}/steps", ['subject' => $subject, 'delay_days' => $delay])
                ->assertCreated();
        }

        $sequence = NewsletterSequence::findOrFail($id);
        $steps = $sequence->steps()->get();
        $this->assertSame([1, 2, 3], $steps->pluck('sequence_position')->all());
        $this->assertSame(CampaignStatus::Automation, $steps[0]->status);
        $this->assertSame('Technoware', $steps[0]->from_name, 'The sender is the sequence\'s.');
        $this->assertSame('Onboarding — step 2', $steps[1]->name);

        // Reorder: the third first.
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/sequences/{$id}/steps/reorder", ['ids' => [$steps[2]->id, $steps[0]->id, $steps[1]->id]])
            ->assertOk()
            ->assertJsonPath('data.steps.0.subject', 'Anything we can help with?')
            ->assertJsonPath('data.steps.0.position', 1)
            ->assertJsonPath('data.steps.2.position', 3);

        // Not naming every step is refused.
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/sequences/{$id}/steps/reorder", ['ids' => [$steps[0]->id]])
            ->assertStatus(422);

        // The delay is edited here; the content through the campaign editor.
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/sequences/{$id}/steps/{$steps[1]->id}", ['delay_days' => 5])
            ->assertOk();
        $this->assertSame(5, $steps[1]->fresh()->delay_days);

        // Remove the middle one and the rest close up.
        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/sequences/{$id}/steps/{$steps[0]->id}")
            ->assertNoContent();
        $this->assertSame([1, 2], $sequence->steps()->pluck('sequence_position')->all());
        $this->assertNull(NewsletterCampaign::find($steps[0]->id));

        // A step of another sequence is a 404 here.
        $other = $this->sequence([0]);
        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/sequences/{$id}/steps/{$other->steps()->first()->id}")
            ->assertNotFound();
    }

    /** A step is a campaign row the rest of the module refuses to treat as a campaign. */
    public function test_a_step_is_hidden_from_the_index_and_never_sent_as_a_campaign(): void
    {
        $sequence = $this->sequence([0]);
        $step = $sequence->steps()->first();
        $plain = NewsletterCampaign::create(['name' => 'Plain', 'subject' => 'A plain campaign', 'status' => CampaignStatus::Draft]);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/newsletter/campaigns')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $plain->id);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/newsletter/dashboard')
            ->assertOk()
            ->assertJsonPath('data.campaigns.total', 1);

        $result = CampaignSender::queue($step);
        $this->assertFalse($result['queued']);
        $this->assertStringContainsString('automation sequence', $result['reason']);
        $this->assertSame(CampaignStatus::Automation, $step->fresh()->status);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$step->id}/send")
            ->assertStatus(422);

        // Content is editable through the campaign endpoint; status is not.
        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$step->id}", ['subject' => 'A better subject line'])
            ->assertOk()
            ->assertJsonPath('data.subject', 'A better subject line')
            ->assertJsonPath('data.sequence.id', $sequence->id)
            ->assertJsonPath('data.sequence.position', 1);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/campaigns/{$step->id}", ['status' => 'ready'])
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/campaigns/{$step->id}")
            ->assertStatus(422);

        // A detail read of an ordinary campaign says it is no step.
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$plain->id}")
            ->assertOk()
            ->assertJsonPath('data.sequence', null);
    }

    /** Deleting is refused while anybody is still enrolled. */
    public function test_a_sequence_with_active_enrolments_cannot_be_deleted(): void
    {
        $sequence = $this->sequence([1]);
        Sequences::enrol($sequence, $this->subscriber('ann@example.test'));

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/sequences/{$sequence->id}")
            ->assertStatus(422);

        $sequence->enrolments()->update(['status' => 'cancelled']);

        $this->actingAs($this->admin(), 'sanctum')
            ->deleteJson("/api/v1/admin/newsletter/sequences/{$sequence->id}")
            ->assertNoContent();

        $this->assertNull(NewsletterSequence::find($sequence->id));
        $this->assertSame(0, NewsletterCampaign::where('sequence_id', $sequence->id)->count(), 'The steps went with it.');
    }

    /** Switching a sequence on runs the blocking checks on every step, naming the one that fails. */
    public function test_activating_a_sequence_runs_the_blocking_checks_on_its_steps(): void
    {
        $sequence = $this->sequence([0, 1], null, 'paused');
        $two = $sequence->steps()->get()[1];
        $two->update(['html_content' => '<p>No unsubscribe link here.</p>']);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/sequences/{$sequence->id}", ['status' => 'active'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Step 2 is not ready to send.')
            ->assertJsonStructure(['errors' => ['health']]);

        $this->assertSame('paused', $sequence->fresh()->status->value);

        $two->update(['html_content' => $sequence->steps()->first()->html_content]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/newsletter/sequences/{$sequence->id}", ['status' => 'active', 'from_name' => 'The team'])
            ->assertOk()
            ->assertJsonPath('data.status', 'active');

        $this->assertSame('The team', $two->fresh()->from_name, 'The sender reaches every step.');
    }

    /** The report: per step sent/opened/clicked off the recipient rows, and the enrolments by status. */
    public function test_the_report_counts_per_step_and_per_enrolment_status(): void
    {
        $sequence = $this->sequence([0, 2]);
        [$one, $two] = $sequence->steps()->get();
        $a = $this->subscriber('a@example.test');
        $b = $this->subscriber('b@example.test');

        $one->recipients()->createMany([
            ['newsletter_subscriber_id' => $a->id, 'email' => $a->email, 'status' => 'sent', 'opened_at' => now(), 'clicked_at' => now()],
            ['newsletter_subscriber_id' => $b->id, 'email' => $b->email, 'status' => 'sent'],
        ]);
        $sequence->enrolments()->createMany([
            ['newsletter_subscriber_id' => $a->id, 'next_position' => 2, 'next_at' => now()->addDay(), 'status' => 'active', 'enrolled_at' => now()],
            ['newsletter_subscriber_id' => $b->id, 'next_position' => 2, 'next_at' => now()->addDay(), 'status' => 'cancelled', 'enrolled_at' => now()],
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/sequences/{$sequence->id}/report")
            ->assertOk()
            ->assertExactJson(['data' => [
                'sequence' => ['id' => $sequence->id, 'name' => 'Welcome series', 'status' => 'active'],
                'steps' => [
                    ['id' => $one->id, 'position' => 1, 'subject' => 'Step 1 of the welcome series', 'delay_days' => 0, 'sent' => 2, 'opened' => 1, 'clicked' => 1],
                    ['id' => $two->id, 'position' => 2, 'subject' => 'Step 2 of the welcome series', 'delay_days' => 2, 'sent' => 0, 'opened' => 0, 'clicked' => 0],
                ],
                'enrolments' => ['active' => 1, 'completed' => 0, 'cancelled' => 1],
            ]]);

        // The index and the detail carry the counts the list draws.
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/newsletter/sequences')
            ->assertOk()
            ->assertJsonPath('data.0.steps_count', 2)
            ->assertJsonPath('data.0.active_enrolments', 1);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/sequences/{$sequence->id}")
            ->assertOk()
            ->assertJsonPath('data.enrolments.active', 1)
            ->assertJsonPath('data.steps.0.sent_count', 2);
    }

    /** The runner is the scheduler's, every ten minutes, or nothing is ever sent. */
    public function test_the_runner_is_scheduled_every_ten_minutes(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($e) => str_contains((string) $e->command, 'technoware:run-sequences'));

        $this->assertCount(1, $events, 'the sequence runner is not scheduled');
        $this->assertSame('*/10 * * * *', $events->first()->expression);
    }

    /** The newsletter's role reaches it; the content manager does not. */
    public function test_sequences_are_gated_on_the_campaign_manager_role(): void
    {
        $editor = User::create(['name' => 'Ed', 'email' => 'ed-seq@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $editor->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]));

        $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/newsletter/sequences')->assertForbidden();

        $manager = User::create(['name' => 'Cam', 'email' => 'cam-seq@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $manager->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::CampaignManager->value], ['name' => RoleEnum::CampaignManager->label()]));

        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/admin/newsletter/sequences')->assertOk();
    }
}
