<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\VisitStatus;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Role;
use App\Models\Service;
use App\Models\Setting;
use App\Models\User;
use App\Models\VisitRequest;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Notifications\VisitCancelled;
use App\Notifications\VisitConfirmed;
use App\Notifications\VisitReminder;
use App\Notifications\VisitRequested;
use App\Notifications\VisitRequestReceived;
use App\Support\Mail\MessageCatalogue;
use App\Support\Visits\Ics;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Engineer visit requests (2026-09-26, docs/visits.md): the customer offers
 * times, the desk confirms one.
 *
 * The clock is fixed at Monday 28 September 2026, 10:00 IST, so "one day's
 * notice" is Tuesday the 29th, the horizon is 28 October and Sunday 4 October
 * is the first day nobody visits.
 */
class VisitRequestTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-09-28 10:00:00', 'Asia/Kolkata'));
        Notification::fake();
    }

    private function setting(string $key, ?string $value): void
    {
        Setting::where('key', $key)->firstOrFail()->forceFill(['value' => $value])->save();
    }

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::create(['name' => ucfirst($role->value), 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
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
            'name' => 'Priya Sharma',
            'email' => 'priya@meridianfoods.test',
            'phone' => '+91 98765 43210',
            'company' => 'Meridian Foods',
            'site_address' => ['line1' => '14 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'notes' => 'Two floors; the rack is in the basement.',
            'preferred' => [
                ['date' => '2026-09-29', 'window' => 'morning'],
                ['date' => '2026-10-01', 'window' => 'afternoon'],
            ],
            '_source_url' => 'https://www.technoware.in/book-a-visit?service=network-installation',
        ], $overrides);
    }

    private function place(array $overrides = []): array
    {
        return $this->postJson('/api/v1/visits', $this->payload($overrides))->assertCreated()->json('data');
    }

    // ---------------------------------------------------------------- intake

    public function test_a_request_is_stored_files_a_lead_and_tells_both_sides(): void
    {
        $service = Service::create(['title' => 'Network installation', 'slug' => 'network-installation', 'status' => PublishStatus::Published]);

        $data = $this->place(['service_id' => $service->id]);

        $this->assertMatchesRegularExpression('/^TV-2026-\d{5}$/', $data['reference']);
        $this->assertSame(64, strlen($data['access_token']));

        $visit = VisitRequest::sole();
        $this->assertSame(VisitStatus::Requested, $visit->status);
        $this->assertSame([['date' => '2026-09-29', 'window' => 'morning'], ['date' => '2026-10-01', 'window' => 'afternoon']], $visit->preferred);
        $this->assertSame('700016', $visit->site_address['pin']);
        $this->assertSame('India', $visit->site_address['country']);
        $this->assertSame('/book-a-visit?service=network-installation', $visit->source_path);

        $lead = Lead::sole();
        $this->assertSame('visit', $lead->channel);
        $this->assertSame($lead->id, $visit->lead_id);
        $this->assertSame('visit_request', $lead->source_type);
        $this->assertStringContainsString('Network installation', (string) $lead->subject);

        Notification::assertSentOnDemand(VisitRequestReceived::class);
        Notification::assertSentOnDemand(VisitRequested::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'priya@meridianfoods.test');
        $this->assertSame('requested', $visit->events()->sole()->type);
    }

    public function test_the_receipt_does_not_echo_what_was_typed(): void
    {
        $this->place(['notes' => 'UNIQUE-FREE-TEXT-MARKER']);

        Notification::assertSentOnDemand(VisitRequested::class, function (VisitRequested $n, $channels, $to) {
            $mail = $n->toMail($to);

            return ! str_contains(json_encode($mail->toArray()), 'UNIQUE-FREE-TEXT-MARKER');
        });
    }

    public function test_the_token_is_never_serialised_again(): void
    {
        $data = $this->place();
        $visit = VisitRequest::sole();

        $this->assertArrayNotHasKey('access_token', $visit->toArray());
        $this->getJson("/api/v1/visits/{$data['reference']}?token={$data['access_token']}")
            ->assertOk()->assertJsonMissingPath('data.access_token')->assertJsonMissingPath('data.staff_note');
    }

    public function test_a_visit_request_webhook_is_emitted(): void
    {
        Queue::fake();
        Webhook::create(['name' => 'CRM', 'url' => 'https://crm.example.com/hook', 'secret' => 'whsec_test', 'events' => ['visit.requested'], 'is_active' => true]);

        $this->place();

        $delivery = WebhookDelivery::sole();
        $this->assertSame('visit.requested', $delivery->event instanceof \BackedEnum ? $delivery->event->value : $delivery->event);
        $this->assertStringNotContainsString(VisitRequest::sole()->access_token, json_encode($delivery->payload));
    }

    // ------------------------------------------------------------ validation

    public function test_a_sunday_a_holiday_short_notice_and_the_horizon_are_refused_by_row(): void
    {
        $this->setting('visit_holidays', "2026-10-02 Gandhi Jayanti\n");

        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [
            ['date' => '2026-09-28', 'window' => 'morning'],   // today: under a day's notice
            ['date' => '2026-10-04', 'window' => 'morning'],   // a Sunday
            ['date' => '2026-10-02', 'window' => 'evening'],   // a holiday
        ]]))->assertUnprocessable()
            ->assertJsonValidationErrors(['preferred.0.date', 'preferred.1.date', 'preferred.2.date']);

        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [
            ['date' => '2026-11-20', 'window' => 'morning'],   // past thirty days
        ]]))->assertUnprocessable()->assertJsonValidationErrors(['preferred.0.date']);

        $this->assertSame(0, VisitRequest::count());
    }

    public function test_at_most_three_times_a_known_window_and_no_repeats(): void
    {
        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [
            ['date' => '2026-09-29', 'window' => 'morning'],
            ['date' => '2026-09-30', 'window' => 'morning'],
            ['date' => '2026-10-01', 'window' => 'morning'],
            ['date' => '2026-10-05', 'window' => 'morning'],
        ]]))->assertUnprocessable()->assertJsonValidationErrors(['preferred']);

        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [
            ['date' => '2026-09-29', 'window' => 'midnight'],
            ['date' => '2026-09-30', 'window' => 'morning'],
            ['date' => '2026-09-30', 'window' => 'morning'],
        ]]))->assertUnprocessable()->assertJsonValidationErrors(['preferred.0.window', 'preferred.2.date']);

        $this->postJson('/api/v1/visits', $this->payload(['preferred' => []]))
            ->assertUnprocessable()->assertJsonValidationErrors(['preferred']);
    }

    public function test_the_windows_follow_the_setting(): void
    {
        $this->setting('visit_windows', "early|Early|08:00|10:00\n");

        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [['date' => '2026-09-29', 'window' => 'morning']]]))
            ->assertUnprocessable()->assertJsonValidationErrors(['preferred.0.window']);
        $this->postJson('/api/v1/visits', $this->payload(['preferred' => [['date' => '2026-09-29', 'window' => 'early']]]))
            ->assertCreated();

        $this->getJson('/api/v1/visits/options')->assertOk()
            ->assertJsonPath('data.windows.0.value', 'early')
            ->assertJsonPath('data.min_date', '2026-09-29')
            ->assertJsonPath('data.max_date', '2026-10-28');
    }

    public function test_a_mobile_the_site_and_the_honeypot_are_required_shapes(): void
    {
        $this->postJson('/api/v1/visits', $this->payload([
            'phone' => '033 2229 1234',
            'site_address' => ['line1' => '', 'city' => 'Kolkata', 'state' => 'WB', 'pin' => '7000'],
        ]))->assertUnprocessable()->assertJsonValidationErrors(['phone', 'site_address.line1', 'site_address.pin']);

        $this->postJson('/api/v1/visits', $this->payload(['website' => 'http://spam.test']))
            ->assertUnprocessable()->assertJsonValidationErrors(['website']);
    }

    public function test_switched_off_refuses_with_a_sentence(): void
    {
        $this->setting('visits_enabled', '0');

        $this->postJson('/api/v1/visits', $this->payload())->assertForbidden();
        $this->assertSame(0, VisitRequest::count());
    }

    // --------------------------------------------------------- the guest link

    public function test_the_guest_link_is_scoped_by_its_token(): void
    {
        $data = $this->place();
        $ref = $data['reference'];

        $this->getJson("/api/v1/visits/{$ref}?token={$data['access_token']}")->assertOk()->assertJsonPath('data.status', 'requested');
        $this->getJson("/api/v1/visits/{$ref}?token=".str_repeat('a', 64))->assertNotFound();
        $this->getJson("/api/v1/visits/{$ref}")->assertNotFound();
        $this->getJson("/api/v1/visits/TV-2026-99999?token={$data['access_token']}")->assertNotFound();
        $this->postJson("/api/v1/visits/{$ref}/cancel", ['token' => 'wrong'])->assertNotFound();

        $this->assertSame(VisitStatus::Requested, VisitRequest::sole()->status);
    }

    public function test_a_guest_can_ask_for_other_times_and_then_cancel(): void
    {
        $data = $this->place();
        $ref = $data['reference'];

        $this->postJson("/api/v1/visits/{$ref}/reschedule", [
            'token' => $data['access_token'],
            'preferred' => [['date' => '2026-10-06', 'window' => 'evening']],
        ])->assertOk()->assertJsonPath('data.preferred.0.date', '2026-10-06');

        Notification::assertSentOnDemand(VisitRequestReceived::class, fn (VisitRequestReceived $n) => $n->templateKey() === 'visit_request_changed');

        $this->postJson("/api/v1/visits/{$ref}/cancel", ['token' => $data['access_token']])
            ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.can_cancel', false);

        Notification::assertSentOnDemand(VisitCancelled::class);
        $this->assertNotNull(VisitRequest::sole()->cancelled_at);

        // Nothing left to cancel.
        $this->postJson("/api/v1/visits/{$ref}/cancel", ['token' => $data['access_token']])->assertUnprocessable();
    }

    // --------------------------------------------------------------- portal

    public function test_a_signed_in_customer_is_stamped_and_sees_only_their_own(): void
    {
        $priya = $this->customer();
        $token = $priya->createToken('portal', ['portal'])->plainTextToken;

        $data = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/visits', $this->payload())->assertCreated()->json('data');

        $this->assertSame($priya->id, VisitRequest::sole()->customer_id);

        $this->getJson('/api/v1/my/visits')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson("/api/v1/my/visits/{$data['reference']}")->assertOk();

        // Somebody else's is a 404, never a 403.
        $this->app['auth']->forgetGuards();
        $other = $this->customer('other@example.test');
        $otherToken = $other->createToken('portal', ['portal'])->plainTextToken;

        $this->flushHeaders()->withHeader('Authorization', "Bearer {$otherToken}");
        $this->getJson('/api/v1/my/visits')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/v1/my/visits/{$data['reference']}")->assertNotFound();
        $this->postJson("/api/v1/my/visits/{$data['reference']}/cancel")->assertNotFound();
        $this->assertSame(VisitStatus::Requested, VisitRequest::sole()->status);
    }

    public function test_a_view_as_session_does_not_file_a_request_under_the_account(): void
    {
        $priya = $this->customer();
        $viewAs = $priya->createToken(Customer::IMPERSONATION_TOKEN, ['portal', Customer::IMPERSONATION_ABILITY])->plainTextToken;

        $this->withHeader('Authorization', "Bearer {$viewAs}")->postJson('/api/v1/visits', $this->payload())->assertCreated();

        $this->assertNull(VisitRequest::sole()->customer_id);
    }

    // ---------------------------------------------------------------- console

    public function test_sales_and_support_may_work_the_queue_and_a_content_manager_may_not(): void
    {
        $this->place();
        $ref = VisitRequest::sole()->reference;

        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/visits')->assertOk()
            ->assertJsonPath('meta.awaiting_count', 1)
            ->assertJsonPath('data.0.reference', $ref);

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum')
            ->getJson("/api/v1/admin/visits/{$ref}")->assertOk()->assertJsonPath('data.allowed_next.0.value', 'requested');

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::ContentManager, 'cm@example.test'), 'sanctum')
            ->getJson('/api/v1/admin/visits')->assertForbidden();
    }

    public function test_confirming_sets_the_time_and_emails_a_calendar_file(): void
    {
        $this->place();
        $visit = VisitRequest::sole();
        $sales = $this->staff(RoleEnum::SalesManager, 'sales@example.test');
        $engineer = $this->staff(RoleEnum::SupportEngineer, 'engineer@example.test');

        $this->actingAs($sales, 'sanctum')->postJson("/api/v1/admin/visits/{$visit->reference}/confirm", [
            'start_at' => '2026-09-30T10:30', 'minutes' => 90, 'assigned_to' => $engineer->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.visit_time', '10:30 – 12:00')
            ->assertJsonPath('data.assigned_to', $engineer->id);

        $visit->refresh();
        $this->assertSame('2026-09-30 10:30:00', $visit->scheduled_start_at->format('Y-m-d H:i:s'));
        $this->assertNotNull($visit->confirmed_at);
        // Two days ahead: the reminder is still owed.
        $this->assertNull($visit->reminded_at);

        Notification::assertSentOnDemand(VisitConfirmed::class, function (VisitConfirmed $n, $channels, $to) use ($visit) {
            $mail = $n->toMail($to);
            $ics = $mail->rawAttachments[0]['data'] ?? '';

            return $n->templateKey() === 'visit_confirmed'
                && $mail->rawAttachments[0]['name'] === $visit->reference.'.ics'
                && str_contains($ics, 'DTSTART:20260930T050000Z')   // 10:30 IST
                && str_contains($ics, 'DTEND:20260930T063000Z')
                && str_contains($ics, 'UID:'.$visit->reference.'@')
                && str_contains($ics, "\r\n");
        });

        // Again, at a new time: a move, with the "moved" message.
        $this->postJson("/api/v1/admin/visits/{$visit->reference}/confirm", ['start_at' => '2026-10-01T15:00'])->assertOk();
        Notification::assertSentOnDemand(VisitConfirmed::class, fn (VisitConfirmed $n) => $n->templateKey() === 'visit_rescheduled');
        $this->assertContains('rescheduled', $visit->events()->pluck('type')->all());
    }

    public function test_status_moves_are_checked_and_confirmed_is_refused_here(): void
    {
        $this->place();
        $visit = VisitRequest::sole();
        $this->actingAs($this->staff(RoleEnum::SupportEngineer, 'support@example.test'), 'sanctum');

        $this->patchJson("/api/v1/admin/visits/{$visit->reference}", ['status' => 'confirmed'])
            ->assertUnprocessable()->assertJsonValidationErrors(['status']);
        $this->patchJson("/api/v1/admin/visits/{$visit->reference}", ['status' => 'completed'])
            ->assertUnprocessable()->assertJsonValidationErrors(['status']);

        $this->patchJson("/api/v1/admin/visits/{$visit->reference}", ['status' => 'cancelled', 'cancel_reason' => 'Duplicate of TV-2026-00001', 'staff_note' => 'Rang them.'])
            ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.staff_note', 'Rang them.');

        Notification::assertSentOnDemand(VisitCancelled::class, fn (VisitCancelled $n, $c, $to) => str_contains(json_encode($n->toMail($to)->toArray()), 'Duplicate of'));

        // A cancelled visit cannot be given a time until it is reopened.
        $this->postJson("/api/v1/admin/visits/{$visit->reference}/confirm", ['start_at' => '2026-09-30T10:30'])
            ->assertUnprocessable();
        $this->patchJson("/api/v1/admin/visits/{$visit->reference}", ['status' => 'requested'])->assertOk();
    }

    public function test_the_staff_note_never_reaches_the_customer(): void
    {
        $data = $this->place();
        VisitRequest::sole()->forceFill(['staff_note' => 'Difficult site, bring a ladder'])->save();

        $this->getJson("/api/v1/visits/{$data['reference']}?token={$data['access_token']}")
            ->assertOk()->assertDontSee('ladder');
    }

    // ------------------------------------------------------------- reminders

    public function test_the_reminder_goes_once_and_only_within_a_day(): void
    {
        $this->place();
        $this->place(['email' => 'second@example.test']);
        [$soon, $later] = VisitRequest::orderBy('id')->get()->all();

        $soon->forceFill(['status' => VisitStatus::Confirmed, 'scheduled_start_at' => now()->addHours(20), 'scheduled_end_at' => now()->addHours(22)])->save();
        $later->forceFill(['status' => VisitStatus::Confirmed, 'scheduled_start_at' => now()->addHours(30), 'scheduled_end_at' => now()->addHours(32)])->save();

        $this->artisan('technoware:remind-visits')->assertSuccessful();
        $this->artisan('technoware:remind-visits')->assertSuccessful();

        Notification::assertSentOnDemandTimes(VisitReminder::class, 1);
        $this->assertNotNull($soon->fresh()->reminded_at);
        $this->assertNull($later->fresh()->reminded_at);
    }

    public function test_a_visit_confirmed_inside_a_day_is_not_reminded_again(): void
    {
        $this->place();
        $visit = VisitRequest::sole();

        $this->actingAs($this->staff(RoleEnum::SalesManager, 'sales@example.test'), 'sanctum')
            ->postJson("/api/v1/admin/visits/{$visit->reference}/confirm", ['start_at' => '2026-09-29T09:00'])->assertOk();

        $this->artisan('technoware:remind-visits')->assertSuccessful();

        Notification::assertSentOnDemandTimes(VisitReminder::class, 0);
    }

    // ------------------------------------------------------ the catalogue

    public function test_every_visit_message_renders_its_starting_copy(): void
    {
        foreach (['visit_request_received', 'visit_request_changed', 'visit_requested', 'visit_confirmed', 'visit_rescheduled', 'visit_cancelled', 'visit_reminder'] as $key) {
            $entry = MessageCatalogue::get($key);
            $this->assertNotNull($entry, "{$key} is missing from the catalogue");

            $this->actingAs($this->staff(RoleEnum::Admin, "admin-{$key}@example.test"), 'sanctum')
                ->postJson("/api/v1/admin/settings/email-templates/{$key}/preview", [
                    'subject' => $entry['subject'], 'body_html' => $entry['body'],
                ])->assertOk();

            $this->app['auth']->forgetGuards();
        }
    }

    public function test_the_calendar_file_escapes_and_folds(): void
    {
        $this->assertSame('Smith\, Jones \; Co\\\\ \nLine two', Ics::escape("Smith, Jones ; Co\\ \nLine two"));

        $folded = Ics::fold('DESCRIPTION:'.str_repeat('x', 200));
        foreach (explode("\r\n", $folded) as $line) {
            $this->assertLessThanOrEqual(75, strlen($line));
        }
    }
}
