<?php

namespace Tests\Feature;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingStatus;
use App\Models\Meeting;
use App\Models\MeetingType;
use App\Models\Setting;
use App\Support\References;
use App\Support\Upgrade\Steps\DeriveMeetingPrefix;
use App\Support\Upgrade\UpgradeSteps;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * An install updated to the release that brought online meetings numbers
 * them under its own initials, the way a fresh install does through
 * `Branding::apply()` — and a prefix somebody already chose is theirs.
 *
 * Also the two things the `Meeting` model does by itself: the reference
 * under that prefix, and the block widened by the type's buffers.
 */
class UpgradeMeetingPrefixTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_step_is_registered(): void
    {
        $this->assertContains(DeriveMeetingPrefix::class, UpgradeSteps::STEPS);
    }

    public function test_the_meeting_prefix_is_derived_from_the_ticket_prefix(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('ticket_reference_prefix', 'AN');
        Setting::flushCache();

        $this->assertSame('MT', References::meeting());

        UpgradeSteps::run(app(DeriveMeetingPrefix::class));

        $this->assertSame('ANM', References::meeting());
        $this->assertDatabaseHas('system_upgrade_steps', ['step' => '2026-09-29-derive-meeting-prefix']);
    }

    public function test_a_long_ticket_prefix_is_cut_to_six(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('ticket_reference_prefix', 'ACMENW');
        Setting::flushCache();

        app(DeriveMeetingPrefix::class)->run();

        $this->assertSame('ACMENW', References::meeting());
    }

    public function test_a_prefix_somebody_chose_is_left_alone(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('ticket_reference_prefix', 'AN');
        Setting::put('meeting_reference_prefix', 'CALL');
        Setting::flushCache();

        app(DeriveMeetingPrefix::class)->run();

        $this->assertSame('CALL', References::meeting());
    }

    public function test_a_meeting_is_numbered_under_the_prefix_and_blocks_its_buffers(): void
    {
        $this->seed(SettingsSeeder::class);
        Setting::put('meeting_reference_prefix', 'ANM');
        Setting::flushCache();

        $type = MeetingType::create(['name' => 'Demo', 'slug' => 'demo', 'minutes' => 30, 'buffer_before' => 10, 'buffer_after' => 15]);
        $start = Carbon::parse('2026-10-06 15:30:00');

        $meeting = Meeting::create([
            'meeting_type_id' => $type->id,
            'name' => 'Priya Sharma',
            'email' => 'priya@example.test',
            'starts_at' => $start,
            'ends_at' => $start->copy()->addMinutes(30),
        ]);

        $this->assertMatchesRegularExpression('/^ANM-\d{4}-00001$/', $meeting->reference);
        $this->assertSame(64, strlen($meeting->access_token));
        $this->assertArrayNotHasKey('access_token', $meeting->toArray());
        $this->assertSame(MeetingStatus::Scheduled, $meeting->fresh()->status);
        $this->assertSame(MeetingGoogleStatus::Pending, $meeting->fresh()->google_status);
        $this->assertSame('2026-10-06 15:20:00', $meeting->blocked_from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-06 16:15:00', $meeting->blocked_until->format('Y-m-d H:i:s'));

        // A later change to the type's buffers does not move an existing block…
        $type->update(['buffer_before' => 60]);
        $meeting->update(['staff_note' => 'Wants pricing.']);
        $this->assertSame('2026-10-06 15:20:00', $meeting->fresh()->blocked_from->format('Y-m-d H:i:s'));

        // …and a move re-reads them.
        $meeting->update(['starts_at' => $start->copy()->addHour(), 'ends_at' => $start->copy()->addMinutes(90)]);
        $this->assertSame('2026-10-06 15:30:00', $meeting->fresh()->blocked_from->format('Y-m-d H:i:s'));
    }
}
