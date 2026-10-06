<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\EventRegistrationStatus;
use App\Enums\PublishStatus;
use App\Models\Customer;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Lead;
use App\Models\Setting;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Notifications\EventRegistrationCancelled;
use App\Notifications\EventRegistrationConfirmed;
use App\Notifications\EventRegistrationReceived;
use App\Notifications\EventRegistrationWaitlisted;
use App\Support\Events\Availability;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Events, from the public side (0.118.0, docs/events.md, and the shapes in
 * docs/events-contract.md): the list, the page, whether an event can be
 * registered for, the calendar file, registering, and the registrant's own
 * link.
 *
 * The clock is fixed at Tuesday 6 October 2026, 10:00 IST. The event every
 * test starts from is on Thursday 12 November 2026, 3:00–4:30 pm.
 */
class EventTest extends TestCase
{
    use RefreshDatabase;

    private const JOIN = 'https://meet.example.com/the-join-link';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-06 10:00:00', 'Asia/Kolkata'));
        Notification::fake();
    }

    /** @param  array<string, mixed>  $overrides */
    private function event(array $overrides = []): Event
    {
        return Event::create(array_replace([
            'title' => 'Wi-Fi 7 for the office: a working session',
            'slug' => 'wifi-7-working-session',
            'summary' => 'Ninety minutes on what Wi-Fi 7 changes for a 200-seat office.',
            'body' => '<p>What we will cover.</p>',
            'status' => PublishStatus::Published,
            'format' => 'hybrid',
            'starts_at' => '2026-11-12 15:00:00',
            'ends_at' => '2026-11-12 16:30:00',
            'venue_name' => 'Technoware Experience Centre',
            'venue_city' => 'Mumbai',
            'venue_address' => "Unit 4, Lakeview Industrial Estate\nAndheri East, Mumbai 400093",
            'online_url' => self::JOIN,
            'registration_mode' => 'open',
            'max_seats' => 5,
        ], $overrides));
    }

    /** @param  array<string, mixed>  $overrides */
    private function payload(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Priya Das',
            'email' => 'priya@acme.co.in',
            'phone' => '+91 98765 43210',
            'company' => 'Acme Foods',
            'seats' => 2,
            'note' => 'One of us needs step-free access.',
            '_source_url' => 'https://www.technoware.in/events/wifi-7-working-session?utm_source=newsletter',
        ], $overrides);
    }

    /** @param  array<string, mixed>  $overrides */
    private function register(array $overrides = [], string $slug = 'wifi-7-working-session')
    {
        return $this->postJson("/api/v1/events/{$slug}/register", $this->payload($overrides));
    }

    /**
     * Register, and read the token where it lives: on the row. The response
     * carries none — the manage link is in the email and nowhere else.
     *
     * @param  array<string, mixed>  $overrides
     */
    private function registered(array $overrides = []): string
    {
        $this->register($overrides)->assertCreated()->assertJsonMissingPath('data.manage_path');

        return EventRegistration::where('email', mb_strtolower($overrides['email'] ?? 'priya@acme.co.in'))->sole()->token;
    }

    // ------------------------------------------------------------- the list

    public function test_the_list_is_published_upcoming_soonest_first_and_the_labels_are_the_apis(): void
    {
        $this->event();
        $this->event(['title' => 'Sooner', 'slug' => 'sooner', 'starts_at' => '2026-10-20 11:00:00', 'ends_at' => null, 'format' => 'online', 'venue_name' => 'A hall left over from a draft']);
        $this->event(['title' => 'A draft', 'slug' => 'a-draft', 'status' => PublishStatus::Draft]);
        $this->event(['title' => 'Archived', 'slug' => 'archived', 'status' => PublishStatus::Archived]);
        $this->event(['title' => 'Last month', 'slug' => 'last-month', 'starts_at' => '2026-09-10 15:00:00', 'ends_at' => '2026-09-10 16:00:00']);

        $response = $this->getJson('/api/v1/events')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.slug', 'sooner')
            ->assertJsonPath('data.1.slug', 'wifi-7-working-session')
            ->assertJsonPath('meta.total', 2)
            // Structurally absent: the join link is on no public read.
            ->assertJsonMissingPath('data.0.online_url')
            ->assertJsonMissingPath('data.1.online_url');

        // An online event has no venue, whatever the row still holds.
        $response->assertJsonPath('data.0.venue_name', null)->assertJsonPath('data.0.time_label', '11:00 am IST');

        $row = $response->json('data.1');
        $this->assertSame([
            'id', 'title', 'slug', 'summary', 'format', 'format_label', 'starts_at', 'ends_at', 'date_label', 'time_label',
            'day', 'month', 'year', 'venue_name', 'venue_city', 'cover_image', 'cover_image_alt', 'cover_image_focus',
            'is_featured', 'is_past', 'registration_mode', 'updated_at', 'seo',
        ], array_keys($row));

        $this->assertSame('hybrid', $row['format']);
        $this->assertSame('In person and online', $row['format_label']);
        $this->assertSame('2026-11-12T15:00:00+05:30', $row['starts_at']);
        $this->assertSame('2026-11-12T16:30:00+05:30', $row['ends_at']);
        $this->assertSame('Thursday 12 November 2026', $row['date_label']);
        $this->assertSame('3:00 pm – 4:30 pm IST', $row['time_label']);
        $this->assertSame(['12', 'Nov', '2026'], [$row['day'], $row['month'], $row['year']]);
        $this->assertSame('Technoware Experience Centre', $row['venue_name']);
        $this->assertFalse($row['is_past']);
        $this->assertSame('open', $row['registration_mode']);
        $this->assertSame('Wi-Fi 7 for the office: a working session', $row['seo']['title']);
        $this->assertStringNotContainsString('meet.example.com', $response->getContent());
    }

    public function test_past_is_newest_first_and_the_filters_narrow(): void
    {
        $this->event(['is_featured' => true]);
        $this->event(['title' => 'September', 'slug' => 'september', 'format' => 'in_person', 'starts_at' => '2026-09-10 15:00:00', 'ends_at' => '2026-09-10 16:00:00']);
        $this->event(['title' => 'August', 'slug' => 'august', 'format' => 'in_person', 'starts_at' => '2026-08-10 15:00:00', 'ends_at' => null]);

        $this->getJson('/api/v1/events?when=past')->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.slug', 'september')
            ->assertJsonPath('data.1.slug', 'august')
            ->assertJsonPath('data.0.is_past', true);

        $this->getJson('/api/v1/events?format=in_person')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/events?when=past&format=in_person')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/events?featured=1')->assertOk()->assertJsonCount(1, 'data');
        // An unknown format is ignored, not refused.
        $this->getJson('/api/v1/events?format=on-the-moon')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/events?when=past&per_page=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.last_page', 2);
        $this->getJson('/api/v1/events?per_page=500')->assertOk()->assertJsonPath('meta.per_page', 50);
    }

    public function test_an_event_is_upcoming_until_it_ends_or_until_the_end_of_its_start_day(): void
    {
        $this->event();
        $this->event(['title' => 'No end', 'slug' => 'no-end', 'starts_at' => '2026-11-12 09:00:00', 'ends_at' => null]);

        // Half past three on the day: one is under way, the other began at nine.
        $this->travelTo(Carbon::parse('2026-11-12 15:30:00', 'Asia/Kolkata'));
        $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/events?when=past')->assertOk()->assertJsonCount(0, 'data');

        // Five o'clock: the one with an end is over; the one without lasts the day.
        $this->travelTo(Carbon::parse('2026-11-12 17:00:00', 'Asia/Kolkata'));
        $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'no-end');
        $this->getJson('/api/v1/events?when=past')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.slug', 'wifi-7-working-session');

        $this->travelTo(Carbon::parse('2026-11-13 00:05:00', 'Asia/Kolkata'));
        $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(0, 'data');
    }

    // ------------------------------------------------------------- the page

    public function test_the_page_carries_everything_but_the_join_link(): void
    {
        $event = $this->event([
            'map_url' => 'https://maps.google.com/?q=technoware',
            'capacity' => 40,
            'waitlist_enabled' => true,
            'registration_closes_at' => '2026-11-11 18:00:00',
            'speakers' => [['name' => 'Asha Rao', 'role' => 'Principal network engineer', 'photo_path' => null]],
            'agenda' => [['time' => '3:00 pm', 'title' => 'What changes in Wi-Fi 7', 'note' => 'Channels, MLO and what a client needs.']],
        ]);
        $event->faqs()->create(['question' => 'Is there parking?', 'answer' => '<p>Yes, in the basement.</p>', 'sort_order' => 0]);

        $response = $this->getJson('/api/v1/events/wifi-7-working-session')->assertOk()
            ->assertJsonMissingPath('data.online_url')
            ->assertJsonMissingPath('data.capacity')
            ->assertJsonMissingPath('data.counts')
            ->assertJsonPath('data.body', '<p>What we will cover.</p>')
            ->assertJsonPath('data.venue_address', "Unit 4, Lakeview Industrial Estate\nAndheri East, Mumbai 400093")
            ->assertJsonPath('data.map_url', 'https://maps.google.com/?q=technoware')
            ->assertJsonPath('data.speakers.0.name', 'Asha Rao')
            ->assertJsonPath('data.speakers.0.photo', null)
            ->assertJsonPath('data.speakers.0.photo_alt', 'Asha Rao')
            ->assertJsonPath('data.agenda.0.title', 'What changes in Wi-Fi 7')
            ->assertJsonPath('data.calendar_path', '/events/wifi-7-working-session/calendar')
            ->assertJsonPath('data.faqs.0.question', 'Is there parking?')
            // One question is not an FAQ page.
            ->assertJsonMissingPath('data.faq_schema');

        $this->assertSame([
            'mode' => 'open',
            'external_url' => null,
            'closes_at' => '2026-11-11T18:00:00+05:30',
            'closes_label' => 'Wednesday 11 November, 6:00 pm',
            'max_seats' => 5,
            'has_capacity' => true,
            'waitlist' => true,
        ], $response->json('data.registration'));

        // The join link is nowhere in the response — not in the graph either.
        $this->assertStringNotContainsString('meet.example.com', $response->getContent());

        $schema = $response->json('data.schema');
        $this->assertSame('Event', $schema['@type']);
        $this->assertSame('2026-11-12T15:00:00+05:30', $schema['startDate']);
        $this->assertSame('https://schema.org/MixedEventAttendanceMode', $schema['eventAttendanceMode']);
        $this->assertSame('https://schema.org/EventScheduled', $schema['eventStatus']);
        $this->assertSame(['Place', 'VirtualLocation'], array_column($schema['location'], '@type'));
        // The virtual location is the page, never the room.
        $this->assertStringEndsWith('/events/wifi-7-working-session', $schema['location'][1]['url']);
        $this->assertSame('Asha Rao', $schema['performer'][0]['name']);
        $this->assertArrayNotHasKey('offers', $schema);

        // A second question makes the pair an FAQ page.
        $event->faqs()->create(['question' => 'Will it be recorded?', 'answer' => '<p>No.</p>', 'sort_order' => 1]);
        $this->getJson('/api/v1/events/wifi-7-working-session')->assertOk()->assertJsonPath('data.faq_schema.@type', 'FAQPage');
    }

    public function test_empty_lists_are_arrays_and_an_announcement_offers_no_registration(): void
    {
        $this->event(['registration_mode' => 'none', 'format' => 'online', 'capacity' => 10, 'waitlist_enabled' => true]);

        $response = $this->getJson('/api/v1/events/wifi-7-working-session')->assertOk()
            ->assertJsonPath('data.speakers', [])
            ->assertJsonPath('data.agenda', [])
            ->assertJsonPath('data.faqs', [])
            ->assertJsonPath('data.venue_address', null)
            ->assertJsonPath('data.map_url', null)
            ->assertJsonPath('data.registration.mode', 'none')
            ->assertJsonPath('data.registration.has_capacity', false)
            ->assertJsonPath('data.registration.waitlist', false);

        $this->assertSame('VirtualLocation', $response->json('data.schema.location.@type'));
        $this->assertSame('https://schema.org/OnlineEventAttendanceMode', $response->json('data.schema.eventAttendanceMode'));
    }

    public function test_a_draft_and_an_archived_event_are_a_404_everywhere_and_a_past_one_is_readable(): void
    {
        $this->event(['slug' => 'a-draft', 'status' => PublishStatus::Draft]);
        $this->event(['slug' => 'archived', 'status' => PublishStatus::Archived]);
        $this->event(['slug' => 'last-month', 'starts_at' => '2026-09-10 15:00:00', 'ends_at' => '2026-09-10 16:00:00']);

        foreach (['a-draft', 'archived', 'nothing-here'] as $slug) {
            $this->getJson("/api/v1/events/{$slug}")->assertNotFound();
            $this->getJson("/api/v1/events/{$slug}/availability")->assertNotFound();
            $this->get("/api/v1/events/{$slug}/calendar")->assertNotFound();
            $this->register([], $slug)->assertNotFound();
        }

        $this->getJson('/api/v1/events/last-month')->assertOk()->assertJsonPath('data.is_past', true);
        $this->assertSame(0, EventRegistration::count());
    }

    // --------------------------------------------------------- availability

    public function test_availability_is_one_state_never_a_count_and_never_cached(): void
    {
        $event = $this->event();

        $ask = fn () => $this->getJson('/api/v1/events/wifi-7-working-session/availability')->assertOk();

        $response = $ask()->assertExactJson(['data' => ['state' => 'open', 'few_left' => false, 'message' => null]]);
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));

        $event->update(['registration_mode' => 'none']);
        $ask()->assertExactJson(['data' => ['state' => 'none', 'few_left' => false, 'message' => null]]);

        $event->update(['registration_mode' => 'external', 'external_url' => 'https://tickets.example.com/x']);
        $ask()->assertExactJson(['data' => ['state' => 'external', 'few_left' => false, 'message' => null]]);

        // A capacity of ten: nine taken leaves one — two is a fifth, so "few" begins there.
        $event->update(['registration_mode' => 'open', 'capacity' => 10]);
        $this->seat($event, 7);
        $ask()->assertExactJson(['data' => ['state' => 'open', 'few_left' => false, 'message' => null]]);
        $this->seat($event, 1);
        $ask()->assertExactJson(['data' => ['state' => 'open', 'few_left' => true, 'message' => null]]);

        $this->seat($event, 2);
        $ask()->assertExactJson(['data' => ['state' => 'full', 'few_left' => false, 'message' => 'This event is full.']]);

        $event->update(['waitlist_enabled' => true]);
        $ask()->assertExactJson(['data' => ['state' => 'waitlist', 'few_left' => false, 'message' => null]]);

        // Closed outranks the room.
        $event->update(['registration_closes_at' => '2026-10-05 18:00:00']);
        $ask()->assertExactJson(['data' => ['state' => 'closed', 'few_left' => false, 'message' => 'Registration for this event has closed.']]);

        // And started outranks closed.
        $this->travelTo(Carbon::parse('2026-11-12 15:10:00', 'Asia/Kolkata'));
        $ask()->assertExactJson(['data' => ['state' => 'ended', 'few_left' => false, 'message' => 'This event has already started, so registration has closed.']]);

        $this->travelTo(Carbon::parse('2026-11-14 09:00:00', 'Asia/Kolkata'));
        $ask()->assertExactJson(['data' => ['state' => 'ended', 'few_left' => false, 'message' => 'This event has taken place.']]);
    }

    /** A confirmed registration of this many seats, written directly. */
    private function seat(Event $event, int $seats, string $status = 'confirmed', ?string $email = null): EventRegistration
    {
        static $n = 0;
        $n++;

        return EventRegistration::create([
            'event_id' => $event->id,
            'name' => "Guest {$n}",
            'email' => $email ?? "guest{$n}@example.test",
            'seats' => $seats,
            'status' => $status,
            'waitlisted_at' => $status === 'waitlisted' ? now()->addSeconds($n) : null,
        ]);
    }

    // ------------------------------------------------------------- calendar

    public function test_the_calendar_file_is_the_event_in_utc_with_no_join_link(): void
    {
        $event = $this->event();

        $response = $this->get('/api/v1/events/wifi-7-working-session/calendar')->assertOk();

        $this->assertStringStartsWith('text/calendar', (string) $response->headers->get('Content-Type'));
        $this->assertSame('attachment; filename=wifi-7-working-session.ics', $response->headers->get('Content-Disposition'));

        $ics = $response->getContent();
        // 3:00 pm IST is 09:30 UTC, written with a Z.
        $this->assertStringContainsString("DTSTART:20261112T093000Z\r\n", $ics);
        $this->assertStringContainsString("DTEND:20261112T110000Z\r\n", $ics);
        $this->assertStringContainsString("UID:event-{$event->id}@", $ics);
        $this->assertStringContainsString('SUMMARY:Wi-Fi 7 for the office: a working session', $ics);
        $this->assertStringContainsString('LOCATION:Technoware Experience Centre\, Unit 4\, Lakeview', $ics);
        $this->assertStringContainsString('METHOD:PUBLISH', $ics);
        $this->assertStringNotContainsString('meet.example.com', $ics);
        // CRLF throughout, and no line over 75 octets.
        $this->assertSame(0, preg_match('/(?<!\r)\n/', $ics));
        foreach (explode("\r\n", $ics) as $line) {
            $this->assertLessThanOrEqual(75, strlen($line));
        }

        // The UID is the id, so renaming the event keeps the calendar entry.
        $event->update(['slug' => 'wifi-seven']);
        $this->assertStringContainsString("UID:event-{$event->id}@", $this->get('/api/v1/events/wifi-seven/calendar')->assertOk()->getContent());
    }

    // ------------------------------------------------------------- register

    public function test_registering_confirms_files_a_lead_and_tells_both_sides(): void
    {
        $event = $this->event();

        $response = $this->register()->assertCreated();

        $registration = EventRegistration::sole();
        $response->assertExactJson([
            'message' => 'You are registered. We have emailed your confirmation to priya@acme.co.in.',
            'data' => ['status' => 'confirmed', 'seats' => 2],
        ]);
        // The token is on the row and in the email. It is not in the response.
        $this->assertStringNotContainsString($registration->token, $response->getContent());
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $registration->token);

        $this->assertSame(EventRegistrationStatus::Confirmed, $registration->status);
        $this->assertSame($event->id, $registration->event_id);
        $this->assertSame('public', $registration->source);
        $this->assertSame('One of us needs step-free access.', $registration->note);
        $this->assertSame('/events/wifi-7-working-session?utm_source=newsletter', $registration->source_path);
        $this->assertArrayNotHasKey('token', $registration->toArray());

        $lead = Lead::sole();
        $this->assertSame('event', $lead->channel);
        $this->assertSame('event_registration', $lead->source_type);
        $this->assertSame($lead->id, $registration->lead_id);
        $this->assertSame('Registered for: Wi-Fi 7 for the office: a working session', $lead->subject);
        $this->assertSame('/events/wifi-7-working-session?utm_source=newsletter', $lead->source_path);

        // The registrant: the confirmation, with the calendar file and — here
        // and only here — the join link and their manage link.
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, function (EventRegistrationConfirmed $n, $channels, AnonymousNotifiable $to) use ($registration) {
            $mail = $n->toMail($to);

            return $to->routes['mail'] === 'priya@acme.co.in'
                && $n->templateKey() === 'event_registration_confirmed'
                && $mail->subject === 'You are registered: Wi-Fi 7 for the office: a working session'
                && str_contains((string) $mail->render(), self::JOIN)
                && $mail->actionUrl === $registration->manageUrl()
                && count($mail->rawAttachments) === 1
                && $mail->rawAttachments[0]['name'] === 'wifi-7-working-session.ics'
                && str_contains($mail->rawAttachments[0]['data'], self::JOIN)
                && str_contains($mail->rawAttachments[0]['data'], $registration->token);
        });

        // The desk: the sales inbox, since no events address is set.
        Notification::assertSentOnDemand(EventRegistrationReceived::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'sales@technoware.in');
        Notification::assertSentOnDemandTimes(EventRegistrationWaitlisted::class, 0);
    }

    public function test_the_desks_notice_goes_to_the_events_address_when_one_is_set(): void
    {
        Setting::where('key', 'events_email')->firstOrFail()->forceFill(['value' => 'events@technoware.test'])->save();
        $this->event();

        $this->register()->assertCreated();

        Notification::assertSentOnDemand(EventRegistrationReceived::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'events@technoware.test');
    }

    public function test_the_webhook_carries_the_registration_without_its_token(): void
    {
        Queue::fake();
        Webhook::create(['name' => 'CRM', 'url' => 'https://crm.example.com/hook', 'secret' => 'whsec_test', 'events' => ['event.registered'], 'is_active' => true]);
        $this->event();

        $this->register()->assertCreated();

        $delivery = WebhookDelivery::sole();
        $payload = $delivery->payload;
        $this->assertSame('event.registered', $delivery->event instanceof \BackedEnum ? $delivery->event->value : $delivery->event);
        $this->assertSame('priya@acme.co.in', $payload['email']);
        $this->assertSame('Wi-Fi 7 for the office: a working session', $payload['event']['title']);
        $this->assertArrayNotHasKey('staff_note', $payload);
        $this->assertArrayNotHasKey('allowed_next', $payload);
        $this->assertStringNotContainsString(EventRegistration::sole()->token, (string) json_encode($payload));
        $this->assertStringNotContainsString('meet.example.com', (string) json_encode($payload));

        // A repeat is not a second announcement.
        $this->register()->assertCreated();
        $this->assertSame(1, WebhookDelivery::count());
    }

    public function test_the_fields_are_validated_and_seats_are_capped_by_the_event(): void
    {
        $this->event(['max_seats' => 3]);

        $this->register(['name' => '', 'email' => 'not-an-address', 'phone' => 'call me', 'seats' => 0, 'note' => str_repeat('x', 1001)])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['name', 'email', 'phone', 'seats', 'note']);

        $this->register(['seats' => 4])->assertStatus(422)
            ->assertJsonPath('errors.seats.0', 'You can register up to 3 seats at once. For a larger group, please contact us.');

        // Seats default to one, and a phone number is optional.
        $this->register(['seats' => null, 'phone' => null, 'company' => null, 'note' => null])->assertCreated()->assertJsonPath('data.seats', 1);
        $this->assertSame(1, EventRegistration::sole()->seats);
    }

    public function test_a_full_event_waitlists_or_refuses_and_capacity_is_counted_in_seats(): void
    {
        $event = $this->event(['capacity' => 4]);
        $this->seat($event, 3);

        // One registration, three seats: one seat is left, not three places.
        $this->register(['seats' => 2])->assertStatus(422)
            ->assertJsonValidationErrors(['seats'])
            ->assertJsonPath('errors.seats.0', 'Only 1 seat is left.');
        $this->assertSame(1, EventRegistration::count());

        $this->register(['seats' => 1])->assertCreated()->assertJsonPath('data.status', 'confirmed');

        // Full, no waiting list: turned away on `registration`, one sentence.
        $this->register(['email' => 'late@example.test', 'seats' => 1])->assertStatus(422)
            ->assertJsonValidationErrors(['registration'])
            ->assertJsonPath('errors.registration.0', 'This event is full.');

        // With a waiting list, the same request waits — and is told so.
        $event->update(['waitlist_enabled' => true]);
        $this->register(['email' => 'late@example.test', 'seats' => 2])->assertCreated()
            ->assertJsonPath('data.status', 'waitlisted')
            ->assertJsonPath('message', 'This event is full, so you are on the waiting list. We have emailed late@example.test and will write again if a place opens.');

        $waiting = EventRegistration::where('email', 'late@example.test')->sole();
        $this->assertSame(EventRegistrationStatus::Waitlisted, $waiting->status);
        $this->assertNotNull($waiting->waitlisted_at);

        Notification::assertSentOnDemand(EventRegistrationWaitlisted::class, function (EventRegistrationWaitlisted $n, $channels, AnonymousNotifiable $to) {
            $mail = $n->toMail($to);

            // No join link and no calendar file until there is a place.
            return $to->routes['mail'] === 'late@example.test'
                && $mail->rawAttachments === []
                && ! str_contains((string) $mail->render(), 'meet.example.com');
        });
    }

    public function test_a_party_too_big_for_what_is_left_waits_whole_when_there_is_a_list(): void
    {
        $event = $this->event(['capacity' => 4, 'waitlist_enabled' => true]);
        $this->seat($event, 3);

        $this->register(['seats' => 2])->assertCreated()->assertJsonPath('data.status', 'waitlisted');

        // And once somebody is waiting, a single does not jump the queue
        // for the seat that is free.
        $this->register(['email' => 'single@example.test', 'seats' => 1])->assertCreated()->assertJsonPath('data.status', 'waitlisted');
        $this->assertSame(Availability::WAITLIST, Availability::for($event->fresh())->state);
    }

    public function test_closed_ended_and_not_open_refuse_on_registration(): void
    {
        $event = $this->event(['registration_closes_at' => '2026-10-05 18:00:00']);

        $this->register()->assertStatus(422)->assertJsonPath('errors.registration.0', 'Registration for this event has closed.');

        $event->update(['registration_closes_at' => null, 'registration_mode' => 'none']);
        $this->register()->assertStatus(422)->assertJsonPath('errors.registration.0', 'This event does not take registrations here.');

        $event->update(['registration_mode' => 'external', 'external_url' => 'https://tickets.example.com/x']);
        $this->register()->assertStatus(422)->assertJsonValidationErrors(['registration']);

        $event->update(['registration_mode' => 'open']);
        $this->travelTo(Carbon::parse('2026-11-12 15:00:00', 'Asia/Kolkata'));
        $this->register()->assertStatus(422)->assertJsonPath('errors.registration.0', 'This event has already started, so registration has closed.');

        $this->assertSame(0, EventRegistration::count());
        $this->assertSame(0, Lead::count());
        Notification::assertNothingSent();
    }

    /**
     * A typed address proves nothing. Somebody registering with an address
     * that already holds a registration changes none of it, is handed
     * nothing of it, and is told exactly what a stranger would be told.
     */
    public function test_a_repeat_from_a_registered_address_writes_nothing_and_is_answered_like_a_stranger(): void
    {
        Queue::fake();
        Webhook::create(['name' => 'CRM', 'url' => 'https://crm.example.com/hook', 'secret' => 'whsec_test', 'events' => ['event.registered'], 'is_active' => true]);
        $this->event();

        $this->register()->assertCreated();
        $row = EventRegistration::sole();
        $before = $row->getAttributes();

        // Other details, more seats, another case of the same mailbox.
        $body = ['name' => 'Mallory', 'phone' => '+91 90000 00000', 'company' => 'Somebody Else Ltd', 'seats' => 5, 'note' => 'Changed by a stranger.'];
        $this->travel(2)->minutes();

        $repeat = $this->register(['email' => 'Priya@ACME.co.in', ...$body])->assertCreated()->assertExactJson([
            'message' => 'You are registered. We have emailed your confirmation to priya@acme.co.in.',
            'data' => ['status' => 'confirmed', 'seats' => 5],
        ]);

        // Not one column moved — not the name, the seats, the note, the
        // token, nor the row's own clock.
        $this->assertSame($before, EventRegistration::sole()->getAttributes());
        $this->assertSame(1, Lead::count());
        $this->assertSame(1, WebhookDelivery::count());
        Notification::assertSentOnDemandTimes(EventRegistrationReceived::class, 1);

        // The registration's own confirmation goes again, to the address on
        // file, saying what is stored — two seats, its own manage link.
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 2);
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, function (EventRegistrationConfirmed $n, $channels, AnonymousNotifiable $to) use ($row) {
            $html = (string) $n->toMail($to)->render();

            return $to->routes['mail'] === 'priya@acme.co.in'
                && $n->registration->is($row)
                && str_contains($html, '2 seats')
                && ! str_contains($html, 'Mallory')
                && $n->toMail($to)->actionUrl === $row->manageUrl();
        });

        // The response holds nothing of the registration: no link, no token.
        $repeat->assertJsonMissingPath('data.manage_path');
        $this->assertStringNotContainsString($row->token, $repeat->getContent());

        // And a brand-new address sending the same body reads the same, word for word.
        $stranger = $this->register(['email' => 'stranger@example.test', ...$body])->assertCreated();
        $this->assertSame(
            $repeat->getContent(),
            str_replace('stranger@example.test', 'priya@acme.co.in', $stranger->getContent()),
        );
        $this->assertSame(5, EventRegistration::where('email', 'stranger@example.test')->sole()->seats);
    }

    public function test_a_repeat_is_refused_or_placed_exactly_as_a_stranger_would_be(): void
    {
        // Full, no waiting list: the address that filled the room is told
        // "full" like anybody — and its confirmation is sent again all the same.
        $full = $this->event(['slug' => 'full', 'capacity' => 2]);
        $this->register(['seats' => 2], 'full')->assertCreated();
        $before = EventRegistration::sole()->getAttributes();

        $repeat = $this->register(['seats' => 2], 'full')->assertStatus(422);
        $repeat->assertExactJson($this->register(['email' => 'stranger@example.test', 'seats' => 2], 'full')->assertStatus(422)->json());
        $repeat->assertJsonPath('errors.registration.0', 'This event is full.');
        $this->assertSame($before, EventRegistration::sole()->getAttributes());
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 2);

        // More seats than are left: the count a stranger is given, not one
        // that adds back the seats this address already holds.
        $this->event(['slug' => 'roomy', 'capacity' => 4]);
        $this->register(['seats' => 2], 'roomy')->assertCreated();
        $repeat = $this->register(['seats' => 3], 'roomy')->assertStatus(422)->assertJsonPath('errors.seats.0', 'Only 2 seats are left.');
        $repeat->assertExactJson($this->register(['email' => 'stranger@example.test', 'seats' => 3], 'roomy')->assertStatus(422)->json());
        $this->assertSame(2, EventRegistration::where('event_id', '!=', $full->id)->sole()->seats);

        // (The route allows ten registrations a minute; step past it.)
        $this->travel(2)->minutes();

        // Full with a waiting list: a confirmed address is answered
        // "waiting" like a stranger, and stays confirmed.
        $listed = $this->event(['slug' => 'listed', 'capacity' => 2, 'waitlist_enabled' => true]);
        $this->register(['seats' => 2], 'listed')->assertCreated()->assertJsonPath('data.status', 'confirmed');
        $repeat = $this->register(['seats' => 1], 'listed')->assertCreated()->assertJsonPath('data.status', 'waitlisted');
        $this->assertSame(EventRegistrationStatus::Confirmed, EventRegistration::where('event_id', $listed->id)->sole()->status);
        $stranger = $this->register(['email' => 'stranger@example.test', 'seats' => 1], 'listed')->assertCreated();
        $this->assertSame($repeat->getContent(), str_replace('stranger@example.test', 'priya@acme.co.in', $stranger->getContent()));

        // Closed: the same sentence for both.
        $listed->update(['registration_closes_at' => '2026-10-05 18:00:00']);
        $this->register(['seats' => 1], 'listed')->assertStatus(422)
            ->assertExactJson($this->register(['email' => 'another@example.test', 'seats' => 1], 'listed')->assertStatus(422)->json());
    }

    public function test_a_repeat_re_sends_at_most_once_in_ten_minutes_per_address_per_event(): void
    {
        $event = $this->event(['capacity' => 1, 'waitlist_enabled' => true]);
        $this->event(['title' => 'Another', 'slug' => 'another']);

        $this->register(['seats' => 1])->assertCreated();
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 1);

        // Three repeats in a row: one more email, not three.
        $this->register(['seats' => 1])->assertCreated();
        $this->register(['seats' => 1])->assertCreated();
        $this->register(['email' => 'PRIYA@acme.co.in', 'seats' => 1])->assertCreated();
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 2);

        // The same address on another event is another registration, and its own count.
        $this->register(['seats' => 1], 'another')->assertCreated();
        $this->register(['seats' => 1], 'another')->assertCreated();
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 4);

        // Ten minutes on, the first event's may go again.
        $this->travel(11)->minutes();
        $this->register(['seats' => 1])->assertCreated();
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 5);

        // Somebody waiting is re-sent the waiting-list message, never a confirmation.
        $this->register(['email' => 'waiting@example.test', 'seats' => 1])->assertCreated()->assertJsonPath('data.status', 'waitlisted');
        $this->register(['email' => 'waiting@example.test', 'seats' => 1])->assertCreated();
        Notification::assertSentOnDemandTimes(EventRegistrationWaitlisted::class, 2);
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 5);

        // After the day, a repeat is refused like anybody's and nothing is sent:
        // what happened is not re-announced.
        $this->travelTo(Carbon::parse('2026-11-12 15:30:00', 'Asia/Kolkata'));
        EventRegistration::where('event_id', $event->id)->where('email', 'priya@acme.co.in')->sole()->forceFill(['status' => 'attended'])->save();
        $this->register(['seats' => 1])->assertStatus(422)->assertJsonValidationErrors(['registration']);
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 5);
        $this->assertSame(EventRegistrationStatus::Attended, EventRegistration::where('event_id', $event->id)->where('email', 'priya@acme.co.in')->sole()->status);
    }

    public function test_a_cancelled_registration_is_revived_as_new_under_a_new_token(): void
    {
        $event = $this->event(['capacity' => 2, 'waitlist_enabled' => true]);

        $old = $this->registered(['seats' => 2]);
        $this->postJson("/api/v1/events/registrations/{$old}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
        $id = EventRegistration::sole()->id;
        $this->assertNotNull(EventRegistration::sole()->cancelled_at);

        // A cancelled registration is no registration: the details sent are
        // taken, the room decides, and the answer is a newcomer's.
        $this->register(['name' => 'Priya D.', 'seats' => 1, 'note' => null])->assertCreated()->assertExactJson([
            'message' => 'You are registered. We have emailed your confirmation to priya@acme.co.in.',
            'data' => ['status' => 'confirmed', 'seats' => 1],
        ]);

        $revived = EventRegistration::sole();
        $this->assertSame($id, $revived->id);
        $this->assertSame('Priya D.', $revived->name);
        $this->assertSame(1, $revived->seats);
        $this->assertNull($revived->note);
        $this->assertSame(EventRegistrationStatus::Confirmed, $revived->status);
        $this->assertNull($revived->cancelled_at);

        // The token is rotated: a link emailed for the cancelled one opens nothing.
        $this->assertNotSame($old, $revived->token);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $revived->token);
        $this->getJson("/api/v1/events/registrations/{$old}")->assertNotFound();
        $this->postJson("/api/v1/events/registrations/{$old}/cancel")->assertNotFound();
        $this->getJson("/api/v1/events/registrations/{$revived->token}")->assertOk()->assertJsonPath('data.name', 'Priya D.');

        // An arrival like any other: the desk and the pipeline hear of it,
        // and the new link is in the new confirmation.
        $this->assertSame(2, Lead::count());
        Notification::assertSentOnDemandTimes(EventRegistrationReceived::class, 2);
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, fn (EventRegistrationConfirmed $n, $c, AnonymousNotifiable $to) => $n->toMail($to)->actionUrl === $revived->manageUrl());

        // Cancelled again, and the room taken meanwhile: revived onto the
        // list, like a newcomer, and rotated again.
        $this->postJson("/api/v1/events/registrations/{$revived->token}/cancel")->assertOk();
        $this->seat($event, 2);
        $this->register(['seats' => 1])->assertCreated()->assertJsonPath('data.status', 'waitlisted');

        $again = EventRegistration::where('email', 'priya@acme.co.in')->sole();
        $this->assertSame(EventRegistrationStatus::Waitlisted, $again->status);
        $this->assertNotNull($again->waitlisted_at);
        $this->assertNotSame($revived->token, $again->token);
    }

    public function test_the_honeypot_gets_the_ordinary_answer_and_nothing_is_stored(): void
    {
        $this->event();

        $this->register(['website' => 'https://spam.example'])->assertCreated()->assertExactJson([
            'message' => 'You are registered. We have emailed your confirmation to priya@acme.co.in.',
            'data' => ['status' => 'confirmed', 'seats' => 2],
        ]);

        $this->assertSame(0, EventRegistration::count());
        $this->assertSame(0, Lead::count());
        Notification::assertNothingSent();
    }

    public function test_a_signed_in_customer_is_stamped_and_a_view_as_session_is_not(): void
    {
        $this->event();
        $priya = Customer::create(['name' => 'Priya Das', 'email' => 'priya@acme.co.in', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active]);

        // A real bearer token, not `actingAs`: on a public route the guard has
        // to be named, and only the header proves the wiring.
        $token = $priya->createToken('portal', ['portal'])->plainTextToken;
        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/v1/events/wifi-7-working-session/register', $this->payload())->assertCreated();
        $this->assertSame($priya->id, EventRegistration::sole()->customer_id);

        // Signed in or not, registering again changes nothing: there is no
        // update path through this door for anybody.
        $this->postJson('/api/v1/events/wifi-7-working-session/register', $this->payload(['seats' => 4, 'name' => 'Renamed']))
            ->assertCreated()->assertJsonPath('data.seats', 4);
        $this->assertSame([2, 'Priya Das'], [EventRegistration::sole()->seats, EventRegistration::sole()->name]);

        $this->app['auth']->forgetGuards();
        $viewAs = $priya->createToken(Customer::IMPERSONATION_TOKEN, ['portal', Customer::IMPERSONATION_ABILITY])->plainTextToken;
        $this->flushHeaders()->withHeader('Authorization', "Bearer {$viewAs}")
            ->postJson('/api/v1/events/wifi-7-working-session/register', $this->payload(['email' => 'someone.else@example.test']))->assertCreated();
        $this->assertNull(EventRegistration::where('email', 'someone.else@example.test')->sole()->customer_id);

        $this->app['auth']->forgetGuards();
        $this->flushHeaders()->postJson('/api/v1/events/wifi-7-working-session/register', $this->payload(['email' => 'guest@example.test']))->assertCreated();
        $this->assertNull(EventRegistration::where('email', 'guest@example.test')->sole()->customer_id);
    }

    public function test_seats_are_counted_behind_a_lock_on_the_event(): void
    {
        $event = $this->event(['capacity' => 5]);

        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });

        $this->register(['seats' => 2])->assertCreated();

        // The event row is locked before anything is counted or written.
        $lock = null;
        $count = null;
        $insert = null;
        foreach ($queries as $i => $sql) {
            if ($lock === null && str_contains($sql, 'from `events`') && str_contains($sql, 'for update')) {
                $lock = $i;
            }
            if ($lock !== null && $count === null && str_contains($sql, 'from `event_registrations`') && str_contains($sql, 'SUM(seats)')) {
                $count = $i;
            }
            if ($insert === null && str_starts_with($sql, 'insert into `event_registrations`')) {
                $insert = $i;
            }
        }

        $this->assertNotNull($lock, 'The event row was never locked.');
        $this->assertNotNull($count, 'Seats were not counted after the lock.');
        $this->assertNotNull($insert);
        $this->assertLessThan($count, $lock);
        $this->assertLessThan($insert, $count);

        // And the count that decides is the one read behind it: three left,
        // so four are refused and three fit exactly.
        $this->register(['email' => 'b@example.test', 'seats' => 4])->assertStatus(422)->assertJsonPath('errors.seats.0', 'Only 3 seats are left.');
        $this->register(['email' => 'b@example.test', 'seats' => 3])->assertCreated();
        $this->register(['email' => 'c@example.test', 'seats' => 1])->assertStatus(422)->assertJsonValidationErrors(['registration']);
        $this->assertSame(5, $event->forgetRegistrationCounts()->registrationCounts()->heldSeats);
    }

    // ----------------------------------------------------- the manage link

    public function test_the_manage_read_shows_the_registration_and_none_of_its_contact_details(): void
    {
        $this->event();
        $token = $this->registered();

        $this->getJson("/api/v1/events/registrations/{$token}")->assertOk()->assertExactJson(['data' => [
            'status' => 'confirmed',
            'status_label' => 'Confirmed',
            'seats' => 2,
            'name' => 'Priya Das',
            'can_cancel' => true,
            'event' => [
                'title' => 'Wi-Fi 7 for the office: a working session',
                'slug' => 'wifi-7-working-session',
                'date_label' => 'Thursday 12 November 2026',
                'time_label' => '3:00 pm – 4:30 pm IST',
                'format' => 'hybrid',
                'format_label' => 'In person and online',
                'venue_name' => 'Technoware Experience Centre',
                'venue_address' => "Unit 4, Lakeview Industrial Estate\nAndheri East, Mumbai 400093",
                'is_past' => false,
                'calendar_path' => '/events/wifi-7-working-session/calendar',
            ],
        ]]);
    }

    public function test_a_token_that_is_not_64_hex_or_is_nobodys_is_a_404(): void
    {
        $this->event();
        $token = $this->registered();

        $wrong = strrev($token) === $token ? str_repeat('0', 64) : strrev($token);

        foreach ([$wrong, strtoupper($token), substr($token, 0, 63), $token.'0', 'not-a-token', '1'] as $bad) {
            $this->getJson("/api/v1/events/registrations/{$bad}")->assertNotFound();
            $this->postJson("/api/v1/events/registrations/{$bad}/cancel")->assertNotFound();
        }

        $this->assertSame(EventRegistrationStatus::Confirmed, EventRegistration::sole()->status);
    }

    public function test_cancelling_promotes_the_waiting_list_oldest_first_while_parties_fit(): void
    {
        $event = $this->event(['capacity' => 4, 'waitlist_enabled' => true]);

        $token = $this->registered(['seats' => 3]);
        $this->seat($event, 1);

        $first = $this->seat($event, 2, 'waitlisted', 'first@example.test');
        $second = $this->seat($event, 2, 'waitlisted', 'second@example.test');
        $third = $this->seat($event, 1, 'waitlisted', 'third@example.test');

        $this->postJson("/api/v1/events/registrations/{$token}/cancel")->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('data.status_label', 'Cancelled')
            ->assertJsonPath('data.can_cancel', false);

        // Three seats came free: the first party of two fits; the second
        // party of two does not fit the one left — and the single behind it
        // does not overtake.
        $this->assertSame(EventRegistrationStatus::Confirmed, $first->fresh()->status);
        $this->assertNull($first->fresh()->waitlisted_at);
        $this->assertSame(EventRegistrationStatus::Waitlisted, $second->fresh()->status);
        $this->assertSame(EventRegistrationStatus::Waitlisted, $third->fresh()->status);

        Notification::assertSentOnDemand(EventRegistrationCancelled::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === 'priya@acme.co.in');
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, function (EventRegistrationConfirmed $n, $channels, AnonymousNotifiable $to) {
            return $to->routes['mail'] === 'first@example.test'
                && $n->templateKey() === 'event_waitlist_promoted'
                && $n->toMail($to)->subject === 'A place has opened: Wi-Fi 7 for the office: a working session';
        });
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 2);

        // Pressing the link again is not a second cancellation.
        $this->postJson("/api/v1/events/registrations/{$token}/cancel")->assertOk()->assertJsonPath('data.status', 'cancelled');
        Notification::assertSentOnDemandTimes(EventRegistrationCancelled::class, 1);
    }

    public function test_a_registration_cannot_be_cancelled_once_the_event_has_started_or_been_marked(): void
    {
        $this->event();
        $token = $this->registered();

        $this->travelTo(Carbon::parse('2026-11-12 15:05:00', 'Asia/Kolkata'));

        $this->getJson("/api/v1/events/registrations/{$token}")->assertOk()->assertJsonPath('data.can_cancel', false);
        $this->postJson("/api/v1/events/registrations/{$token}/cancel")->assertStatus(422)->assertJsonValidationErrors(['registration']);
        $this->assertSame(EventRegistrationStatus::Confirmed, EventRegistration::sole()->status);

        EventRegistration::sole()->forceFill(['status' => 'attended'])->save();
        $this->postJson("/api/v1/events/registrations/{$token}/cancel")->assertStatus(422)->assertJsonValidationErrors(['registration']);
        $this->getJson("/api/v1/events/registrations/{$token}")->assertOk()->assertJsonPath('data.status', 'attended');
    }
}
