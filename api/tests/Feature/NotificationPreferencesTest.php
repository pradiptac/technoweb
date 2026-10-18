<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\StaffPreference;
use App\Models\StaffPushSubscription;
use App\Notifications\StaffAlerts;
use App\Notifications\StaffDigest;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class NotificationPreferencesTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
    }

    public function test_a_person_reads_the_defaults_and_their_own_rules(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/notifications/preferences')
            ->assertOk()
            ->assertJsonPath('data.digest', 'weekly')
            ->assertJsonPath('data.alerts', ['ticket_critical_unassigned' => true, 'ticket_overdue' => true])
            ->assertJsonPath('meta.rules.0.threshold_label', 'after 30 minutes')
            ->assertJsonPath('meta.self', true)
            ->assertJsonPath('meta.push_live', false);
    }

    public function test_saving_writes_a_row_and_answers_it(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($user, 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', [
                'digest' => 'daily', 'digest_hour' => 9, 'alerts' => ['ticket_overdue' => false],
                'quiet_start' => '22:00', 'quiet_end' => '07:00', 'alert_push' => false,
            ])
            ->assertOk()
            ->assertJsonPath('data.digest', 'daily')
            ->assertJsonPath('data.alerts.ticket_overdue', false)
            ->assertJsonPath('data.alerts.ticket_critical_unassigned', true);

        $this->assertSame(9, StaffPreference::where('user_id', $user->id)->value('digest_hour'));
    }

    public function test_an_alert_outside_the_persons_rules_is_refused(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', ['alerts' => ['backup_failed' => true]])
            ->assertStatus(422)->assertJsonValidationErrors('alerts');
    }

    public function test_bad_values_are_refused(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences', ['digest' => 'hourly', 'digest_hour' => 24, 'quiet_start' => '25:00'])
            ->assertStatus(422)->assertJsonValidationErrors(['digest', 'digest_hour', 'quiet_start']);
    }

    public function test_an_administrator_may_read_and_change_somebody_else(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->patchJson('/api/v1/admin/notifications/preferences?user='.$support->id, ['digest' => 'off'])
            ->assertOk()->assertJsonPath('meta.self', false)->assertJsonPath('meta.user.id', $support->id);

        $this->assertSame('off', StaffPreference::where('user_id', $support->id)->value('digest'));
    }

    public function test_nobody_else_may_address_another_person(): void
    {
        $other = $this->staff(RoleEnum::SupportEngineer, 'b');
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/notifications/preferences?user='.$other->id)->assertForbidden();
    }

    public function test_the_two_send_buttons_reach_only_the_caller(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($support, 'sanctum')->postJson('/api/v1/admin/notifications/digest/send')->assertStatus(202);
        $this->actingAs($support, 'sanctum')->postJson('/api/v1/admin/notifications/alerts/test')->assertStatus(202);

        Notification::assertSentTo($support, StaffDigest::class);
        Notification::assertSentTo($support, StaffAlerts::class);
        $this->assertNull(StaffPreference::where('user_id', $support->id)->value('last_digest_at'));
    }

    public function test_subscribing_needs_push_set_up_and_a_browser_is_removed_only_by_its_owner(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/admin/push/subscribe', ['token' => str_repeat('a', 40)])
            ->assertStatus(422)->assertJsonValidationErrors('token');

        $mine = StaffPushSubscription::create(['user_id' => $user->id, 'token' => str_repeat('m', 40)]);
        $theirs = StaffPushSubscription::create(['user_id' => $this->staff(RoleEnum::SupportEngineer, 'b')->id, 'token' => str_repeat('t', 40)]);

        $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/admin/push/'.$theirs->id)->assertNotFound();
        $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/admin/push/'.$mine->id)->assertNoContent();
        $this->assertSame(1, StaffPushSubscription::count());
    }

    public function test_a_customer_token_is_refused(): void
    {
        $this->getJson('/api/v1/admin/notifications/preferences')->assertUnauthorized();
    }
}
