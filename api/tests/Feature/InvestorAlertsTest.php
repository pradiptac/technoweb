<?php

namespace Tests\Feature;

use App\Enums\CampaignStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Entry;
use App\Models\Media;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Presets\InvestorAlerts;
use App\Support\Presets\Presets;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Investor alerts (docs/content-presets.md): one email per document, to the
 * "Investor updates" group, sent as an ordinary campaign.
 */
class InvestorAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        // A postal address and a sender, so the campaign passes its blocking checks.
        Setting::query()->where('key', 'address')->update(['value' => '1 Park Street, Kolkata 700016']);
        Setting::query()->where('key', 'newsletter_from_name')->update(['value' => 'Technoware']);
        Setting::query()->where('key', 'newsletter_from_email')->update(['value' => 'news@example.test']);
        Setting::flushCache();
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/investors')->assertCreated();
    }

    private function staff(): User
    {
        $user = User::firstOrCreate(['email' => 'cm-alerts@example.test'], ['name' => 'Ed', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id]);

        return $user;
    }

    /** @param array<string, mixed> $extra */
    private function document(array $extra = []): Entry
    {
        $pdf = Media::firstOrCreate(['path' => 'media/r.pdf'], ['filename' => 'r.pdf', 'mime' => 'application/pdf', 'size' => 10, 'disk' => 'public']);
        $id = $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/investors/entries', [
            'title' => 'Q2 results', 'status' => 'published',
            'custom_fields' => ['document_type' => 'financial_results', 'financial_year' => '2026-27', 'document' => $pdf->path],
            ...$extra,
        ])->assertCreated()->json('data.id');

        return Entry::findOrFail($id);
    }

    private function subscriber(string $email = 'investor@example.test'): void
    {
        $this->postJson('/api/v1/newsletter/subscribe', ['email' => $email, 'list' => 'investors'])->assertStatus(202);
    }

    public function test_signup_with_the_investors_list_lands_in_the_investor_group(): void
    {
        $this->subscriber();

        $this->assertTrue(Presets::investorGroup()->subscribers()->where('email', 'investor@example.test')->exists());
    }

    public function test_the_switch_sends_one_alert_when_the_document_is_published(): void
    {
        $this->subscriber();
        $entry = $this->document(['alert_on_publish' => true]);
        $this->artisan('technoware:send-investor-alerts')->assertSuccessful();
        $this->artisan('technoware:send-investor-alerts')->assertSuccessful();

        $fresh = $entry->fresh();
        $this->assertNotNull($fresh->alert_sent_at);
        $this->assertNull($fresh->alert_error);
        $this->assertSame(1, NewsletterCampaign::query()->count());
        $this->assertStringContainsString('Q2 results', (string) NewsletterCampaign::query()->value('subject'));
        $this->assertSame((int) NewsletterCampaign::query()->value('id'), (int) $fresh->alert_campaign_id);
    }

    public function test_a_scheduled_document_alerts_once_when_it_goes_live(): void
    {
        $this->subscriber();
        $entry = $this->document(['alert_on_publish' => true, 'published_at' => now()->addDay()->format('Y-m-d H:i:s')]);
        $this->artisan('technoware:send-investor-alerts');
        $this->assertNull($entry->fresh()->alert_sent_at);

        $this->travel(2)->days();
        $this->artisan('technoware:send-investor-alerts');
        $this->artisan('technoware:send-investor-alerts');
        $this->assertNotNull($entry->fresh()->alert_sent_at);
        $this->assertSame(1, NewsletterCampaign::query()->count());
    }

    public function test_the_button_sends_once_and_refuses_a_second_press_and_a_draft(): void
    {
        $this->subscriber();
        $entry = $this->document();
        $url = "/api/v1/admin/content-types/investors/entries/{$entry->id}/alert";

        $this->actingAs($this->staff(), 'sanctum')->postJson($url)->assertStatus(202);
        $this->actingAs($this->staff(), 'sanctum')->postJson($url)->assertStatus(422)->assertJsonValidationErrors('alert');

        $draft = $this->document(['status' => 'draft']);
        $this->actingAs($this->staff(), 'sanctum')->postJson("/api/v1/admin/content-types/investors/entries/{$draft->id}/alert")
            ->assertStatus(422)->assertJsonValidationErrors('alert');
    }

    public function test_two_sends_of_one_document_make_one_campaign(): void
    {
        $this->subscriber();
        $entry = $this->document();

        $this->assertNull(InvestorAlerts::send($entry->fresh()));
        $this->assertSame('An alert for this document has already been sent.', InvestorAlerts::send($entry->fresh()));
        $this->assertSame(1, NewsletterCampaign::query()->count());
    }

    public function test_a_health_refusal_is_written_and_not_retried(): void
    {
        $this->subscriber();
        Setting::query()->whereIn('key', ['address', 'newsletter_address'])->update(['value' => null]);
        Setting::flushCache();
        $entry = $this->document(['alert_on_publish' => true]);

        $this->artisan('technoware:send-investor-alerts');
        $fresh = $entry->fresh();
        $this->assertNull($fresh->alert_sent_at);
        $this->assertNotNull($fresh->alert_error);
        $this->assertSame(0, InvestorAlerts::due()->count());
        $this->assertSame(0, NewsletterCampaign::query()->count());
    }

    public function test_a_failure_after_the_campaign_was_queued_never_frees_a_second_send(): void
    {
        $this->subscriber();
        $entry = $this->document();
        NewsletterCampaign::updated(function (NewsletterCampaign $c) {
            if ($c->status !== CampaignStatus::Draft && $c->status !== CampaignStatus::Ready) {
                throw new \RuntimeException('boom after queueing');
            }
        });

        InvestorAlerts::send($entry->fresh());

        $this->assertNotNull($entry->fresh()->alert_sent_at);
        $this->assertSame(InvestorAlerts::ALREADY_SENT, InvestorAlerts::send($entry->fresh()));
        $this->assertSame(1, NewsletterCampaign::query()->count());
    }

    public function test_a_failure_before_anything_was_queued_leaves_no_campaign_behind(): void
    {
        $this->subscriber();
        $entry = $this->document();
        NewsletterCampaign::updated(function (NewsletterCampaign $c) {
            if ($c->status === CampaignStatus::Ready) {
                throw new \RuntimeException('boom before queueing');
            }
        });

        $this->assertNotNull(InvestorAlerts::send($entry->fresh()));

        $this->assertNull($entry->fresh()->alert_sent_at);
        $this->assertSame(0, NewsletterCampaign::query()->count());
    }

    public function test_a_suppressed_address_is_not_added(): void
    {
        NewsletterSuppression::create(['email' => 'gone@example.test', 'reason' => 'unsubscribed']);
        $this->subscriber('gone@example.test');

        $this->assertFalse(Presets::investorGroup()->subscribers()->where('email', 'gone@example.test')->exists());
    }

    public function test_the_alert_switch_belongs_to_investors_only(): void
    {
        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();

        $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/content-types/awards/entries', [
            'title' => 'Best partner', 'status' => 'published', 'alert_on_publish' => true,
            'custom_fields' => ['awarding_body' => 'Cisco', 'year' => 2026],
        ])->assertStatus(422)->assertJsonValidationErrors('alert_on_publish');
    }
}
