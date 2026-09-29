<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingSource;
use App\Enums\MeetingStatus;
use App\Enums\Role as RoleEnum;
use App\Events\MeetingSynced;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Meeting;
use App\Models\MeetingReminder;
use App\Models\MeetingType;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\MeetingBooked;
use App\Notifications\MeetingCancelled;
use App\Notifications\MeetingLinkReady;
use App\Notifications\MeetingReminder as MeetingReminderMail;
use App\Notifications\MeetingRescheduled;
use App\Notifications\MeetingScheduled;
use App\Notifications\MeetingSyncFailed;
use App\Support\Ics;
use App\Support\Meetings\MeetingActions;
use App\Support\Meetings\MeetingCalendar;
use App\Support\Meetings\MeetingSync;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\Support\FakeMeetingCalendar;
use Tests\TestCase;

/**
 * Online meetings: booking, the guest link, the portal, the console, the
 * reminders and the confirmation that waits for the calendar
 * (docs/meetings.md). Google itself is `MeetingGoogleTest`'s; here the
 * calendar is the null one, or a fake bound for the rule under test.
 *
 * The clock is fixed at Monday 5 October 2026, 09:00 IST, with the default
 * settings: mon–fri 10:00–18:00, a 30-minute step, four hours' notice, a
 * 12-hour cutoff, reminders a day and an hour before.
 */
class MeetingTest extends TestCase
{
    use RefreshDatabase;

    private MeetingType $type;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-05 09:00:00', 'Asia/Kolkata'));
        $this->setting('meetings_enabled', '1');
        Notification::fake();

        $this->type = MeetingType::create([
            'name' => 'Product demo', 'slug' => 'product-demo', 'minutes' => 30,
            'buffer_before' => 0, 'buffer_after' => 0, 'is_public' => true, 'is_active' => true,
        ]);
    }

    private function setting(string $key, ?string $value): void
    {
        Setting::where('key', $key)->firstOrFail()->forceFill(['value' => $value])->save();
    }

    private function staff(RoleEnum $role, string $email, RoleEnum ...$more): User
    {
        $user = User::create(['name' => ucfirst(strtok($email, '@')), 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);

        foreach ([$role, ...$more] as $r) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $r->value], ['name' => $r->label()]));
        }

        return $user;
    }

    private function host(string $email = 'anita@example.test'): User
    {
        return $this->staff(RoleEnum::MeetingHost, $email);
    }

    private function customer(string $email = 'priya@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Priya Sharma', 'email' => $email, 'phone' => '9876543210',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_replace([
            'type' => 'product-demo',
            'start' => '2026-10-07T11:00:00+05:30',
            'name' => 'Priya Sharma',
            'email' => 'priya@meridianfoods.test',
            'phone' => '+91 98765 43210',
            'company' => 'Meridian Foods',
            'agenda' => 'Replacing the core switches across two sites.',
            '_source_url' => 'https://www.technoware.in/book-a-meeting?type=product-demo',
        ], $overrides);
    }

    /** @return array<string, mixed> */
    private function bookNow(array $overrides = []): array
    {
        return $this->postJson('/api/v1/meetings', $this->payload($overrides))->assertCreated()->json('data');
    }

    private function fakeCalendar(string $outcome = 'synced'): FakeMeetingCalendar
    {
        $calendar = new FakeMeetingCalendar;
        $calendar->outcome = $outcome;
        $this->app->instance(MeetingCalendar::class, $calendar);

        return $calendar;
    }

    // ---------------------------------------------------------------- booking

    public function test_a_booking_is_stored_files_a_lead_and_tells_everybody(): void
    {
        $anita = $this->host();

        $data = $this->bookNow();

        $this->assertSame('MT-2026-00001', $data['reference']);
        $this->assertSame(64, strlen($data['access_token']));
        $this->assertSame('2026-10-07T11:00:00+05:30', $data['starts_at']);
        $this->assertSame('Wed 7 Oct 2026', $data['date_label']);
        $this->assertSame('11:00 – 11:30', $data['time_label']);
        $this->assertSame('IST', $data['timezone']);

        $meeting = Meeting::sole();
        $this->assertSame(MeetingStatus::Scheduled, $meeting->status);
        $this->assertSame(MeetingSource::Site, $meeting->source);
        $this->assertSame($anita->id, $meeting->host_id);
        $this->assertSame('Anita', $meeting->host_name);
        $this->assertSame('+919876543210', $meeting->phone);
        $this->assertSame('/book-a-meeting?type=product-demo', $meeting->source_path);
        $this->assertSame('2026-10-07 11:00:00', $meeting->blocked_from->format('Y-m-d H:i:s'));

        $lead = Lead::sole();
        $this->assertSame('meeting', $lead->channel);
        $this->assertSame($lead->id, $meeting->lead_id);
        $this->assertSame('/book-a-meeting?type=product-demo', $lead->source_path);

        // The desk and the host, with the agenda.
        Notification::assertSentOnDemandTimes(MeetingBooked::class, 2);

        // Nothing connected: the confirmation goes at once, with our file.
        $this->assertSame(MeetingGoogleStatus::Off, $meeting->google_status);
        Notification::assertSentOnDemand(MeetingScheduled::class, function (MeetingScheduled $n, $channels, $to) use ($meeting) {
            $mail = $n->toMail($to);
            $ics = $mail->rawAttachments[0]['data'] ?? '';

            return $n->withIcs
                && $to->routes['mail'] === 'priya@meridianfoods.test'
                && str_contains($ics, 'UID:'.$meeting->reference.'@')
                && str_contains($ics, 'DTSTART:20261007T053000Z')
                && str_contains($ics, 'STATUS:CONFIRMED')
                && ! str_contains($ics, 'Replacing the core switches');
        });
        $this->assertSame(['booked', 'confirmation_sent'], $meeting->events()->pluck('type')->all());
        $this->assertSame('ics', $meeting->events()->where('type', 'confirmation_sent')->value('to_value'));
    }

    public function test_the_token_is_handed_out_once(): void
    {
        $this->host();
        $data = $this->bookNow();

        $this->getJson("/api/v1/meetings/{$data['reference']}?token={$data['access_token']}")
            ->assertOk()
            ->assertJsonMissingPath('data.access_token')
            ->assertJsonMissingPath('data.staff_note')
            ->assertJsonPath('data.meeting_type.slug', 'product-demo')
            ->assertJsonPath('data.can_cancel', true)
            ->assertJsonPath('data.reschedules_left', 3);
    }

    public function test_switched_off_refuses_with_a_sentence(): void
    {
        $this->host();
        $this->setting('meetings_enabled', '0');

        $this->postJson('/api/v1/meetings', $this->payload())->assertForbidden()
            ->assertJsonPath('message', 'Meetings are not being booked online at the moment. Please get in touch with us instead.');
        $this->assertSame(0, Meeting::count());
    }

    public function test_a_start_must_carry_its_offset_and_be_a_slot(): void
    {
        $this->host();

        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T11:00']))
            ->assertStatus(422)->assertJsonValidationErrors('start');
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T11:10:00+05:30']))
            ->assertStatus(422)->assertJsonPath('errors.start.0', MeetingActions::NOT_OFFERED);
        // Saturday: closed.
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-10T11:00:00+05:30']))
            ->assertStatus(422)->assertJsonValidationErrors('start');

        // The same moment written in UTC is the same slot.
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T05:30:00Z']))->assertCreated();
        $this->assertSame('2026-10-07 11:00', Meeting::sole()->starts_at->format('Y-m-d H:i'));
    }

    public function test_a_taken_slot_is_refused_and_a_second_host_takes_it(): void
    {
        $anita = $this->host();
        $this->bookNow();

        $this->postJson('/api/v1/meetings', $this->payload(['email' => 'second@example.test']))
            ->assertStatus(422)
            ->assertJsonPath('errors.start.0', MeetingActions::TAKEN);

        $ravi = $this->host('ravi@example.test');
        $this->bookNow(['email' => 'second@example.test']);

        $this->assertEqualsCanonicalizing([$anita->id, $ravi->id], Meeting::pluck('host_id')->all());
    }

    public function test_the_least_booked_free_host_is_chosen(): void
    {
        $anita = $this->host();
        $ravi = $this->host('ravi@example.test');

        // Anita has two meetings this week, Ravi none: Ravi gets the next.
        foreach (['2026-10-06 10:00', '2026-10-06 11:00'] as $at) {
            $start = CarbonImmutable::parse($at, 'Asia/Kolkata');
            Meeting::create([
                'meeting_type_id' => $this->type->id, 'host_id' => $anita->id, 'name' => 'x', 'email' => 'x@example.test',
                'starts_at' => $start, 'ends_at' => $start->addMinutes(30),
            ]);
        }

        $this->bookNow();
        $this->assertSame($ravi->id, Meeting::latest('id')->first()->host_id);

        // Ravi is taken at 14:00 — the free one is chosen however busy.
        $start = CarbonImmutable::parse('2026-10-08 14:00', 'Asia/Kolkata');
        Meeting::create([
            'meeting_type_id' => $this->type->id, 'host_id' => $ravi->id, 'name' => 'y', 'email' => 'y@example.test',
            'starts_at' => $start, 'ends_at' => $start->addMinutes(30),
        ]);

        $this->bookNow(['email' => 'third@example.test', 'start' => '2026-10-08T14:00:00+05:30']);
        $this->assertSame($anita->id, Meeting::latest('id')->first()->host_id);
    }

    public function test_a_reference_collision_is_regenerated(): void
    {
        $this->host();
        $this->host('ravi@example.test');

        // `nextReference()` reads the last row's number: 00001, plus one — which is taken.
        $start = CarbonImmutable::parse('2026-10-20 10:00', 'Asia/Kolkata');
        foreach (['MT-2026-00002', 'MT-2026-00001'] as $reference) {
            Meeting::create([
                'reference' => $reference, 'meeting_type_id' => $this->type->id, 'name' => 'x', 'email' => 'x@example.test',
                'status' => MeetingStatus::Cancelled, 'starts_at' => $start, 'ends_at' => $start->addMinutes(30),
            ]);
        }

        $data = $this->bookNow();

        $this->assertSame('MT-2026-00003', $data['reference']);
    }

    public function test_the_contact_and_address_caps(): void
    {
        $this->host();
        $this->host('ravi@example.test');
        $this->host('mira@example.test');

        $this->bookNow();
        $this->bookNow(['start' => '2026-10-07T12:00:00+05:30', 'email' => 'other@example.test']);

        // A third future meeting for the same address — or the same mobile.
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T13:00:00+05:30']))
            ->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T13:00:00+05:30', 'email' => 'third@example.test']))
            ->assertStatus(422)->assertJsonValidationErrors('email');

        $this->setting('meeting_daily_ip_cap', '2');
        $this->postJson('/api/v1/meetings', $this->payload(['start' => '2026-10-07T13:00:00+05:30', 'email' => 'new@example.test', 'phone' => '9000000001']))
            ->assertStatus(422)->assertJsonValidationErrors('start');
    }

    public function test_the_honeypot_and_the_mobile(): void
    {
        $this->host();

        $this->postJson('/api/v1/meetings', $this->payload(['website' => 'http://spam.test']))->assertStatus(422)->assertJsonValidationErrors('website');
        $this->postJson('/api/v1/meetings', $this->payload(['phone' => '12345']))->assertStatus(422)->assertJsonValidationErrors('phone');
        $this->assertSame(0, Meeting::count());
    }

    // ---------------------------------------------------------------- guest

    public function test_the_guest_link_is_scoped_by_its_token(): void
    {
        $this->host();
        $data = $this->bookNow();

        $this->getJson("/api/v1/meetings/{$data['reference']}?token=".str_repeat('a', 64))->assertNotFound();
        $this->getJson("/api/v1/meetings/MT-2026-09999?token={$data['access_token']}")->assertNotFound();
        $this->postJson("/api/v1/meetings/{$data['reference']}/cancel", ['token' => 'nope'])->assertNotFound();
        $this->assertSame(MeetingStatus::Scheduled, Meeting::sole()->status);
    }

    public function test_a_guest_can_move_and_then_cancel(): void
    {
        $this->host();
        $data = $this->bookNow();

        $this->postJson("/api/v1/meetings/{$data['reference']}/reschedule", [
            'token' => $data['access_token'], 'start' => '2026-10-08T15:00:00+05:30',
        ])->assertOk()
            ->assertJsonPath('data.time_label', '15:00 – 15:30')
            ->assertJsonPath('data.reschedules_left', 2)
            ->assertJsonStructure(['message', 'data']);

        $meeting = Meeting::sole();
        $this->assertSame(1, $meeting->reschedule_count);
        $this->assertSame('2026-10-08 15:00', $meeting->starts_at->format('Y-m-d H:i'));
        Notification::assertSentOnDemand(MeetingRescheduled::class, fn (MeetingRescheduled $n) => $n->withIcs
            && $n->previous === 'Wed 7 Oct 2026, 11:00 – 11:30 IST');

        $this->postJson("/api/v1/meetings/{$data['reference']}/cancel", ['token' => $data['access_token']])
            ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.can_cancel', false);

        Notification::assertSentOnDemand(MeetingCancelled::class, function (MeetingCancelled $n, $channels, $to) {
            $ics = $n->toMail($to)->rawAttachments[0]['data'] ?? '';

            return $n->withIcs && str_contains($ics, 'STATUS:CANCELLED');
        });
        $this->assertSame(['booked', 'confirmation_sent', 'rescheduled', 'cancelled'], $meeting->events()->pluck('type')->all());
    }

    public function test_the_cutoff_and_the_reschedule_cap_hold_the_customer_not_the_desk(): void
    {
        $this->host();
        $data = $this->bookNow(['start' => '2026-10-05T17:00:00+05:30']);   // eight hours away
        $token = $data['access_token'];

        $this->postJson("/api/v1/meetings/{$data['reference']}/cancel", ['token' => $token])
            ->assertStatus(422)->assertJsonValidationErrors('meeting');
        $this->getJson("/api/v1/meetings/{$data['reference']}?token={$token}")->assertJsonPath('data.can_cancel', false);

        $sales = $this->staff(RoleEnum::SalesManager, 'sales@example.test');
        $this->actingAs($sales, 'sanctum')
            ->postJson("/api/v1/admin/meetings/{$data['reference']}/cancel", ['reason' => 'Host unwell'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.cancel_reason', 'Host unwell');

        // The cap.
        $this->setting('meeting_max_reschedules', '1');
        $second = $this->bookNow(['email' => 'two@example.test', 'phone' => '9000000002']);
        $this->postJson("/api/v1/meetings/{$second['reference']}/reschedule", ['token' => $second['access_token'], 'start' => '2026-10-09T10:00:00+05:30'])->assertOk();
        $this->postJson("/api/v1/meetings/{$second['reference']}/reschedule", ['token' => $second['access_token'], 'start' => '2026-10-09T11:00:00+05:30'])
            ->assertStatus(422)->assertJsonValidationErrors('meeting');
    }

    // ---------------------------------------------------------------- portal

    public function test_a_signed_in_customer_is_stamped_and_sees_only_their_own(): void
    {
        $this->host();
        $priya = $this->customer();
        $token = $priya->createToken('portal', ['portal'])->plainTextToken;

        $data = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/meetings', $this->payload())->assertCreated()->json('data');

        $meeting = Meeting::sole();
        $this->assertSame($priya->id, $meeting->customer_id);
        $this->assertSame(MeetingSource::Portal, $meeting->source);

        $this->getJson('/api/v1/my/meetings')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/my/meetings/{$data['reference']}")->assertOk()->assertJsonPath('data.reference', $data['reference']);

        $this->app['auth']->forgetGuards();
        $other = $this->customer('other@example.test');
        $otherToken = $other->createToken('portal', ['portal'])->plainTextToken;

        $this->flushHeaders()->withHeader('Authorization', "Bearer {$otherToken}");
        $this->getJson('/api/v1/my/meetings')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/my/meetings/{$data['reference']}")->assertNotFound();
        $this->postJson("/api/v1/my/meetings/{$data['reference']}/cancel")->assertNotFound();
        $this->assertSame(MeetingStatus::Scheduled, Meeting::sole()->status);
    }

    public function test_a_view_as_session_does_not_book_under_the_account(): void
    {
        $this->host();
        $priya = $this->customer();
        $viewAs = $priya->createToken(Customer::IMPERSONATION_TOKEN, ['portal', Customer::IMPERSONATION_ABILITY])->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$viewAs}")->postJson('/api/v1/meetings', $this->payload())->assertCreated();

        $this->assertNull(Meeting::sole()->customer_id);
        $this->assertSame(MeetingSource::Site, Meeting::sole()->source);
    }

    // ---------------------------------------------------------------- console

    public function test_the_role_gates(): void
    {
        $this->host();
        $data = $this->bookNow();

        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/meetings')->assertOk()->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/meeting-hosts')->assertForbidden();
        $this->getJson('/api/v1/admin/meeting-types')->assertOk();

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum')
            ->getJson("/api/v1/admin/meetings/{$data['reference']}")->assertOk()->assertJsonStructure(['data' => ['trail']]);
        $this->getJson('/api/v1/admin/meeting-types')->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::ContentManager, 'cm@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/meetings')->assertForbidden();
        $this->getJson('/api/v1/admin/my-meetings')->assertForbidden();
    }

    public function test_a_host_sees_their_own_diary_and_nobody_else_s(): void
    {
        $anita = $this->host();
        $ravi = $this->host('ravi@example.test');
        $this->bookNow();
        $other = $this->bookNow(['email' => 'second@example.test', 'phone' => '9000000003']);
        $mine = Meeting::where('host_id', $anita->id)->sole();

        $this->actingAs($anita, 'sanctum')->getJson('/api/v1/admin/my-meetings')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.reference', $mine->reference)
            ->assertJsonPath('meta.hosts.0.id', $anita->id);
        $this->getJson("/api/v1/admin/my-meetings/{$other['reference']}")->assertNotFound();
        $this->getJson('/api/v1/admin/meetings')->assertForbidden();

        $this->patchJson("/api/v1/admin/my-meetings/{$mine->reference}", ['staff_note' => 'Wants a quote.'])
            ->assertOk()->assertJsonPath('data.staff_note', 'Wants a quote.');
        $this->assertSame($ravi->id, Meeting::where('reference', $other['reference'])->value('host_id'));
    }

    public function test_the_desk_books_outside_the_rules_only_behind_the_ticks_and_never_over_a_meeting(): void
    {
        $anita = $this->host();
        $sales = $this->staff(RoleEnum::SalesManager, 'sales@example.test');
        $priya = $this->customer();
        $this->actingAs($sales, 'sanctum');

        $body = ['type' => 'product-demo', 'name' => 'Priya Sharma', 'email' => 'priya@example.test', 'customer_id' => $priya->id];

        // Inside the notice: the console skips it.
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-05T10:00:00+05:30'])
            ->assertCreated()
            ->assertJsonPath('data.source', 'console')
            ->assertJsonPath('data.host_id', $anita->id)
            ->assertJsonPath('data.customer_id', $priya->id)
            ->assertJsonPath('data.created_by', $sales->id);
        // An existing customer booked by the desk files no lead.
        $this->assertSame(0, Lead::count());

        // The past, never.
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-05T08:00:00+05:30'])
            ->assertStatus(422)->assertJsonValidationErrors('start');

        // Outside hours: only with the tick.
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-05T19:00:00+05:30'])
            ->assertStatus(422)->assertJsonValidationErrors('start');
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-05T19:00:00+05:30', 'outside_hours' => true])
            ->assertCreated();

        // Over a meeting booked here: never, whatever is ticked.
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-05T10:00:00+05:30', 'outside_hours' => true, 'override_google_busy' => true])
            ->assertStatus(422)->assertJsonPath('errors.start.0', MeetingActions::TAKEN);

        // A named host must be one.
        $this->postJson('/api/v1/admin/meetings', $body + ['start' => '2026-10-06T10:00:00+05:30', 'host_id' => $sales->id])
            ->assertStatus(422)->assertJsonValidationErrors('host_id');
    }

    public function test_the_desk_moves_a_meeting_to_another_host(): void
    {
        $anita = $this->host();
        $ravi = $this->host('ravi@example.test');
        $data = $this->bookNow();
        $this->assertSame($anita->id, Meeting::sole()->host_id);

        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum')
            ->postJson("/api/v1/admin/meetings/{$data['reference']}/move", ['start' => '2026-10-07T11:30:00+05:30', 'host_id' => $ravi->id])
            ->assertOk()
            ->assertJsonPath('data.host_id', $ravi->id)
            ->assertJsonPath('data.host_name', 'Ravi')
            ->assertJsonPath('data.reschedule_count', 0)
            ->assertJsonPath('data.trail.2.type', 'rescheduled');

        // The new host is told, with the agenda.
        Notification::assertSentOnDemand(MeetingBooked::class, fn ($n, $c, $to) => $to->routes['mail'] === 'ravi@example.test');
    }

    public function test_the_admin_slots_name_the_hosts_and_the_overrides(): void
    {
        $this->host();
        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum');

        $slot = $this->getJson('/api/v1/admin/meetings/slots?type=product-demo&date=2026-10-06')->assertOk()->json('data.slots.0');
        $this->assertSame('10:00', $slot['time_label']);
        $this->assertSame('Anita', $slot['hosts'][0]['name']);
        $this->assertFalse($slot['outside_hours']);

        $slots = collect($this->getJson('/api/v1/admin/meetings/slots?type=product-demo&date=2026-10-06&outside_hours=1')->json('data.slots'));
        $this->assertCount(48, $slots);
        $this->assertTrue($slots->firstWhere('time_label', '19:00')['outside_hours']);
    }

    public function test_the_outcome_waits_for_the_start_and_needs_outcome_counts_it(): void
    {
        $this->host();
        $data = $this->bookNow();
        $sales = $this->staff(RoleEnum::SalesManager, 'sales@example.test');
        $this->actingAs($sales, 'sanctum');

        $this->patchJson("/api/v1/admin/meetings/{$data['reference']}", ['status' => 'completed'])
            ->assertStatus(422)->assertJsonValidationErrors('status');

        $this->travelTo(Carbon::parse('2026-10-07 12:00:00', 'Asia/Kolkata'));

        $this->getJson('/api/v1/admin/meetings?needs_outcome=1')->assertOk()
            ->assertJsonPath('meta.total', 1)->assertJsonPath('meta.needs_outcome_count', 1)
            ->assertJsonPath('data.0.needs_outcome', true);
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonPath('data.meetings.needs_outcome', 1);

        $this->patchJson("/api/v1/admin/meetings/{$data['reference']}", ['status' => 'cancelled'])
            ->assertStatus(422)->assertJsonValidationErrors('status');
        $this->patchJson("/api/v1/admin/meetings/{$data['reference']}", ['status' => 'no_show', 'note' => 'Did not join.'])
            ->assertOk()->assertJsonPath('data.status', 'no_show');
        // What happened can be corrected, once.
        $this->patchJson("/api/v1/admin/meetings/{$data['reference']}", ['status' => 'completed'])
            ->assertOk()->assertJsonPath('data.status', 'completed');
        $this->assertNotNull(Meeting::sole()->completed_at);

        $this->getJson('/api/v1/admin/meetings?needs_outcome=1')->assertJsonPath('meta.total', 0);
    }

    public function test_the_list_filters(): void
    {
        $anita = $this->host();
        $this->host('ravi@example.test');
        $this->bookNow();
        $this->bookNow(['email' => 'b@example.test', 'phone' => '9000000004', 'name' => 'Bharat Rao', 'start' => '2026-10-09T10:00:00+05:30']);
        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum');

        $this->getJson('/api/v1/admin/meetings?q=Bharat')->assertJsonPath('meta.total', 1);
        $this->getJson("/api/v1/admin/meetings?host={$anita->id}")->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/meetings?from=2026-10-08&to=2026-10-09')->assertJsonPath('meta.total', 1);
        $this->getJson('/api/v1/admin/meetings?type=product-demo&status=scheduled')->assertJsonPath('meta.total', 2);
        $this->getJson('/api/v1/admin/meetings?google=failed')->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/admin/meetings?sort=name&dir=asc')->assertJsonPath('data.0.name', 'Bharat Rao');
        $this->getJson('/api/v1/admin/meetings')->assertJsonPath('meta.timezone_label', 'IST')
            ->assertJsonPath('meta.hosts.0.name', 'Anita')
            ->assertJsonPath('data.0.starts_at', '2026-10-07T11:00:00+05:30');
    }

    public function test_the_dashboard_tile_is_null_for_a_role_without_meetings(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/dashboard')->assertOk()->assertJsonPath('data.meetings', ['today' => 0, 'needs_outcome' => 0]);
    }

    public function test_a_meeting_lead_links_back(): void
    {
        $this->host();
        $data = $this->bookNow();

        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/leads/'.Lead::sole()->id)
            ->assertOk()
            ->assertJsonPath('data.meeting.reference', $data['reference'])
            ->assertJsonPath('data.meeting.admin_path', '/admin/meetings/'.$data['reference']);
    }

    // ---------------------------------------------------------------- reminders

    public function test_each_reminder_goes_once_and_a_move_re_arms_them(): void
    {
        $this->host();
        $data = $this->bookNow(['start' => '2026-10-08T15:00:00+05:30']);

        $this->artisan('technoware:remind-meetings')->assertSuccessful();
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 0);
        $this->assertSame(0, MeetingReminder::count());

        // A day before.
        $this->travelTo(Carbon::parse('2026-10-07 15:00:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 1);

        // Moved to Friday: owed again.
        $this->postJson("/api/v1/meetings/{$data['reference']}/reschedule", ['token' => $data['access_token'], 'start' => '2026-10-09T10:00:00+05:30'])->assertOk();
        $this->travelTo(Carbon::parse('2026-10-08 10:00:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 2);

        // An hour before, then nothing once it has started.
        $this->travelTo(Carbon::parse('2026-10-09 09:05:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 3);
        $this->travelTo(Carbon::parse('2026-10-09 10:01:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 3);
    }

    public function test_an_offset_already_past_at_booking_is_never_sent(): void
    {
        $this->host();
        $this->bookNow(['start' => '2026-10-05T14:00:00+05:30']);   // five hours away

        // The day-before reminder was due before the booking: written sent.
        $this->assertSame([1440], MeetingReminder::whereNotNull('sent_at')->pluck('offset_minutes')->all());

        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 0);

        $this->travelTo(Carbon::parse('2026-10-05 13:00:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 1);
    }

    public function test_a_cancelled_meeting_is_not_reminded(): void
    {
        $this->host();
        $data = $this->bookNow();
        $this->postJson("/api/v1/meetings/{$data['reference']}/cancel", ['token' => $data['access_token']])->assertOk();

        $this->travelTo(Carbon::parse('2026-10-07 10:30:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-meetings');
        Notification::assertSentOnDemandTimes(MeetingReminderMail::class, 0);
    }

    // ---------------------------------------------------------------- the calendar

    public function test_a_synced_meeting_is_confirmed_with_the_link_and_no_file(): void
    {
        $this->host();
        $calendar = $this->fakeCalendar();

        $data = $this->bookNow();

        $meeting = Meeting::sole();
        $this->assertSame([$data['reference']], $calendar->synced);
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        Notification::assertSentOnDemand(MeetingScheduled::class, fn (MeetingScheduled $n, $c, $to) => ! $n->withIcs
            && $n->toMail($to)->rawAttachments === []
            && str_contains(implode(' ', $n->toMail($to)->introLines), 'https://meet.google.com/'));
        $this->assertSame('link', $meeting->events()->where('type', 'confirmation_sent')->value('to_value'));

        // Moved: Google sends the update; ours carries no file.
        $this->postJson("/api/v1/meetings/{$data['reference']}/reschedule", ['token' => $data['access_token'], 'start' => '2026-10-08T10:00:00+05:30'])->assertOk();
        Notification::assertSentOnDemand(MeetingRescheduled::class, fn (MeetingRescheduled $n) => ! $n->withIcs);
        $this->assertCount(2, $calendar->synced);
    }

    public function test_a_link_still_being_made_holds_the_confirmation(): void
    {
        $this->host();
        $calendar = $this->fakeCalendar('synced_no_link');

        $this->bookNow();
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 0);

        // The sweeper fills the link in: now it goes, with the link.
        $calendar->outcome = 'synced';
        $calendar->sync(Meeting::sole());
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 1);
        Notification::assertSentOnDemandTimes(MeetingLinkReady::class, 0);
    }

    public function test_a_sync_that_fails_for_good_sends_the_file_then_the_link_when_it_arrives(): void
    {
        $this->host();
        $calendar = $this->fakeCalendar('failed');

        $this->bookNow();
        $meeting = Meeting::sole();

        // Retries under the cap send nothing.
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 0);
        for ($i = 2; $i <= MeetingSync::MAX_ATTEMPTS; $i++) {
            $calendar->sync($meeting->refresh());
        }

        $this->assertSame(MeetingSync::MAX_ATTEMPTS, $meeting->refresh()->google_attempts);
        Notification::assertSentOnDemandTimes(MeetingSyncFailed::class, 1);
        Notification::assertSentOnDemand(MeetingScheduled::class, fn (MeetingScheduled $n) => $n->withIcs);
        $this->assertSame(MeetingStatus::Scheduled, $meeting->status);

        // The desk presses Retry and it works: the link follows.
        $calendar->outcome = 'synced';
        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->postJson("/api/v1/admin/meetings/{$meeting->reference}/resync")->assertOk()
            ->assertJsonPath('data.google.status', 'synced');

        Notification::assertSentOnDemandTimes(MeetingLinkReady::class, 1);
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 1);

        // A cancellation follows the confirmation's path: it had our file.
        $this->postJson("/api/v1/admin/meetings/{$meeting->reference}/cancel")->assertOk();
        Notification::assertSentOnDemand(MeetingCancelled::class, fn (MeetingCancelled $n) => $n->withIcs);
    }

    public function test_a_meeting_booked_before_the_calendar_was_connected_stays_on_the_file(): void
    {
        $this->host();
        $data = $this->bookNow();
        $this->assertSame(MeetingGoogleStatus::Off, Meeting::sole()->google_status);

        $calendar = $this->fakeCalendar();
        $this->postJson("/api/v1/meetings/{$data['reference']}/reschedule", ['token' => $data['access_token'], 'start' => '2026-10-08T10:00:00+05:30'])->assertOk();

        $this->assertSame([], $calendar->synced);
        $this->assertSame(MeetingGoogleStatus::Off, Meeting::sole()->google_status);
        Notification::assertSentOnDemand(MeetingRescheduled::class, fn (MeetingRescheduled $n) => $n->withIcs);

        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->postJson("/api/v1/admin/meetings/{$data['reference']}/resync")->assertStatus(422)->assertJsonValidationErrors('google');
    }

    public function test_the_listener_answers_the_synced_event(): void
    {
        $this->host();
        $meeting = MeetingActions::book(
            $this->type,
            CarbonImmutable::parse('2026-10-07 11:00', 'Asia/Kolkata'),
            ['name' => 'Priya', 'email' => 'priya@example.test', 'phone' => '9876543210'],
            MeetingSource::Site,
            Request::create('/api/v1/meetings', 'POST'),
        );
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 1);   // off: at once

        // An event arriving later for a meeting already confirmed sends nothing new.
        MeetingSynced::dispatch($meeting, MeetingGoogleStatus::Off, null);
        Notification::assertSentOnDemandTimes(MeetingScheduled::class, 1);
    }

    public function test_the_calendar_file_sequence_grows_and_a_cancellation_outranks_it(): void
    {
        $at = CarbonImmutable::parse('2026-10-07 11:00', 'Asia/Kolkata');

        $this->assertSame(Ics::sequence($at) + 1, Ics::sequence($at, cancelled: true));
        $this->assertGreaterThan(Ics::sequence($at), Ics::sequence($at->addSecond()));

        $file = Ics::event('MT-2026-00001', 5, $at, $at->addMinutes(30), 'Demo, with a comma', 'Line one', 'https://meet.google.com/x', true);
        $this->assertStringContainsString("STATUS:CANCELLED\r\n", $file);
        $this->assertStringContainsString('SUMMARY:Demo\, with a comma', $file);
        $this->assertStringContainsString('DTSTART:20261007T053000Z', $file);
        $this->assertStringContainsString('URL:https://meet.google.com/x', $file);
    }

    // ---------------------------------------------------------------- staff guards

    public function test_a_host_with_meetings_to_come_cannot_stop_hosting(): void
    {
        $anita = $this->host();
        $this->bookNow();
        $admin = $this->staff(RoleEnum::Admin, 'admin@example.test');
        $this->actingAs($admin, 'sanctum');

        $this->deleteJson("/api/v1/admin/staff/{$anita->id}")->assertStatus(422)
            ->assertJsonPath('message', MeetingActions::reassignFirst(1));
        $this->patchJson("/api/v1/admin/staff/{$anita->id}", ['is_active' => false])
            ->assertStatus(422)->assertJsonValidationErrors('is_active');
        $this->patchJson("/api/v1/admin/staff/{$anita->id}", ['roles' => ['support_engineer']])
            ->assertStatus(422)->assertJsonValidationErrors('roles');
        // Keeping the role is fine.
        $this->patchJson("/api/v1/admin/staff/{$anita->id}", ['roles' => ['meeting_host', 'support_engineer']])->assertOk();

        // Once it is over, they are free to go.
        $this->travelTo(Carbon::parse('2026-10-08 09:00:00', 'Asia/Kolkata'));
        $this->patchJson("/api/v1/admin/staff/{$anita->id}", ['is_active' => false])->assertOk();
    }

    // ---------------------------------------------------------------- types and hosts

    public function test_types_are_edited_with_their_hosts_and_kept_while_they_have_meetings(): void
    {
        $anita = $this->host();
        $sales = $this->staff(RoleEnum::SalesManager, 'sales@example.test');
        $this->actingAs($sales, 'sanctum');

        $created = $this->postJson('/api/v1/admin/meeting-types', [
            'name' => 'Support call', 'minutes' => 45, 'buffer_after' => 15, 'host_ids' => [$anita->id],
        ])->assertCreated()
            ->assertJsonPath('data.slug', 'support-call')
            ->assertJsonPath('data.host_ids', [$anita->id])
            ->assertJsonPath('data.hosts.0.eligible', true)
            ->json('data');

        $this->postJson('/api/v1/admin/meeting-types', ['name' => 'Bad', 'minutes' => 30, 'host_ids' => [$sales->id]])
            ->assertStatus(422)->assertJsonValidationErrors('host_ids');
        $this->postJson('/api/v1/admin/meeting-types', ['name' => 'Short', 'minutes' => 10])
            ->assertStatus(422)->assertJsonValidationErrors('minutes');

        $this->patchJson("/api/v1/admin/meeting-types/{$created['id']}", ['host_ids' => []])
            ->assertOk()->assertJsonPath('data.host_ids', []);

        $this->getJson('/api/v1/admin/meeting-types')->assertOk()
            ->assertJsonPath('meta.eligible_hosts.0.id', $anita->id)
            ->assertJsonCount(2, 'data');

        $this->bookNow();
        $this->deleteJson("/api/v1/admin/meeting-types/{$this->type->id}")->assertStatus(422)->assertJsonValidationErrors('type');
        $this->deleteJson("/api/v1/admin/meeting-types/{$created['id']}")->assertOk();
    }

    public function test_hosts_have_hours_and_time_off(): void
    {
        $anita = $this->host();
        $admin = $this->staff(RoleEnum::Admin, 'admin@example.test');
        $this->actingAs($admin, 'sanctum');

        $this->getJson('/api/v1/admin/meeting-hosts')->assertOk()
            ->assertJsonCount(1, 'data')   // the administrator is not a host
            ->assertJsonPath('data.0.uses_default_hours', true)
            ->assertJsonPath('data.0.free_busy', 'not_connected')
            ->assertJsonPath('meta.default_hours.0', ['weekday' => 1, 'start' => '10:00', 'end' => '18:00']);

        $this->putJson("/api/v1/admin/meeting-hosts/{$anita->id}/hours", ['hours' => [
            ['weekday' => 2, 'start' => '14:00', 'end' => '16:00'],
            ['weekday' => 3, 'start' => '09:00', 'end' => '08:00'],
        ]])->assertStatus(422)->assertJsonValidationErrors('hours.1.end');

        $this->putJson("/api/v1/admin/meeting-hosts/{$anita->id}/hours", ['hours' => [['weekday' => 2, 'start' => '14:00', 'end' => '16:00']]])
            ->assertOk()->assertJsonPath('data.uses_default_hours', false)->assertJsonPath('data.hours.0.start', '14:00');

        $timeOff = $this->postJson("/api/v1/admin/meeting-hosts/{$anita->id}/time-off", [
            'starts_at' => '2026-10-12T00:00', 'ends_at' => '2026-10-17T00:00', 'note' => 'Leave',
        ])->assertCreated()->json('data.time_off.0');
        $this->assertSame('2026-10-12T00:00:00+05:30', $timeOff['starts_at']);

        $this->deleteJson("/api/v1/admin/meeting-hosts/{$admin->id}/time-off/{$timeOff['id']}")->assertNotFound();
        $this->deleteJson("/api/v1/admin/meeting-hosts/{$anita->id}/time-off/{$timeOff['id']}")->assertOk()->assertJsonCount(0, 'data.time_off');

        $this->putJson("/api/v1/admin/meeting-hosts/{$anita->id}/hours", ['hours' => []])->assertOk()->assertJsonPath('data.uses_default_hours', true);
    }
}
