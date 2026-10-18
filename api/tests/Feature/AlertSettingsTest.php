<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Setting;
use App\Models\StaffPreference;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\StaffPreferences;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class AlertSettingsTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    public function test_thresholds_fall_back_to_their_defaults(): void
    {
        $this->assertSame(30, AlertSettings::threshold('alert_ticket_critical_minutes'));
        Setting::put('alert_ticket_critical_minutes', '45');
        Setting::flushCache();
        $this->assertSame(45, AlertSettings::threshold('alert_ticket_critical_minutes'));
        Setting::put('alert_ticket_critical_minutes', '99999');
        Setting::flushCache();
        $this->assertSame(30, AlertSettings::threshold('alert_ticket_critical_minutes'));
    }

    public function test_a_threshold_out_of_range_is_refused(): void
    {
        $this->assertNull(AlertSettings::refusalFor('alert_lead_hot_hours', '2'));
        $this->assertSame('A whole number from 1 to 168.', AlertSettings::refusalFor('alert_lead_hot_hours', '0'));
        $this->assertSame('A whole number from 1 to 168.', AlertSettings::refusalFor('alert_lead_hot_hours', 'two'));
        $this->assertSame('Choose off, daily or weekly.', AlertSettings::refusalFor('alerts_default_digest', 'hourly'));
        $this->assertNull(AlertSettings::refusalFor('seo_ai_enabled', 'x'));
    }

    public function test_every_rule_is_on_until_switched_off(): void
    {
        $this->assertTrue(AlertSettings::enabled('ticket_overdue'));
        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        $this->assertFalse(AlertSettings::enabled('ticket_overdue'));
    }

    public function test_preferences_start_from_the_defaults_and_are_not_saved(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $prefs = StaffPreferences::for($user);

        $this->assertFalse($prefs->exists);
        $this->assertSame('weekly', $prefs->digest);
        $this->assertSame(8, $prefs->digest_hour);
        $this->assertTrue($prefs->wantsAlert('ticket_overdue'));
        $this->assertSame(0, StaffPreference::count());

        Setting::put('alerts_default_digest', 'daily');
        Setting::flushCache();
        $this->assertSame('daily', StaffPreferences::for($user->fresh())->digest);
    }

    public function test_quiet_hours_cross_midnight(): void
    {
        $prefs = new StaffPreference(['quiet_start' => '21:00', 'quiet_end' => '08:00']);
        $at = fn (string $t) => CarbonImmutable::parse('2026-10-24 '.$t, 'Asia/Kolkata');

        $this->assertTrue($prefs->quietAt($at('23:30')));
        $this->assertTrue($prefs->quietAt($at('07:59')));
        $this->assertFalse($prefs->quietAt($at('08:00')));
        $this->assertFalse($prefs->quietAt($at('20:59')));

        $day = new StaffPreference(['quiet_start' => '13:00', 'quiet_end' => '14:00']);
        $this->assertTrue($day->quietAt($at('13:30')));
        $this->assertFalse($day->quietAt($at('14:00')));

        $none = new StaffPreference(['quiet_start' => '09:00', 'quiet_end' => '09:00']);
        $this->assertFalse($none->quietAt($at('09:00')));
    }

    public function test_a_switched_off_alert_is_not_wanted(): void
    {
        $prefs = new StaffPreference(['alerts' => ['ticket_overdue' => false]]);
        $this->assertFalse($prefs->wantsAlert('ticket_overdue'));
        $this->assertTrue($prefs->wantsAlert('return_waiting'));
    }

    public function test_the_settings_screen_refuses_a_bad_threshold(): void
    {
        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'alert_mail_minutes', 'value' => '2']]])
            ->assertStatus(422);
    }
}
