<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterGroup;
use App\Models\NewsletterLink;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Newsletter\TrackingRewriter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Resending a campaign to the people who did not open it.
 *
 * What is worth pinning: the audience is exactly the non-openers **minus
 * whoever has since become unmailable** — one who unsubscribed, one who was
 * suppressed, and of course one who opened — because a resend that reached
 * somebody who left the list between the two sends is the complaint this
 * module is shaped around avoiding. And that it is a campaign like any
 * other: one resend per campaign, only of a sent one, through the same
 * health gate, and the pair point at each other on the wire.
 */
class NewsletterResendTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'nell-resend@example.test'],
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

    private function subscriber(string $email, NewsletterGroup $group): NewsletterSubscriber
    {
        $s = NewsletterSubscriber::create(['email' => $email]);
        $s->groups()->attach($group->id);

        return $s;
    }

    private const ADDRESS = '12 Park Street, Kolkata 700016';

    /** The message every fixture carries: enough text, an unsubscribe link and the postal address the health gate wants. */
    private function html(string $extra = ''): string
    {
        return '<html><body><p>'.str_repeat('Readable words. ', 20).'</p>'.$extra
            .'<a href="{{unsubscribe_url}}">Unsubscribe</a><p>'.self::ADDRESS.'</p></body></html>';
    }

    /** A sent campaign whose recipients are the given subscribers, none opened yet. */
    private function sentCampaign(NewsletterGroup $group, array $subscribers): NewsletterCampaign
    {
        Setting::updateOrCreate(['key' => 'newsletter_address'],
            ['value' => self::ADDRESS, 'group' => 'newsletter', 'type' => 'string', 'is_secret' => false]);
        Setting::flushCache();

        $campaign = NewsletterCampaign::create([
            'name' => 'September news',
            'subject' => 'A subject long enough to pass',
            'html_content' => $this->html(),
            'text_content' => str_repeat('Readable words. ', 20),
            'from_name' => 'Technoware',
            'from_email' => 'news@example.test',
            'status' => CampaignStatus::Sent,
            'started_at' => now()->subDay(),
            'completed_at' => now()->subDay(),
            'recipient_count' => count($subscribers),
        ]);
        $campaign->groups()->attach($group->id);

        foreach ($subscribers as $s) {
            $campaign->recipients()->create([
                'newsletter_subscriber_id' => $s->id, 'email' => $s->email, 'status' => 'sent', 'sent_at' => now()->subDay(),
            ]);
        }

        return $campaign;
    }

    /**
     * The audience is the non-openers, re-filtered.
     *
     * Six received it: one opened, one unsubscribed since, one was suppressed
     * since, one bounced (the send marked the row failed, not sent). The
     * resend goes to the other two and nobody else.
     */
    public function test_a_resend_goes_to_the_non_openers_who_can_still_be_mailed(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $opened = $this->subscriber('opened@example.test', $group);
        $left = $this->subscriber('left@example.test', $group);
        $suppressed = $this->subscriber('suppressed@example.test', $group);
        $bounced = $this->subscriber('bounced@example.test', $group);
        $quiet1 = $this->subscriber('quiet1@example.test', $group);
        $quiet2 = $this->subscriber('quiet2@example.test', $group);

        $campaign = $this->sentCampaign($group, [$opened, $left, $suppressed, $bounced, $quiet1, $quiet2]);
        $campaign->recipients()->where('newsletter_subscriber_id', $opened->id)->update(['opened_at' => now()]);
        $campaign->recipients()->where('newsletter_subscriber_id', $bounced->id)->update(['status' => 'failed']);
        $left->update(['status' => SubscriberStatus::Unsubscribed]);
        NewsletterSuppression::add($suppressed->email, SuppressionReason::HardBounce);

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'In case you missed it'])
            ->assertCreated()
            ->assertJsonPath('data.subject', 'In case you missed it')
            ->assertJsonPath('data.subject_b', null)
            ->assertJsonPath('data.name', 'September news — resend')
            ->assertJsonPath('data.status', CampaignStatus::Sending->value)
            ->assertJsonPath('data.recipient_count', 2)
            ->assertJsonPath('data.resend_of.id', $campaign->id);

        $resend = NewsletterCampaign::findOrFail($response->json('data.id'));

        $this->assertSame($campaign->id, $resend->resend_of_id);
        $this->assertEqualsCanonicalizing(
            [$quiet1->id, $quiet2->id],
            $resend->recipients()->pluck('newsletter_subscriber_id')->all(),
        );
        $this->assertSame(2, $resend->recipients()->where('status', 'pending')->count());
        Queue::assertPushed(SendCampaignBatch::class, 1);

        // The pair point at each other, and the original is untouched.
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}")
            ->assertOk()
            ->assertJsonPath('data.resend.id', $resend->id)
            ->assertJsonPath('data.resend.recipient_count', 2)
            ->assertJsonPath('data.resend.status', CampaignStatus::Sending->value)
            ->assertJsonPath('data.resend_of', null);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/report")
            ->assertOk()
            ->assertJsonPath('data.counts.non_openers', 4)
            ->assertJsonPath('data.resend.id', $resend->id)
            ->assertJsonPath('data.resend_of', null);

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson("/api/v1/admin/newsletter/campaigns/{$resend->id}/report")
            ->assertOk()
            ->assertJsonPath('data.resend_of.id', $campaign->id)
            ->assertJsonPath('data.resend_of.name', 'September news');

        $original = $campaign->fresh();
        $this->assertSame(CampaignStatus::Sent, $original->status);
        $this->assertSame(6, $original->recipients()->count());
    }

    /** One resend, ever. A second press is refused, not a third campaign. */
    public function test_a_campaign_is_resent_once(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $campaign = $this->sentCampaign($group, [$this->subscriber('a@example.test', $group)]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'Once more'])
            ->assertCreated();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'And again'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This campaign has already been resent once.');

        $this->assertSame(2, NewsletterCampaign::count());
    }

    /** Only a sent campaign has non-openers. A draft and a sending one are refused. */
    public function test_only_a_sent_campaign_can_be_resent(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $campaign = $this->sentCampaign($group, [$this->subscriber('a@example.test', $group)]);
        $campaign->update(['status' => CampaignStatus::Sending]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'Too early'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Only a campaign that has been sent can be resent.');

        $this->assertSame(1, NewsletterCampaign::count());
    }

    /** Everybody opened it: there is nobody to resend to, and nothing is created. */
    public function test_a_campaign_everybody_opened_has_nobody_to_resend_to(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $campaign = $this->sentCampaign($group, [$this->subscriber('a@example.test', $group)]);
        $campaign->recipients()->update(['opened_at' => now()]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'Nobody'])
            ->assertStatus(422);

        $this->assertSame(1, NewsletterCampaign::count());
        $this->assertNull($campaign->fresh()->resend);
    }

    /**
     * The health gate applies to a resend exactly as to a send.
     *
     * A campaign sent before the address was configured has a footer without
     * one; resending it would go out breaking the same rule the first send
     * should have been stopped by. Refused with the same `errors.health` and
     * nothing is written.
     */
    public function test_a_resend_runs_the_blocking_checks(): void
    {
        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $campaign = $this->sentCampaign($group, [$this->subscriber('a@example.test', $group)]);
        // No unsubscribe link: the first blocking check.
        $campaign->update(['html_content' => '<html><body><p>'.str_repeat('Readable words. ', 20).'</p></body></html>']);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'Unsafe'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This campaign is not ready to send.')
            ->assertJsonStructure(['errors' => ['health']]);

        $this->assertSame(1, NewsletterCampaign::count());
    }

    /**
     * A copy carries the message, never the tracking.
     *
     * A sent campaign's stored HTML has already been through the rewriter —
     * every link points at the original's click rows and the pixel is in it.
     * Copied as-is, a resend (or a duplicate) would report its clicks against
     * the campaign it was copied from and carry two pixels. The copy is put
     * back to the plain links, and prepared afresh when it is queued.
     */
    public function test_a_copy_is_unprepared_and_a_resend_is_prepared_on_its_own_links(): void
    {
        Queue::fake();

        $group = NewsletterGroup::create(['name' => 'Everyone']);
        $campaign = $this->sentCampaign($group, [$this->subscriber('a@example.test', $group)]);
        $plain = $this->html('<a href="https://example.test/offer">Offer</a>');
        $campaign->update(['html_content' => TrackingRewriter::prepare($campaign, $plain)]);
        $this->assertStringContainsString('/newsletter/click/', $campaign->fresh()->html_content);
        $this->assertStringContainsString('/newsletter/open/', $campaign->fresh()->html_content);

        $this->assertSame($plain, TrackingRewriter::unprepare($campaign->fresh()->html_content));

        $id = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/resend", ['subject' => 'Again'])
            ->assertCreated()
            ->json('data.id');

        $resend = NewsletterCampaign::findOrFail($id);
        $links = NewsletterLink::where('newsletter_campaign_id', $resend->id)->get();

        $this->assertCount(1, $links, 'The resend has a click row of its own.');
        $this->assertStringContainsString('/newsletter/click/', $resend->html_content);
        $this->assertStringContainsString('/'.$links->first()->id, $resend->html_content);
        $this->assertSame(1, substr_count((string) $resend->html_content, '/newsletter/open/'), 'One pixel, not two.');

        // And the same for a plain duplicate.
        $copyId = $this->actingAs($this->admin(), 'sanctum')
            ->postJson("/api/v1/admin/newsletter/campaigns/{$campaign->id}/duplicate")
            ->assertCreated()
            ->json('data.id');
        $this->assertSame($plain, NewsletterCampaign::findOrFail($copyId)->html_content);
    }
}
