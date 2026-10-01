<?php

namespace Tests\Feature;

use App\Enums\MeetingStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Meeting;
use App\Models\MeetingHostHour;
use App\Models\MeetingTimeOff;
use App\Models\MeetingType;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Meetings\Availability;
use App\Support\Meetings\MeetingCalendar;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\Support\FakeMeetingCalendar;
use Tests\TestCase;

/**
 * The slot engine (docs/meetings.md, "The slot engine").
 *
 * The clock is fixed at Monday 5 October 2026, 09:00 IST. The defaults are
 * mon–fri 10:00–18:00, a 30-minute step, four hours' notice and thirty days
 * ahead — so today opens at 13:00, Tuesday the 6th has 16 half-hour slots
 * (10:00 … 17:30), and 4 November is the last bookable day.
 */
class MeetingAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-05 09:00:00', 'Asia/Kolkata'));
        $this->setting('meetings_enabled', '1');
    }

    private function setting(string $key, ?string $value): void
    {
        Setting::where('key', $key)->firstOrFail()->forceFill(['value' => $value])->save();
    }

    private function host(string $email, RoleEnum $role = RoleEnum::MeetingHost, bool $active = true): User
    {
        $user = User::create(['name' => ucfirst(strtok($email, '@')), 'email' => $email, 'password' => 'password-for-tests', 'is_active' => $active]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function type(array $overrides = []): MeetingType
    {
        return MeetingType::create(array_replace([
            'name' => 'Product demo', 'slug' => 'product-demo', 'minutes' => 30,
            'buffer_before' => 0, 'buffer_after' => 0, 'is_public' => true, 'is_active' => true,
        ], $overrides));
    }

    private function at(string $local): CarbonImmutable
    {
        return CarbonImmutable::parse($local, 'Asia/Kolkata');
    }

    /** @return list<string> "HH:MM" of every slot on a day */
    private function times(MeetingType $type, string $date, ?Availability $availability = null): array
    {
        return array_map(
            fn (array $s) => $s['start']->format('H:i'),
            ($availability ?? Availability::for($type))->slots($this->at($date)),
        );
    }

    private function book(User $host, MeetingType $type, string $start, int $minutes = 30): Meeting
    {
        $starts = $this->at($start);

        return Meeting::create([
            'meeting_type_id' => $type->id, 'host_id' => $host->id, 'host_name' => $host->name,
            'name' => 'Existing', 'email' => 'existing@example.test',
            'starts_at' => $starts, 'ends_at' => $starts->addMinutes($minutes),
        ]);
    }

    public function test_the_default_hours_the_notice_and_the_step(): void
    {
        $this->host('anita@example.test');
        $type = $this->type();

        // Today opens four hours from now, on the half hour.
        $this->assertSame(['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'], $this->times($type, '2026-10-05'));
        $this->assertCount(16, $this->times($type, '2026-10-06'));
        $this->assertSame('10:00', $this->times($type, '2026-10-06')[0]);
        $this->assertSame('17:30', $this->times($type, '2026-10-06')[15]);
        // Saturday is closed by default.
        $this->assertSame([], $this->times($type, '2026-10-10'));
    }

    public function test_steps_align_to_the_hour(): void
    {
        $this->host('anita@example.test');
        $type = $this->type();

        $this->setting('meeting_slot_step', '60');
        $this->assertSame(['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], $this->times($type, '2026-10-06'));

        $this->setting('meeting_slot_step', '15');
        $slots = $this->times($type, '2026-10-06');
        $this->assertCount(31, $slots);
        $this->assertSame(['10:00', '10:15', '10:30'], array_slice($slots, 0, 3));
    }

    public function test_a_host_s_own_hours_replace_the_defaults(): void
    {
        $host = $this->host('anita@example.test');
        $type = $this->type();
        MeetingHostHour::create(['user_id' => $host->id, 'weekday' => 2, 'start' => '14:00', 'end' => '16:00']);

        $this->assertSame(['14:00', '14:30', '15:00', '15:30'], $this->times($type, '2026-10-06'));
        // No row for Wednesday: a host with hours of their own does not work the defaults.
        $this->assertSame([], $this->times($type, '2026-10-07'));
    }

    public function test_holidays_and_time_off_are_subtracted(): void
    {
        $host = $this->host('anita@example.test');
        $type = $this->type();

        $this->setting('meeting_holidays', "2026-10-06 Company day\n");
        $this->assertSame([], $this->times($type, '2026-10-06'));

        $this->setting('meeting_holidays', null);
        MeetingTimeOff::create(['user_id' => $host->id, 'starts_at' => $this->at('2026-10-06 11:00'), 'ends_at' => $this->at('2026-10-06 12:00')]);

        $times = $this->times($type, '2026-10-06');
        $this->assertNotContains('11:00', $times);
        $this->assertNotContains('11:30', $times);
        $this->assertContains('10:30', $times);   // ends at 11:00 exactly
        $this->assertContains('12:00', $times);
    }

    public function test_the_booking_window_ends_after_max_days(): void
    {
        $this->host('anita@example.test');
        $type = $this->type();

        $days = collect(Availability::for($type)->days($this->at('2026-11-03'), $this->at('2026-11-06')))->pluck('count', 'date');

        $this->assertSame(['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], $days->keys()->all());
        $this->assertSame(16, $days['2026-11-04']);   // the thirtieth day
        $this->assertSame(0, $days['2026-11-05']);
        $this->assertSame(0, $days['2026-11-06']);

        // The console skips the window — never the past.
        $staff = Availability::for($type)->forStaff();
        $this->assertCount(16, $this->times($type, '2026-11-05', $staff));
        $this->assertSame('10:00', $this->times($type, '2026-10-05', $staff)[0]);
    }

    public function test_an_existing_booking_blocks_its_host_with_its_own_buffers(): void
    {
        $host = $this->host('anita@example.test');
        $withBuffer = $this->type(['slug' => 'site-review', 'name' => 'Site review', 'buffer_after' => 30]);
        $type = $this->type();

        // 12:00–12:30 plus its own 30 minutes after: blocked until 13:00.
        $meeting = $this->book($host, $withBuffer, '2026-10-06 12:00');
        $this->assertSame('13:00', $meeting->blocked_until->format('H:i'));

        $times = $this->times($type, '2026-10-06');
        $this->assertContains('11:30', $times);
        $this->assertNotContains('12:00', $times);
        $this->assertNotContains('12:30', $times);
        $this->assertContains('13:00', $times);

        // A cancelled meeting blocks nothing.
        $meeting->forceFill(['status' => MeetingStatus::Cancelled])->save();
        $this->assertContains('12:30', $this->times($type, '2026-10-06'));
    }

    public function test_the_new_meeting_s_buffers_must_fit_on_both_sides(): void
    {
        $host = $this->host('anita@example.test');
        $plain = $this->type();
        $buffered = $this->type(['slug' => 'workshop', 'name' => 'Workshop', 'buffer_before' => 15, 'buffer_after' => 15]);

        $this->book($host, $plain, '2026-10-06 12:00');

        $times = $this->times($buffered, '2026-10-06');
        $this->assertContains('11:00', $times);      // 11:00 + 30 + 15 = 11:45
        $this->assertNotContains('11:30', $times);   // its after-buffer reaches 12:15
        $this->assertNotContains('12:30', $times);   // its before-buffer starts 12:15
        $this->assertContains('13:00', $times);      // 12:45, clear
    }

    public function test_candidates_are_active_explicit_hosts_allowed_for_the_type(): void
    {
        $this->host('admin@example.test', RoleEnum::Admin);
        $this->host('gone@example.test', active: false);
        $type = $this->type();

        // An administrator's implicit pass does not make a host.
        $this->assertTrue(Availability::candidates($type)->isEmpty());
        $this->assertSame([], $this->times($type, '2026-10-06'));

        $anita = $this->host('anita@example.test');
        $ravi = $this->host('ravi@example.test');
        $this->assertSame([$anita->id, $ravi->id], Availability::candidates($type)->pluck('id')->all());

        $type->hosts()->sync([$ravi->id]);
        $this->assertSame([$ravi->id], Availability::candidates($type->refresh())->pluck('id')->all());

        // A list whose hosts are no longer eligible means nobody — never everybody.
        $ravi->forceFill(['is_active' => false])->save();
        $this->assertTrue(Availability::candidates($type)->isEmpty());
        $this->assertSame([], $this->times($type, '2026-10-06'));
    }

    public function test_a_slot_names_every_free_host(): void
    {
        $anita = $this->host('anita@example.test');
        $ravi = $this->host('ravi@example.test');
        $type = $this->type();
        $this->book($anita, $type, '2026-10-06 10:00');

        $hosts = Availability::for($type)->hostsAt($this->at('2026-10-06 10:00'));
        $this->assertSame([$ravi->id], array_column($hosts, 'id'));

        $this->assertCount(2, Availability::for($type)->hostsAt($this->at('2026-10-06 10:30')));
        // Off the step, and before the notice: not a time on offer at all.
        $this->assertNull(Availability::for($type)->hostsAt($this->at('2026-10-06 10:10')));
        $this->assertNull(Availability::for($type)->hostsAt($this->at('2026-10-05 11:00')));
    }

    public function test_google_busy_blocks_and_unknown_never_does(): void
    {
        $anita = $this->host('anita@example.test');
        $ravi = $this->host('ravi@example.test');
        $type = $this->type();

        $calendar = new FakeMeetingCalendar;
        $calendar->busy = [
            // Google answers in UTC; the engine compares moments.
            'anita@example.test' => [[CarbonImmutable::parse('2026-10-06 04:30:00', 'UTC'), CarbonImmutable::parse('2026-10-06 05:30:00', 'UTC')]],
            'ravi@example.test' => null,
        ];
        $this->app->instance(MeetingCalendar::class, $calendar);

        $at10 = Availability::for($type)->hostsAt($this->at('2026-10-06 10:00'));
        $this->assertSame([$ravi->id], array_column($at10, 'id'));
        $this->assertSame([$ravi->id], array_column(Availability::for($type)->hostsAt($this->at('2026-10-06 10:30')), 'id'));
        $this->assertCount(2, Availability::for($type)->hostsAt($this->at('2026-10-06 11:00')));
        // One call per question, for every candidate across the whole range.
        $calls = count($calendar->busyCalls);
        Availability::for($type)->days($this->at('2026-10-05'), $this->at('2026-11-04'));
        $this->assertCount($calls + 1, $calendar->busyCalls);
        $this->assertSame(['anita@example.test', 'ravi@example.test'], end($calendar->busyCalls)[0]);

        // The console may override it behind the tick, and says it did.
        $override = Availability::for($type)->forStaff()->allowGoogleBusy()->hostsAt($this->at('2026-10-06 10:00'));
        $this->assertSame([true, false], array_column($override, 'google_busy'));

        // Switched off, Google is not asked.
        $this->setting('meeting_block_google_busy', '0');
        $this->assertCount(2, Availability::for($type)->hostsAt($this->at('2026-10-06 10:00')));

        // Not connected: never asked, never busy.
        $this->setting('meeting_block_google_busy', '1');
        $calendar->connected = false;
        $calls = count($calendar->busyCalls);
        $this->assertCount(2, Availability::for($type)->hostsAt($this->at('2026-10-06 10:00')));
        $this->assertCount($calls, $calendar->busyCalls);
    }

    public function test_the_console_may_go_outside_hours_and_marks_it(): void
    {
        $this->host('anita@example.test');
        $type = $this->type();

        $this->assertSame([], Availability::for($type)->forStaff()->hostsAt($this->at('2026-10-06 19:00')));

        $hosts = Availability::for($type)->forStaff()->allowOutsideHours()->hostsAt($this->at('2026-10-06 19:00'));
        $this->assertCount(1, $hosts);
        $this->assertTrue($hosts[0]['outside_hours']);
    }

    // ------------------------------------------------------------ endpoints

    public function test_the_range_answer_counts_every_date_and_is_never_cached(): void
    {
        $this->host('anita@example.test');
        $this->type();

        $response = $this->getJson('/api/v1/meetings/slots?type=product-demo&from=2026-10-05&to=2026-10-11')
            ->assertOk()
            ->assertJsonPath('data.timezone', 'Asia/Kolkata')
            ->assertJsonPath('data.timezone_label', 'IST');

        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->assertSame(
            ['2026-10-05' => 10, '2026-10-06' => 16, '2026-10-07' => 16, '2026-10-08' => 16, '2026-10-09' => 16, '2026-10-10' => 0, '2026-10-11' => 0],
            collect($response->json('data.days'))->pluck('count', 'date')->all(),
        );
    }

    public function test_the_date_answer_carries_offsets_and_never_the_host(): void
    {
        $this->host('anita@example.test');
        $this->type();

        $slot = $this->getJson('/api/v1/meetings/slots?type=product-demo&date=2026-10-06')
            ->assertOk()
            ->json('data.slots.0');

        $this->assertSame(['start' => '2026-10-06T10:00:00+05:30', 'end' => '2026-10-06T10:30:00+05:30', 'time_label' => '10:00'], $slot);
    }

    public function test_an_unknown_or_private_type_and_a_long_range_are_refused(): void
    {
        $this->type(['slug' => 'internal', 'is_public' => false]);

        $this->getJson('/api/v1/meetings/slots?type=internal&date=2026-10-06')->assertStatus(422)->assertJsonValidationErrors('type');
        $this->getJson('/api/v1/meetings/slots?type=nope&date=2026-10-06')->assertStatus(422)->assertJsonValidationErrors('type');

        $this->type();
        $this->getJson('/api/v1/meetings/slots?type=product-demo&from=2026-10-05&to=2026-12-31')->assertStatus(422)->assertJsonValidationErrors('to');
        $this->getJson('/api/v1/meetings/slots?type=product-demo&date=6-10-2026')->assertStatus(422)->assertJsonValidationErrors('date');
    }

    public function test_switched_off_offers_nothing(): void
    {
        $this->host('anita@example.test');
        $this->type();
        $this->setting('meetings_enabled', '0');

        $this->getJson('/api/v1/meetings/slots?type=product-demo&date=2026-10-06')->assertOk()->assertJsonCount(0, 'data.slots');
        $this->getJson('/api/v1/meetings/options')->assertOk()->assertJsonPath('data.enabled', false);
    }

    public function test_the_options_describe_the_window(): void
    {
        $this->type(['description' => 'A walk through the product.']);
        $this->type(['slug' => 'internal', 'name' => 'Internal', 'is_public' => false]);
        $this->setting('meeting_holidays', "2026-10-20\n2027-06-01\n");

        $this->getJson('/api/v1/meetings/options')
            ->assertOk()
            ->assertJsonPath('data.enabled', true)
            ->assertJsonCount(1, 'data.types')
            ->assertJsonPath('data.types.0.slug', 'product-demo')
            ->assertJsonPath('data.step', 30)
            ->assertJsonPath('data.min_date', '2026-10-05')
            ->assertJsonPath('data.max_date', '2026-11-04')
            ->assertJsonPath('data.holidays', ['2026-10-20'])
            ->assertJsonPath('data.timezone', 'Asia/Kolkata')
            ->assertJsonPath('data.timezone_label', 'IST')
            ->assertJsonPath('data.agenda_max', 2000);
    }
}
