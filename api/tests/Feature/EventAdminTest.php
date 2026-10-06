<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\EventRegistrationStatus;
use App\Enums\MenuItemType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Event;
use App\Models\EventRegistration;
use App\Models\Lead;
use App\Models\Media;
use App\Models\Menu;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\EventChanged;
use App\Notifications\EventRegistrationCancelled;
use App\Notifications\EventRegistrationConfirmed;
use App\Notifications\EventRegistrationReceived;
use App\Notifications\EventRegistrationWaitlisted;
use App\Notifications\EventReminder;
use App\Support\Chat\Retriever;
use App\Support\Events\EventIcs;
use App\Support\Events\EventReminders;
use App\Support\MediaMeta;
use App\Support\SiteSection;
use App\Support\StructuredData;
use Database\Seeders\SampleEventSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Events, from the console's side (0.118.0, docs/events.md): the CRUD and
 * its rules, the registrations desk, who may reach which, the reminder, and
 * every other place an event appears — search, menus, the SEO overview, the
 * page builder, the assistant.
 *
 * The clock is fixed at Tuesday 6 October 2026, 10:00 IST.
 */
class EventAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-06 10:00:00', 'Asia/Kolkata'));
        Notification::fake();
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager, ?string $email = null): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $email ?? $role->value.'-'.Str::random(6).'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    /** @param  array<string, mixed>  $overrides */
    private function body(array $overrides = []): array
    {
        return array_replace([
            'title' => 'Wi-Fi 7 for the office: a working session',
            'summary' => 'Ninety minutes on what Wi-Fi 7 changes.',
            'body' => '<p>What we will cover.</p>',
            'status' => 'published',
            'format' => 'hybrid',
            'starts_at' => '2026-11-12T15:00',
            'ends_at' => '2026-11-12T16:30',
            'venue_name' => 'Technoware Experience Centre',
            'venue_city' => 'Mumbai',
            'online_url' => 'https://meet.example.com/abc',
            'registration_mode' => 'open',
        ], $overrides);
    }

    /** @param  array<string, mixed>  $overrides */
    private function create(array $overrides = [])
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/events', $this->body($overrides));
    }

    /** @param  array<string, mixed>  $overrides */
    private function event(array $overrides = []): Event
    {
        return Event::create(array_replace([
            'title' => 'Wi-Fi 7 for the office: a working session',
            'slug' => 'wifi-7-working-session',
            'summary' => 'Ninety minutes on what Wi-Fi 7 changes.',
            'status' => PublishStatus::Published,
            'format' => 'hybrid',
            'starts_at' => '2026-11-12 15:00:00',
            'ends_at' => '2026-11-12 16:30:00',
            'venue_name' => 'Technoware Experience Centre',
            'venue_city' => 'Mumbai',
            'online_url' => 'https://meet.example.com/abc',
            'registration_mode' => 'open',
        ], $overrides));
    }

    private function seat(Event $event, int $seats, string $status = 'confirmed', ?string $email = null, array $extra = []): EventRegistration
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
            ...$extra,
        ]);
    }

    // ------------------------------------------------------------------ CRUD

    public function test_an_event_is_created_read_back_as_wall_clock_and_carries_its_meta(): void
    {
        $response = $this->create([
            'is_featured' => true,
            'capacity' => 40,
            'waitlist_enabled' => true,
            'registration_closes_at' => '2026-11-11T18:00',
            'speakers' => [['name' => 'Asha Rao', 'role' => 'Principal network engineer']],
            'agenda' => [['time' => '3:00 pm', 'title' => 'What changes', 'note' => 'Channels and MLO.']],
            'faqs' => [['question' => 'Is there parking?', 'answer' => '<p>Yes.</p><script>alert(1)</script>']],
            'seo' => ['title' => 'Wi-Fi 7 seminar in Mumbai'],
        ])->assertCreated();

        $response
            ->assertJsonPath('data.slug', 'wi-fi-7-for-the-office-a-working-session')
            ->assertJsonPath('data.status', 'published')
            ->assertJsonPath('data.status_label', 'Published')
            ->assertJsonPath('data.format_label', 'In person and online')
            // What a `datetime-local` holds, and the instant beside it.
            ->assertJsonPath('data.starts_at', '2026-11-12T15:00')
            ->assertJsonPath('data.ends_at', '2026-11-12T16:30')
            ->assertJsonPath('data.starts_at_iso', '2026-11-12T15:00:00+05:30')
            ->assertJsonPath('data.registration_closes_at', '2026-11-11T18:00')
            ->assertJsonPath('data.date_label', 'Thursday 12 November 2026')
            ->assertJsonPath('data.online_url', 'https://meet.example.com/abc')
            ->assertJsonPath('data.capacity', 40)
            ->assertJsonPath('data.waitlist_enabled', true)
            // The default from the `event_max_seats` setting.
            ->assertJsonPath('data.max_seats', 5)
            ->assertJsonPath('data.speakers.0.name', 'Asha Rao')
            ->assertJsonPath('data.speakers.0.photo_path', null)
            ->assertJsonPath('data.agenda.0.note', 'Channels and MLO.')
            ->assertJsonPath('data.faqs.0.question', 'Is there parking?')
            // Rich text is cleaned wherever it is written.
            ->assertJsonPath('data.faqs.0.answer', '<p>Yes.</p>')
            ->assertJsonPath('data.seo.title', 'Wi-Fi 7 seminar in Mumbai')
            ->assertJsonPath('data.seo_defaults.schema_type', 'Event')
            ->assertJsonPath('data.public_path', '/events/wi-fi-7-for-the-office-a-working-session');

        $id = $response->json('data.id');
        $this->assertSame("/admin/events/{$id}", $response->json('data.admin_path'));
        $this->assertSame(
            ['confirmed' => 0, 'confirmed_seats' => 0, 'waitlisted' => 0, 'cancelled' => 0, 'attended' => 0, 'seats_left' => 40],
            $response->json('data.counts'),
        );

        $meta = $response->json('meta');
        $this->assertSame(['formats', 'statuses', 'registration_modes', 'registration_statuses', 'max_speakers', 'max_agenda', 'timezone'], array_keys($meta));
        $this->assertSame(['in_person', 'online', 'hybrid'], array_column($meta['formats'], 'value'));
        $this->assertSame(['draft', 'published', 'archived'], array_column($meta['statuses'], 'value'));
        $this->assertSame(['none', 'open', 'external'], array_column($meta['registration_modes'], 'value'));
        $this->assertNotEmpty($meta['registration_modes'][0]['blurb']);
        $this->assertSame(['confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show'], array_column($meta['registration_statuses'], 'value'));
        $this->assertSame([12, 30, 'IST'], [$meta['max_speakers'], $meta['max_agenda'], $meta['timezone']]);

        // Stored as the instant that wall-clock time is in the app's zone.
        $this->assertSame('2026-11-12 09:30:00', Event::findOrFail($id)->starts_at->copy()->utc()->toDateTimeString());

        // The read is the same shape, with the same meta.
        $this->actingAs($this->staff(), 'sanctum')->getJson("/api/v1/admin/events/{$id}")->assertOk()
            ->assertJsonPath('data.body', '<p>What we will cover.</p>')
            ->assertJsonPath('meta.timezone', 'IST');
    }

    public function test_an_edit_is_partial_leaves_the_lists_alone_and_writes_a_redirect_on_a_new_slug(): void
    {
        $id = $this->create([
            'speakers' => [['name' => 'Asha Rao']],
            'faqs' => [['question' => 'Is there parking?', 'answer' => '<p>Yes.</p>']],
        ])->assertCreated()->json('data.id');

        $editor = $this->staff();

        // A PATCH naming one field changes one field.
        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$id}", ['summary' => 'A shorter line.'])
            ->assertOk()
            ->assertJsonPath('data.summary', 'A shorter line.')
            ->assertJsonPath('data.title', 'Wi-Fi 7 for the office: a working session')
            ->assertJsonPath('data.speakers.0.name', 'Asha Rao')
            ->assertJsonPath('data.faqs.0.question', 'Is there parking?')
            ->assertJsonPath('data.starts_at', '2026-11-12T15:00');

        // An empty list clears; a new slug leaves a 301 behind.
        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$id}", ['speakers' => [], 'faqs' => [], 'slug' => 'wifi-7-session', 'ends_at' => null])
            ->assertOk()
            ->assertJsonPath('data.speakers', [])
            ->assertJsonPath('data.faqs', [])
            ->assertJsonPath('data.ends_at', null)
            ->assertJsonPath('data.time_label', '3:00 pm IST')
            ->assertJsonPath('data.slug', 'wifi-7-session');

        $this->assertSame('/events/wifi-7-session', Redirect::where('from_path', '/events/wi-fi-7-for-the-office-a-working-session')->value('to_path'));
    }

    public function test_the_rules_that_span_two_fields_hold_on_create_and_on_a_partial_edit(): void
    {
        $this->create(['ends_at' => '2026-11-12T14:00'])->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $this->create(['registration_closes_at' => '2026-11-12T15:01'])->assertStatus(422)->assertJsonValidationErrors(['registration_closes_at']);
        $this->create(['venue_name' => null])->assertStatus(422)->assertJsonValidationErrors(['venue_name']);
        $this->create(['registration_mode' => 'external'])->assertStatus(422)->assertJsonValidationErrors(['external_url']);
        $this->create(['online_url' => null])->assertStatus(422)->assertJsonValidationErrors(['online_url']);
        $this->create(['starts_at' => 'next thursday'])->assertStatus(422)->assertJsonValidationErrors(['starts_at']);
        $this->create(['starts_at' => null])->assertStatus(422)->assertJsonValidationErrors(['starts_at']);
        $this->create(['map_url' => 'javascript:alert(1)', 'external_url' => 'ftp://x.test/a'])->assertStatus(422)->assertJsonValidationErrors(['map_url', 'external_url']);
        $this->create(['slug' => 'registration'])->assertStatus(422)->assertJsonValidationErrors(['slug']);
        $this->create(['capacity' => 0, 'max_seats' => 21])->assertStatus(422)->assertJsonValidationErrors(['capacity', 'max_seats']);
        $this->create(['speakers' => array_fill(0, 13, ['name' => 'Somebody'])])->assertStatus(422)->assertJsonValidationErrors(['speakers']);
        $this->create(['speakers' => [['role' => 'Nobody']], 'agenda' => [['time' => '3 pm']]])->assertStatus(422)
            ->assertJsonValidationErrors(['speakers.0.name', 'agenda.0.title']);
        $this->create(['cover_image_path' => 'media/not-in-the-library.jpg'])->assertStatus(422)->assertJsonValidationErrors(['cover_image_path']);
        $this->assertSame(0, Event::count());

        // An online event needs no venue; a draft needs no join link; an
        // announcement that is published online needs none either.
        $this->create(['title' => 'Online one', 'format' => 'online', 'venue_name' => null])->assertCreated();
        $this->create(['title' => 'A draft', 'status' => 'draft', 'online_url' => null])->assertCreated();
        $this->create(['title' => 'An announcement', 'registration_mode' => 'none', 'online_url' => null])->assertCreated();

        // On an edit, each half is held to what is stored.
        $event = $this->event(['slug' => 'held', 'status' => PublishStatus::Draft, 'online_url' => null]);
        $editor = $this->staff();
        $patch = fn (array $data) => $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}", $data);

        $patch(['ends_at' => '2026-11-12T15:00'])->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $patch(['starts_at' => '2026-11-12T17:00'])->assertStatus(422)->assertJsonValidationErrors(['ends_at']);
        $patch(['status' => 'published'])->assertStatus(422)->assertJsonValidationErrors(['online_url']);
        $patch(['venue_name' => ''])->assertStatus(422)->assertJsonValidationErrors(['venue_name']);
        $patch(['registration_mode' => 'external'])->assertStatus(422)->assertJsonValidationErrors(['external_url']);
        $patch(['status' => 'published', 'online_url' => 'https://meet.example.com/abc'])->assertOk()->assertJsonPath('data.status', 'published');
    }

    public function test_a_library_picture_is_accepted_and_a_document_is_not(): void
    {
        Media::create(['disk' => 'public', 'path' => 'media/cover.jpg', 'filename' => 'cover.jpg', 'mime' => 'image/jpeg', 'size' => 10, 'alt_text' => 'A full seminar room']);
        Media::create(['disk' => 'public', 'path' => 'media/asha.jpg', 'filename' => 'asha.jpg', 'mime' => 'image/jpeg', 'size' => 10]);
        Media::create(['disk' => 'public', 'path' => 'media/brochure.pdf', 'filename' => 'brochure.pdf', 'mime' => 'application/pdf', 'size' => 10]);
        MediaMeta::forget();

        $this->create(['cover_image_path' => 'media/brochure.pdf'])->assertStatus(422)->assertJsonValidationErrors(['cover_image_path']);
        $this->create(['speakers' => [['name' => 'Asha Rao', 'photo_path' => 'media/brochure.pdf']]])->assertStatus(422)
            ->assertJsonValidationErrors(['speakers.0.photo_path']);

        $response = $this->create(['cover_image_path' => 'media/cover.jpg', 'speakers' => [['name' => 'Asha Rao', 'photo_path' => 'media/asha.jpg']]])
            ->assertCreated()
            ->assertJsonPath('data.cover_image_path', 'media/cover.jpg')
            ->assertJsonPath('data.speakers.0.photo_path', 'media/asha.jpg');

        $this->assertStringEndsWith('/storage/media/cover.jpg', $response->json('data.cover_image'));

        // The page gets URLs with the library's alt text, never the paths.
        $this->getJson('/api/v1/events/'.$response->json('data.slug'))->assertOk()
            ->assertJsonPath('data.cover_image_alt', 'A full seminar room')
            ->assertJsonMissingPath('data.cover_image_path')
            ->assertJsonMissingPath('data.speakers.0.photo_path')
            ->assertJsonPath('data.speakers.0.photo_alt', 'Asha Rao');
    }

    public function test_the_list_puts_what_is_coming_first_and_carries_counts(): void
    {
        $november = $this->event();
        $this->event(['title' => 'October webinar', 'slug' => 'october', 'format' => 'online', 'starts_at' => '2026-10-20 11:00:00', 'ends_at' => null]);
        $this->event(['title' => 'A draft for January', 'slug' => 'january', 'status' => PublishStatus::Draft, 'starts_at' => '2027-01-15 10:00:00', 'ends_at' => null]);
        $this->event(['title' => 'September', 'slug' => 'september', 'starts_at' => '2026-09-10 15:00:00', 'ends_at' => '2026-09-10 16:00:00']);
        $this->event(['title' => 'August', 'slug' => 'august', 'starts_at' => '2026-08-10 15:00:00', 'ends_at' => null]);

        $november->update(['capacity' => 10]);
        $this->seat($november, 3);
        $this->seat($november, 2, 'waitlisted');
        $this->seat($november, 1, 'cancelled');

        $editor = $this->staff();
        $list = fn (string $query = '') => $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/events'.$query)->assertOk();

        // Coming, soonest first; then what has been, newest first.
        $response = $list();
        $this->assertSame(['october', 'wifi-7-working-session', 'january', 'september', 'august'], array_column($response->json('data'), 'slug'));
        $response->assertJsonPath('meta.timezone', 'IST')->assertJsonMissingPath('data.0.body')->assertJsonMissingPath('data.0.seo');
        $this->assertSame(
            ['confirmed' => 1, 'confirmed_seats' => 3, 'waitlisted' => 1, 'cancelled' => 1, 'attended' => 0, 'seats_left' => 7],
            $response->json('data.1.counts'),
        );
        // No capacity: nothing is "left".
        $this->assertNull($response->json('data.0.counts.seats_left'));

        $this->assertSame(['january'], array_column($list('?status=draft')->json('data'), 'slug'));
        $this->assertSame(['october'], array_column($list('?format=online')->json('data'), 'slug'));
        $this->assertSame(['september', 'august'], array_column($list('?when=past')->json('data'), 'slug'));
        $this->assertCount(3, $list('?when=upcoming')->json('data'));
        $this->assertSame(['october'], array_column($list('?q=webinar')->json('data'), 'slug'));
        $this->assertSame(['august', 'september', 'october', 'wifi-7-working-session', 'january'], array_column($list('?sort=starts&dir=asc')->json('data'), 'slug'));
        $this->assertSame('A draft for January', $list('?sort=title&dir=asc')->json('data.0.title'));
        $list('?per_page=500')->assertJsonPath('meta.per_page', 100);
    }

    public function test_the_capacity_cannot_go_below_the_seats_already_taken(): void
    {
        $event = $this->event(['capacity' => 10]);
        $this->seat($event, 4);
        $this->seat($event, 3);
        $this->seat($event, 5, 'waitlisted');

        $editor = $this->staff();

        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}", ['capacity' => 6])
            ->assertStatus(422)
            ->assertJsonPath('errors.capacity.0', '7 seats are already taken, so the capacity cannot be lower than 7.');

        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}", ['capacity' => 7])
            ->assertOk()->assertJsonPath('data.counts.seats_left', 0);
    }

    public function test_more_room_lets_the_waiting_list_in(): void
    {
        $event = $this->event(['capacity' => 2, 'waitlist_enabled' => true]);
        $this->seat($event, 2);
        $waiting = $this->seat($event, 2, 'waitlisted', 'waiting@example.test');

        $this->actingAs($this->staff(), 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}", ['capacity' => 4])
            ->assertOk()
            ->assertJsonPath('data.counts.confirmed_seats', 4)
            ->assertJsonPath('data.counts.waitlisted', 0);

        $this->assertSame(EventRegistrationStatus::Confirmed, $waiting->fresh()->status);
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, fn (EventRegistrationConfirmed $n, $c, AnonymousNotifiable $to) => $n->promoted && $to->routes['mail'] === 'waiting@example.test');
    }

    public function test_tell_everyone_registered_tells_the_confirmed_only_and_only_when_ticked(): void
    {
        $event = $this->event();
        $confirmed = $this->seat($event, 1, 'confirmed', 'coming@example.test', ['reminded_at' => now()]);
        $this->seat($event, 1, 'waitlisted', 'waiting@example.test');
        $this->seat($event, 1, 'cancelled', 'gone@example.test');

        $editor = $this->staff();
        $patch = fn (array $data) => $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}", $data)->assertOk();

        // Unticked: a new time is saved and nobody is written to — but the
        // reminder belongs to a time, so it is owed again.
        $patch(['starts_at' => '2026-11-13T15:00', 'ends_at' => '2026-11-13T16:30']);
        Notification::assertSentOnDemandTimes(EventChanged::class, 0);
        $this->assertNull($confirmed->fresh()->reminded_at);

        // Ticked, but nothing that matters to a registrant moved.
        $patch(['summary' => 'Reworded.', 'notify_registrants' => true]);
        Notification::assertSentOnDemandTimes(EventChanged::class, 0);

        // Ticked, and the place moved.
        $patch(['venue_name' => 'The other hall', 'notify_registrants' => true]);
        Notification::assertSentOnDemandTimes(EventChanged::class, 1);
        Notification::assertSentOnDemand(EventChanged::class, function (EventChanged $n, $channels, AnonymousNotifiable $to) {
            $mail = $n->toMail($to);

            return $to->routes['mail'] === 'coming@example.test'
                && str_contains((string) $mail->render(), 'The other hall')
                && count($mail->rawAttachments) === 1
                && str_contains($mail->rawAttachments[0]['data'], 'DTSTART:20261113T093000Z');
        });
    }

    public function test_an_event_with_registrations_is_archived_not_deleted(): void
    {
        $event = $this->event();
        $event->faqs()->create(['question' => 'Q?', 'answer' => '<p>A.</p>', 'sort_order' => 0]);
        $event->seo()->create(['title' => 'An override']);
        $registration = $this->seat($event, 1, 'cancelled');

        $editor = $this->staff();

        $this->actingAs($editor, 'sanctum')->deleteJson("/api/v1/admin/events/{$event->id}")
            ->assertStatus(422)
            ->assertJsonPath('errors.event.0', 'People have registered for this event, so it cannot be deleted. Archive it instead.');
        $this->assertNotNull($event->fresh());

        $registration->delete();

        $this->actingAs($editor, 'sanctum')->deleteJson("/api/v1/admin/events/{$event->id}")->assertOk()->assertExactJson(['message' => 'Event deleted.']);
        $this->assertNull(Event::find($event->id));
        $this->assertDatabaseMissing('faqs', ['faqable_type' => 'event', 'faqable_id' => $event->id]);
        $this->assertDatabaseMissing('seo_metadata', ['seoable_type' => 'event', 'seoable_id' => $event->id]);
    }

    public function test_duplicate_makes_a_draft_copy_with_a_free_slug_and_no_registrations(): void
    {
        $event = $this->event(['is_featured' => true, 'capacity' => 20, 'speakers' => [['name' => 'Asha Rao', 'role' => null, 'photo_path' => null]]]);
        $event->faqs()->create(['question' => 'Is there parking?', 'answer' => '<p>Yes.</p>', 'sort_order' => 0]);
        $this->seat($event, 3);

        $editor = $this->staff();
        $copy = $this->actingAs($editor, 'sanctum')->postJson("/api/v1/admin/events/{$event->id}/duplicate")->assertCreated()
            ->assertJsonPath('data.title', 'Wi-Fi 7 for the office: a working session (copy)')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.is_featured', false)
            ->assertJsonPath('data.slug', 'wi-fi-7-for-the-office-a-working-session-copy')
            ->assertJsonPath('data.capacity', 20)
            ->assertJsonPath('data.online_url', 'https://meet.example.com/abc')
            ->assertJsonPath('data.speakers.0.name', 'Asha Rao')
            ->assertJsonPath('data.faqs.0.question', 'Is there parking?')
            ->assertJsonPath('data.counts.confirmed', 0)
            ->assertJsonPath('meta.max_speakers', 12)
            ->json('data');

        $this->assertNotSame($event->id, $copy['id']);
        $this->assertSame(0, EventRegistration::where('event_id', $copy['id'])->count());

        // A second copy takes the next free slug.
        $this->actingAs($editor, 'sanctum')->postJson("/api/v1/admin/events/{$event->id}/duplicate")->assertCreated()
            ->assertJsonPath('data.slug', 'wi-fi-7-for-the-office-a-working-session-copy-2');
    }

    public function test_an_event_called_registration_gets_another_slug(): void
    {
        $this->create(['title' => 'Registration'])->assertCreated()->assertJsonPath('data.slug', 'registration-2');
    }

    // ------------------------------------------------------- registrations

    public function test_the_registrations_list_orders_the_room_then_the_queue_and_never_shows_a_token(): void
    {
        $event = $this->event(['capacity' => 10]);
        $cancelled = $this->seat($event, 1, 'cancelled', 'gone@example.test');
        $second = $this->seat($event, 2, 'waitlisted', 'second@example.test');
        $first = $this->seat($event, 1, 'waitlisted', 'first@example.test');
        $first->forceFill(['waitlisted_at' => now()->subHour()])->save();
        $confirmed = $this->seat($event, 3, 'confirmed', 'priya@acme.co.in', ['name' => 'Priya Das', 'company' => 'Acme Foods', 'phone' => '+91 98765 43210', 'note' => 'Step-free access.']);

        $sales = $this->staff(RoleEnum::SalesManager);
        $response = $this->actingAs($sales, 'sanctum')->getJson("/api/v1/admin/events/{$event->id}/registrations")->assertOk();

        $this->assertSame(
            [$confirmed->id, $first->id, $second->id, $cancelled->id],
            array_column($response->json('data'), 'id'),
        );

        $this->assertSame([
            'id', 'event_id', 'name', 'email', 'phone', 'company', 'seats', 'note', 'staff_note', 'status', 'status_label',
            'allowed_next', 'customer_id', 'lead_id', 'lead_path', 'source', 'reminded_at', 'cancelled_at', 'created_at',
        ], array_keys($response->json('data.0')));

        // What the status select may offer, itself first — and before the
        // event starts, never Attended or No-show.
        $next = fn (int $row) => array_column($response->json("data.{$row}.allowed_next"), 'value');
        $this->assertSame(['confirmed', 'cancelled'], $next(0));
        $this->assertSame(['waitlisted', 'confirmed', 'cancelled'], $next(1));
        $this->assertSame(['cancelled', 'confirmed', 'waitlisted'], $next(3));
        $this->assertSame(['value' => 'waitlisted', 'label' => 'On the waiting list'], $response->json('data.1.allowed_next.0'));
        $response->assertJsonMissingPath('data.0.token')
            ->assertJsonPath('data.0.status_label', 'Confirmed')
            ->assertJsonPath('data.0.source', 'public')
            ->assertJsonPath('data.0.created_at', '2026-10-06T10:00:00+05:30');
        $this->assertStringNotContainsString($confirmed->token, $response->getContent());

        // Enough about the event that somebody who cannot open its form still knows where they are.
        $this->assertSame([
            'id' => $event->id,
            'title' => 'Wi-Fi 7 for the office: a working session',
            'status' => 'published',
            'date_label' => 'Thursday 12 November 2026',
            'time_label' => '3:00 pm – 4:30 pm IST',
            'has_started' => false,
            'counts' => ['confirmed' => 1, 'confirmed_seats' => 3, 'waitlisted' => 2, 'cancelled' => 1, 'attended' => 0, 'seats_left' => 7],
            'capacity' => 10,
            'max_seats' => 5,
            'waitlist_enabled' => false,
        ], $response->json('meta.event'));

        // Once the doors have opened the screen is told so, and each row's
        // select offers what happened on the day — the same clock a PATCH uses.
        $this->travelTo(Carbon::parse('2026-11-12 15:00:00', 'Asia/Kolkata'));
        $started = $this->actingAs($sales, 'sanctum')->getJson("/api/v1/admin/events/{$event->id}/registrations")->assertOk()
            ->assertJsonPath('meta.event.has_started', true);
        $this->assertSame(['confirmed', 'cancelled', 'attended', 'no_show'], array_column($started->json('data.0.allowed_next'), 'value'));
        $this->travelTo(Carbon::parse('2026-10-06 10:00:00', 'Asia/Kolkata'));
        $this->assertSame(['confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show'], array_column($response->json('meta.statuses'), 'value'));

        $list = fn (string $query) => $this->actingAs($sales, 'sanctum')->getJson("/api/v1/admin/events/{$event->id}/registrations{$query}")->assertOk()->json('data');
        $this->assertCount(2, $list('?status=waitlisted'));
        $this->assertSame([$confirmed->id], array_column($list('?q=acme'), 'id'));
        $this->assertSame([$confirmed->id], array_column($list('?q=98765'), 'id'));
        $this->assertSame([], $list('?q=%25'));
    }

    public function test_the_export_escapes_a_formula_typed_into_a_public_form(): void
    {
        $event = $this->event();
        $this->seat($event, 2, 'confirmed', 'mallory@example.test', ['name' => '=HYPERLINK("https://evil.example","Click")', 'company' => '+SUM(1,2)', 'note' => '@cmd']);
        $this->seat($event, 1, 'waitlisted', 'priya@acme.co.in', ['name' => 'Priya Das']);

        $response = $this->actingAs($this->staff(RoleEnum::SalesManager), 'sanctum')->get("/api/v1/admin/events/{$event->id}/registrations/export")->assertOk();

        $this->assertStringContainsString('wifi-7-working-session-registrations.csv', (string) $response->headers->get('Content-Disposition'));
        $csv = $response->streamedContent();

        $this->assertStringContainsString('Registered,Name,Email,Phone,Company,Seats,Status', $csv);
        // Every cell that would begin a formula is given a leading apostrophe.
        $this->assertStringContainsString("\"'=HYPERLINK(", $csv);
        $this->assertStringContainsString("'+SUM(1,2)", $csv);
        $this->assertStringContainsString("'@cmd", $csv);
        $this->assertStringNotContainsString(',=HYPERLINK', $csv);
        $this->assertStringContainsString('"Priya Das",priya@acme.co.in', $csv);
        $this->assertStringContainsString('On the waiting list', $csv);

        // The filter applies to the file too.
        $filtered = $this->actingAs($this->staff(RoleEnum::SalesManager), 'sanctum')->get("/api/v1/admin/events/{$event->id}/registrations/export?status=waitlisted")->streamedContent();
        $this->assertStringNotContainsString('mallory', $filtered);
    }

    public function test_the_desk_adds_somebody_and_force_goes_past_the_room_and_the_closing_date(): void
    {
        $event = $this->event(['capacity' => 2, 'registration_closes_at' => '2026-10-05 18:00:00']);
        $this->seat($event, 2);

        $editor = $this->staff();
        $add = fn (array $data) => $this->actingAs($editor, 'sanctum')->postJson("/api/v1/admin/events/{$event->id}/registrations", array_replace([
            'name' => 'Rahul Sen', 'email' => 'rahul@example.test', 'phone' => '033 2222 3333', 'seats' => 2,
        ], $data));

        // Without `force` the desk is held to the same door as anybody.
        $add([])->assertStatus(422)->assertJsonValidationErrors(['registration']);
        $add(['email' => 'not-an-address'])->assertStatus(422)->assertJsonValidationErrors(['email']);

        $response = $add(['force' => true, 'notify' => false])->assertCreated()
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.source', 'staff')
            ->assertJsonPath('data.seats', 2)
            ->assertJsonMissingPath('data.token')
            ->assertJsonPath('meta.event.counts.confirmed_seats', 4)
            ->assertJsonPath('meta.event.counts.seats_left', 0);

        // A lead all the same, and the desk's own notice; `notify: false`
        // skips only the registrant's confirmation.
        $lead = Lead::sole();
        $this->assertSame('event', $lead->channel);
        $this->assertSame($lead->id, $response->json('data.lead_id'));
        $this->assertSame("/admin/leads/{$lead->id}", $response->json('data.lead_path'));
        $this->assertNull($lead->source_path);
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 0);
        Notification::assertSentOnDemandTimes(EventRegistrationReceived::class, 1);

        // By default they are told.
        $add(['email' => 'second@example.test', 'force' => true])->assertCreated();
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'second@example.test');

        // An address that already holds a live registration is refused on
        // `email`, naming its status — that row is edited, not rewritten.
        $rahul = EventRegistration::where('email', 'rahul@example.test')->sole();
        $add(['name' => 'Somebody Else', 'seats' => 1, 'force' => true])->assertStatus(422)
            ->assertJsonPath('errors.email.0', 'This address already has a registration for this event (Confirmed). Edit that one instead.');
        $this->assertSame(['Rahul Sen', 2], [$rahul->fresh()->name, $rahul->fresh()->seats]);
        $this->assertSame(2, Lead::count());

        // A cancelled one is revived by the desk, under a new token.
        $rahul->forceFill(['status' => 'cancelled', 'cancelled_at' => now()])->save();
        $add(['name' => 'Rahul S.', 'seats' => 1, 'force' => true, 'notify' => false])->assertCreated()
            ->assertJsonPath('data.id', $rahul->id)
            ->assertJsonPath('data.status', 'confirmed')
            ->assertJsonPath('data.name', 'Rahul S.')
            ->assertJsonPath('data.cancelled_at', null)
            ->assertJsonPath('data.source', 'staff');
        $this->assertNotSame($rahul->token, $rahul->fresh()->token);

        // Nothing registers for an event that does not register here, force or not.
        $event->update(['registration_mode' => 'none']);
        $add(['email' => 'third@example.test', 'force' => true])->assertStatus(422)->assertJsonValidationErrors(['registration']);
    }

    public function test_the_desk_cancels_confirms_and_marks_attendance_by_the_rules(): void
    {
        $event = $this->event(['capacity' => 3, 'waitlist_enabled' => true]);
        $held = $this->seat($event, 3, 'confirmed', 'held@example.test');
        $waiting = $this->seat($event, 2, 'waitlisted', 'waiting@example.test');
        $big = $this->seat($event, 3, 'waitlisted', 'big@example.test');

        $sales = $this->staff(RoleEnum::SalesManager);
        $patch = fn (EventRegistration $r, array $data) => $this->actingAs($sales, 'sanctum')
            ->patchJson("/api/v1/admin/events/{$event->id}/registrations/{$r->id}", $data);

        // The note is the desk's, and travels alone.
        $patch($held, ['staff_note' => 'Rang to confirm numbers.'])->assertOk()
            ->assertJsonPath('data.staff_note', 'Rang to confirm numbers.')
            // A write answers the row as the list would: its moves, and the event beside it.
            ->assertJsonPath('data.allowed_next.0.value', 'confirmed')
            ->assertJsonPath('meta.event.has_started', false)
            ->assertJsonPath('meta.event.max_seats', 5)
            ->assertJsonPath('meta.event.waitlist_enabled', true);

        // Attendance is what happened on the day.
        $patch($held, ['status' => 'attended'])->assertStatus(422)->assertJsonValidationErrors(['status']);
        $patch($held, ['status' => 'waitlisted'])->assertStatus(422)->assertJsonValidationErrors(['status']);

        // No room: confirming the waiting party is refused, naming the figures.
        $patch($waiting, ['status' => 'confirmed'])->assertStatus(422)->assertJsonValidationErrors(['status']);
        $this->assertSame(EventRegistrationStatus::Waitlisted, $waiting->fresh()->status);

        // Cancelling emails the registrant and lets the queue move: the
        // party of two fits the three seats freed; the three behind do not.
        $patch($held, ['status' => 'cancelled'])->assertOk()
            ->assertJsonPath('data.status', 'cancelled')
            ->assertJsonPath('meta.event.counts.confirmed_seats', 2);
        $this->assertNotNull($held->fresh()->cancelled_at);
        $this->assertSame(EventRegistrationStatus::Confirmed, $waiting->fresh()->status);
        $this->assertSame(EventRegistrationStatus::Waitlisted, $big->fresh()->status);
        Notification::assertSentOnDemand(EventRegistrationCancelled::class, fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'held@example.test');
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, fn (EventRegistrationConfirmed $n, $c, AnonymousNotifiable $to) => $n->promoted && $to->routes['mail'] === 'waiting@example.test');

        // The desk may overbook, but only by saying so — and the party is
        // told a place opened.
        $patch($big, ['status' => 'confirmed'])->assertStatus(422)->assertJsonValidationErrors(['status']);
        $patch($big, ['status' => 'confirmed', 'force' => true])->assertOk()->assertJsonPath('data.status', 'confirmed');
        Notification::assertSentOnDemand(EventRegistrationConfirmed::class, fn (EventRegistrationConfirmed $n, $c, AnonymousNotifiable $to) => $n->promoted && $to->routes['mail'] === 'big@example.test');

        // A cancelled registration put back on the list is told it is waiting.
        $patch($held, ['status' => 'waitlisted'])->assertOk()->assertJsonPath('data.cancelled_at', null);
        Notification::assertSentOnDemand(EventRegistrationWaitlisted::class, fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === 'held@example.test');

        // Once the doors have opened, attendance may be recorded and corrected.
        $this->travelTo(Carbon::parse('2026-11-12 15:20:00', 'Asia/Kolkata'));
        $patch($waiting, ['status' => 'attended'])->assertOk()->assertJsonPath('data.status', 'attended')->assertJsonPath('meta.event.counts.attended', 1);
        $patch($waiting, ['status' => 'no_show'])->assertOk()->assertJsonPath('data.status_label', 'No-show');
        $patch($waiting, ['status' => 'bogus'])->assertStatus(422)->assertJsonValidationErrors(['status']);
    }

    public function test_the_desk_changes_a_partys_size_within_the_room(): void
    {
        $event = $this->event(['capacity' => 4, 'waitlist_enabled' => true]);
        $party = $this->seat($event, 3);
        $waiting = $this->seat($event, 2, 'waitlisted', 'waiting@example.test');

        $editor = $this->staff();
        $patch = fn (array $data) => $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$event->id}/registrations/{$party->id}", $data);

        $patch(['seats' => 5])->assertStatus(422)->assertJsonPath('errors.seats.0', 'Only 4 seats are left.');
        $patch(['seats' => 0])->assertStatus(422)->assertJsonValidationErrors(['seats']);
        $patch(['seats' => 4])->assertOk()->assertJsonPath('data.seats', 4);
        $patch(['seats' => 5, 'force' => true])->assertOk()->assertJsonPath('data.seats', 5);

        // Shrinking gives seats back, and the queue takes them.
        $patch(['seats' => 2])->assertOk()->assertJsonPath('meta.event.counts.waitlisted', 0);
        $this->assertSame(EventRegistrationStatus::Confirmed, $waiting->fresh()->status);
    }

    public function test_deleting_a_registration_is_for_good_and_moves_the_queue_without_an_email(): void
    {
        $event = $this->event(['capacity' => 2, 'waitlist_enabled' => true]);
        $held = $this->seat($event, 2, 'confirmed', 'held@example.test');
        $waiting = $this->seat($event, 2, 'waitlisted', 'waiting@example.test');

        $this->actingAs($this->staff(), 'sanctum')->deleteJson("/api/v1/admin/events/{$event->id}/registrations/{$held->id}")->assertNoContent();

        $this->assertNull(EventRegistration::find($held->id));
        $this->assertSame(EventRegistrationStatus::Confirmed, $waiting->fresh()->status);
        Notification::assertSentOnDemandTimes(EventRegistrationCancelled::class, 0);
        Notification::assertSentOnDemandTimes(EventRegistrationConfirmed::class, 1);
    }

    public function test_a_registration_addressed_through_another_events_id_is_a_404(): void
    {
        $event = $this->event();
        $other = $this->event(['title' => 'Another', 'slug' => 'another']);
        $registration = $this->seat($event, 1);

        $editor = $this->staff();

        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/events/{$other->id}/registrations/{$registration->id}", ['staff_note' => 'x'])->assertNotFound();
        $this->actingAs($editor, 'sanctum')->deleteJson("/api/v1/admin/events/{$other->id}/registrations/{$registration->id}")->assertNotFound();
        $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/events/999999/registrations')->assertNotFound();

        $this->assertNotNull($registration->fresh());
        $this->assertNull($registration->fresh()->staff_note);
    }

    // ----------------------------------------------------------------- roles

    public function test_who_may_reach_what_proved_with_real_tokens(): void
    {
        $event = $this->event();
        $registration = $this->seat($event, 1);

        $as = function (string $token) {
            $this->app['auth']->forgetGuards();

            return $this->flushHeaders()->withHeader('Authorization', "Bearer {$token}");
        };
        $staffToken = fn (RoleEnum $role) => $this->staff($role)->createToken('admin')->plainTextToken;

        $content = $staffToken(RoleEnum::ContentManager);
        $sales = $staffToken(RoleEnum::SalesManager);
        $support = $staffToken(RoleEnum::SupportEngineer);
        $admin = $staffToken(RoleEnum::Admin);
        $customer = Customer::create(['name' => 'Priya Das', 'email' => 'priya@acme.co.in', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active])
            ->createToken('portal', ['portal'])->plainTextToken;

        $registrations = "/api/v1/admin/events/{$event->id}/registrations";

        // The content manager runs the event and its list.
        $as($content)->getJson('/api/v1/admin/events')->assertOk();
        $as($content)->getJson("/api/v1/admin/events/{$event->id}")->assertOk();
        $as($content)->getJson($registrations)->assertOk();

        // The sales desk works the list, and may not touch the event.
        $as($sales)->getJson($registrations)->assertOk();
        $as($sales)->get("{$registrations}/export")->assertOk();
        $as($sales)->patchJson("{$registrations}/{$registration->id}", ['staff_note' => 'Ours.'])->assertOk();
        $as($sales)->getJson('/api/v1/admin/events')->assertForbidden();
        $as($sales)->getJson("/api/v1/admin/events/{$event->id}")->assertForbidden();
        $as($sales)->patchJson("/api/v1/admin/events/{$event->id}", ['title' => 'Renamed'])->assertForbidden();
        $as($sales)->postJson("/api/v1/admin/events/{$event->id}/duplicate")->assertForbidden();
        $as($sales)->deleteJson("/api/v1/admin/events/{$event->id}")->assertForbidden();

        // Support has neither.
        $as($support)->getJson('/api/v1/admin/events')->assertForbidden();
        $as($support)->getJson($registrations)->assertForbidden();
        $as($support)->deleteJson("{$registrations}/{$registration->id}")->assertForbidden();

        // An administrator passes every role check.
        $as($admin)->getJson('/api/v1/admin/events')->assertOk();
        $as($admin)->getJson($registrations)->assertOk();

        // A customer's token is refused at the boundary, and nobody at all is a 401.
        $as($customer)->getJson('/api/v1/admin/events')->assertForbidden();
        $as($customer)->getJson($registrations)->assertForbidden();
        $this->app['auth']->forgetGuards();
        $this->flushHeaders()->getJson('/api/v1/admin/events')->assertUnauthorized();
        $this->flushHeaders()->getJson($registrations)->assertUnauthorized();

        $this->assertSame('Wi-Fi 7 for the office: a working session', $event->fresh()->title);
        $this->assertNotNull($registration->fresh());
    }

    // ------------------------------------------------------------- reminders

    public function test_the_reminder_goes_once_to_the_confirmed_of_a_published_event_that_is_due(): void
    {
        $due = $this->event(['starts_at' => '2026-10-07 09:00:00', 'ends_at' => null]);
        $later = $this->event(['title' => 'Later', 'slug' => 'later']);
        $draft = $this->event(['title' => 'Draft', 'slug' => 'draft', 'status' => PublishStatus::Draft, 'starts_at' => '2026-10-07 09:00:00', 'ends_at' => null]);

        $coming = $this->seat($due, 2, 'confirmed', 'coming@example.test');
        $this->seat($due, 1, 'waitlisted', 'waiting@example.test');
        $this->seat($due, 1, 'cancelled', 'gone@example.test');
        $this->seat($due, 1, 'confirmed', 'told@example.test', ['reminded_at' => now()->subHour()]);
        $this->seat($later, 1, 'confirmed', 'later@example.test');
        $this->seat($draft, 1, 'confirmed', 'draft@example.test');

        $this->artisan('technoware:remind-events')->assertSuccessful();

        Notification::assertSentOnDemandTimes(EventReminder::class, 1);
        Notification::assertSentOnDemand(EventReminder::class, function (EventReminder $n, $channels, AnonymousNotifiable $to) {
            return $to->routes['mail'] === 'coming@example.test'
                && str_contains((string) $n->toMail($to)->render(), 'https://meet.example.com/abc');
        });
        $this->assertNotNull($coming->fresh()->reminded_at);
        // The claim goes through the query builder, so the row's own clock does not move.
        $this->assertTrue($coming->fresh()->updated_at->equalTo($coming->updated_at));

        // The second run finds nobody: the claim is the conditional UPDATE.
        $this->artisan('technoware:remind-events')->assertSuccessful();
        Notification::assertSentOnDemandTimes(EventReminder::class, 1);

        // And a row another run has already claimed is not sent to.
        $this->assertFalse(EventReminders::send($coming->fresh()));
    }

    public function test_zero_hours_sends_no_reminder_and_the_window_is_the_setting(): void
    {
        $event = $this->event(['starts_at' => '2026-10-08 09:00:00', 'ends_at' => null]);
        $this->seat($event, 1);

        // 47 hours away: outside the default day…
        $this->artisan('technoware:remind-events')->assertSuccessful();
        Notification::assertSentOnDemandTimes(EventReminder::class, 0);

        // …switched off, nobody is due however close it is…
        Setting::where('key', 'event_reminder_hours')->firstOrFail()->forceFill(['value' => '0'])->save();
        Cache::flush();
        $this->travelTo(Carbon::parse('2026-10-08 08:00:00', 'Asia/Kolkata'));
        $this->artisan('technoware:remind-events')->assertSuccessful();
        Notification::assertSentOnDemandTimes(EventReminder::class, 0);

        // …and inside a window of three days.
        $this->travelTo(Carbon::parse('2026-10-06 10:00:00', 'Asia/Kolkata'));
        Setting::where('key', 'event_reminder_hours')->firstOrFail()->forceFill(['value' => '72'])->save();
        Cache::flush();
        $this->artisan('technoware:remind-events')->assertSuccessful();
        Notification::assertSentOnDemandTimes(EventReminder::class, 1);
    }

    public function test_somebody_confirmed_inside_the_window_is_not_reminded_a_quarter_of_an_hour_later(): void
    {
        $this->event(['starts_at' => '2026-10-07 09:00:00', 'ends_at' => null]);

        $this->postJson('/api/v1/events/wifi-7-working-session/register', ['name' => 'Priya Das', 'email' => 'priya@acme.co.in'])->assertCreated();
        $this->assertNotNull(EventRegistration::sole()->reminded_at);

        $this->artisan('technoware:remind-events')->assertSuccessful();
        Notification::assertSentOnDemandTimes(EventReminder::class, 0);
    }

    // ------------------------------------------------------------ settings

    public function test_the_events_settings_are_private_and_their_numbers_are_checked(): void
    {
        $admin = $this->staff(RoleEnum::Admin);
        $save = fn (string $key, string $value) => $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $value]]]);

        $save('event_reminder_hours', '169')->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $save('event_reminder_hours', 'a day')->assertStatus(422);
        $save('event_max_seats', '0')->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $save('event_max_seats', '21')->assertStatus(422);
        $save('events_email', 'not-an-address')->assertStatus(422);

        $save('event_reminder_hours', '0')->assertOk();
        $save('event_max_seats', '8')->assertOk();
        $save('events_email', 'events@technoware.test')->assertOk();

        // A new event takes the new default.
        $this->create()->assertCreated()->assertJsonPath('data.max_seats', 8);

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        foreach (['events_email', 'event_reminder_hours', 'event_max_seats'] as $key) {
            $this->assertArrayNotHasKey($key, $public);
        }
    }

    // ------------------------------------------------ the file and the graph

    public function test_a_registrants_calendar_file_carries_the_join_link_and_the_public_one_does_not(): void
    {
        $event = $this->event();
        $registration = $this->seat($event, 2);
        $registration->setRelation('event', $event);

        $theirs = EventIcs::forRegistration($registration);
        $public = EventIcs::forEvent($event);

        // The description folds at 75 octets; unfold before reading it.
        $unfold = fn (string $ics) => str_replace("\r\n ", '', $ics);

        $this->assertStringContainsString('https://meet.example.com/abc', $unfold($theirs));
        $this->assertStringContainsString($registration->token, $unfold($theirs));
        $this->assertStringNotContainsString('meet.example.com', $unfold($public));
        $this->assertStringNotContainsString($registration->token, $unfold($public));

        // One UID for both, so a registrant who downloaded the public file has one entry.
        preg_match('/^UID:(.+)$/m', $theirs, $a);
        preg_match('/^UID:(.+)$/m', $public, $b);
        $this->assertSame(trim($a[1]), trim($b[1]));
        $this->assertStringStartsWith("event-{$event->id}@", trim($a[1]));
        $this->assertSame('wifi-7-working-session.ics', EventIcs::filename($event));

        // No end: a calendar draws an hour.
        $event->update(['ends_at' => null]);
        $this->assertStringContainsString('DTEND:20261112T103000Z', EventIcs::forEvent($event));

        // A later change outranks the file sent before it.
        preg_match('/^SEQUENCE:(\d+)/m', $public, $before);
        $this->travel(5)->minutes();
        $event->update(['venue_name' => 'The other hall']);
        preg_match('/^SEQUENCE:(\d+)/m', EventIcs::forEvent($event), $after);
        $this->assertGreaterThan((int) $before[1], (int) $after[1]);
    }

    /**
     * The console keeps what was typed when the format changes, so an
     * in-person event can still hold a join link and an online one a hall.
     * Neither may be sent: the format decides, wherever something is sent.
     */
    public function test_a_join_link_left_on_an_in_person_event_and_a_hall_left_on_an_online_one_are_never_sent(): void
    {
        $inPerson = $this->event(['format' => 'in_person', 'online_url' => 'https://meet.example.com/left-over']);
        $online = $this->event([
            'title' => 'Online only', 'slug' => 'online-only', 'format' => 'online',
            'venue_name' => 'The Left-Over Hall', 'venue_city' => 'Pune', 'venue_address' => '1 Old Road', 'map_url' => 'https://maps.example.com/old',
        ]);

        $render = function (object $notification): string {
            $mail = $notification->toMail(new AnonymousNotifiable);

            return (string) $mail->render().(string) json_encode(array_column($mail->rawAttachments, 'data'));
        };

        $here = $this->seat($inPerson, 1);
        $here->setRelation('event', $inPerson);
        foreach ([new EventRegistrationConfirmed($here), new EventRegistrationConfirmed($here, promoted: true), new EventReminder($here), new EventChanged($here)] as $notification) {
            $sent = $render($notification);
            $this->assertStringNotContainsString('meet.example.com', $sent, $notification::class);
            $this->assertStringContainsString('Technoware Experience Centre', $sent);
        }
        $this->assertStringNotContainsString('meet.example.com', str_replace("\r\n ", '', EventIcs::forRegistration($here)));

        $there = $this->seat($online, 1);
        $there->setRelation('event', $online);
        foreach ([new EventRegistrationConfirmed($there), new EventReminder($there), new EventChanged($there)] as $notification) {
            $sent = $render($notification);
            $this->assertStringNotContainsString('Left-Over Hall', $sent, $notification::class);
            $this->assertStringNotContainsString('Old Road', $sent);
            $this->assertStringContainsString('https://meet.example.com/abc', $sent);
        }
        $ics = str_replace("\r\n ", '', EventIcs::forRegistration($there));
        $this->assertStringContainsString("LOCATION:Online\r\n", $ics);
        $this->assertStringNotContainsString('Left-Over', $ics);

        // The page and its graph say the same, and the manage link's page too.
        $page = $this->getJson('/api/v1/events/online-only')->assertOk()
            ->assertJsonPath('data.venue_name', null)
            ->assertJsonPath('data.venue_address', null)
            ->assertJsonPath('data.map_url', null);
        $this->assertStringNotContainsString('Left-Over', $page->getContent());
        $this->getJson('/api/v1/events/registrations/'.$there->token)->assertOk()
            ->assertJsonPath('data.event.venue_name', null)
            ->assertJsonPath('data.event.venue_address', null);
        $this->assertStringNotContainsString('meet.example.com', $this->getJson('/api/v1/events/wifi-7-working-session')->assertOk()->getContent());
    }

    public function test_events_is_no_longer_an_address_a_page_or_a_content_type_can_take(): void
    {
        $editor = $this->staff();
        $page = fn (array $data) => $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/pages', ['status' => 'draft', ...$data]);

        // Typed, in either case…
        $page(['title' => 'What is on', 'slug' => 'events'])->assertStatus(422)->assertJsonValidationErrors(['slug']);
        $page(['title' => 'What is on', 'slug' => 'Events'])->assertStatus(422)->assertJsonValidationErrors(['slug']);
        // …or derived from the title, which is how most pages are made.
        $page(['title' => 'Events'])->assertStatus(422)->assertJsonValidationErrors(['title']);
        $this->assertSame(0, Page::count());

        // A page elsewhere is untouched, and cannot be moved onto the route.
        $id = $page(['title' => 'Events archive'])->assertCreated()->assertJsonPath('data.slug', 'events-archive')->json('data.id');
        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/pages/{$id}", ['slug' => 'events'])->assertStatus(422)->assertJsonValidationErrors(['slug']);
        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/pages/{$id}", ['slug' => 'events-archive', 'title' => 'Past events'])->assertOk();

        // A page that already sits on a route can still be saved under it.
        $old = Page::create(['title' => 'Events', 'slug' => 'events', 'status' => 'draft']);
        $this->actingAs($editor, 'sanctum')->patchJson("/api/v1/admin/pages/{$old->id}", ['slug' => 'events', 'title' => 'Events (old page)'])->assertOk();

        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/content-types', [
            'name' => 'Event', 'plural' => 'Events', 'slug' => 'events', 'schema_type' => 'Article',
        ])->assertStatus(422)->assertJsonValidationErrors(['slug']);
    }

    public function test_the_sample_events_wear_generated_covers_and_a_chosen_one_survives_a_re_seed(): void
    {
        Storage::fake('public');
        // A real upload already in the library: the samples must not borrow it.
        Media::create(['disk' => 'public', 'path' => 'media/we-are-hiring.jpg', 'filename' => 'we-are-hiring.jpg', 'mime' => 'image/jpeg', 'size' => 10]);

        $this->seed(SampleEventSeeder::class);

        $paths = [
            'sample-network-refresh-seminar' => 'media/seed/events/sample-network-refresh-seminar.svg',
            'sample-wifi-7-webinar' => 'media/seed/events/sample-wifi-7-webinar.svg',
            'sample-trade-show' => 'media/seed/events/sample-trade-show.svg',
        ];

        $this->assertSame($paths, Event::query()->orderBy('id')->pluck('cover_image_path', 'slug')->all());

        foreach ($paths as $slug => $path) {
            Storage::disk('public')->assertExists($path);
            $media = Media::where('path', $path)->sole();
            $this->assertSame('image/svg+xml', $media->mime);
            // The alt text is the event's own title, and the picture says so too.
            $this->assertSame(Event::where('slug', $slug)->value('title'), $media->alt_text);
            $this->assertStringContainsString('· SAMPLE', (string) Storage::disk('public')->get($path));
        }

        // A cover somebody chose is left alone; one that was cleared is drawn
        // again; and nothing is created a second time.
        Event::where('slug', 'sample-trade-show')->update(['cover_image_path' => 'media/we-are-hiring.jpg']);
        Event::where('slug', 'sample-wifi-7-webinar')->update(['cover_image_path' => null]);
        Event::where('slug', 'sample-network-refresh-seminar')->delete();

        $this->seed(SampleEventSeeder::class);

        $this->assertSame(2, Event::count());
        $this->assertSame('media/we-are-hiring.jpg', Event::where('slug', 'sample-trade-show')->value('cover_image_path'));
        $this->assertSame($paths['sample-wifi-7-webinar'], Event::where('slug', 'sample-wifi-7-webinar')->value('cover_image_path'));
    }

    public function test_the_graph_is_an_event_with_the_right_place_for_its_format(): void
    {
        $inPerson = $this->event(['format' => 'in_person', 'venue_address' => "Unit 4\nMumbai 400093", 'speakers' => [['name' => 'Asha Rao', 'role' => 'Engineer', 'photo_path' => null]]])->load('seo');
        $graph = StructuredData::event($inPerson);

        $this->assertSame('https://schema.org', $graph['@context']);
        $this->assertSame('Event', $graph['@type']);
        $this->assertSame('https://schema.org/OfflineEventAttendanceMode', $graph['eventAttendanceMode']);
        $this->assertSame('Place', $graph['location']['@type']);
        $this->assertSame('Unit 4, Mumbai 400093', $graph['location']['address']);
        $this->assertSame('2026-11-12T16:30:00+05:30', $graph['endDate']);
        $this->assertSame(['@type' => 'Person', 'name' => 'Asha Rao', 'jobTitle' => 'Engineer'], $graph['performer'][0]);
        $this->assertSame('Organization', $graph['organizer']['@type']);
        $this->assertArrayNotHasKey('offers', $graph);

        // No end, no speakers: absent keys, never nulls.
        $online = $this->event(['slug' => 'online', 'format' => 'online', 'ends_at' => null])->load('seo');
        $graph = StructuredData::event($online);
        $this->assertSame('VirtualLocation', $graph['location']['@type']);
        $this->assertStringEndsWith('/events/online', $graph['location']['url']);
        $this->assertArrayNotHasKey('endDate', $graph);
        $this->assertArrayNotHasKey('performer', $graph);
        $this->assertStringNotContainsString('meet.example.com', (string) json_encode($graph));

        // The editor's refinement, where it is one an event may be.
        $online->seo()->create(['schema_type' => 'BusinessEvent']);
        $this->assertSame('BusinessEvent', StructuredData::event($online->load('seo'))['@type']);
        $online->seo()->update(['schema_type' => 'Article']);
        $this->assertSame('Event', StructuredData::event($online->load('seo'))['@type']);
    }

    // ------------------------------------------- where else an event appears

    public function test_the_page_builders_cards_draw_what_is_coming_soonest_first(): void
    {
        $this->event();
        $this->event(['title' => 'Sooner, online', 'slug' => 'sooner', 'format' => 'online', 'starts_at' => '2026-10-20 11:00:00', 'ends_at' => null]);
        $this->event(['title' => 'Past', 'slug' => 'past', 'starts_at' => '2026-09-10 15:00:00', 'ends_at' => null]);
        $this->event(['title' => 'Draft', 'slug' => 'draft', 'status' => PublishStatus::Draft]);

        $editor = $this->staff();
        $sources = $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.card_sources');
        $this->assertContains('events', array_column($sources, 'value'));

        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'What is on', 'template' => 'builder', 'status' => 'published',
            'blocks' => [['id' => (string) Str::uuid(), 'type' => 'cards', 'hidden' => false, 'background' => null, 'data' => ['heading' => 'Coming up', 'source' => 'events']]],
        ])->assertCreated();

        $items = $this->getJson('/api/v1/pages/what-is-on')->assertOk()
            ->assertJsonPath('data.sections.0.data.index_path', '/events')
            ->json('data.sections.0.data.items');

        $this->assertSame(['/events/sooner', '/events/wifi-7-working-session'], array_column($items, 'path'));
        $this->assertSame('Tuesday 20 October 2026', $items[0]['kicker']);
        $this->assertSame('Online', $items[0]['meta']);
        $this->assertSame('Thursday 12 November 2026', $items[1]['kicker']);
        $this->assertSame('Technoware Experience Centre, Mumbai', $items[1]['meta']);
    }

    public function test_search_the_palette_the_assistant_and_the_seo_overview_find_an_event(): void
    {
        $event = $this->event();
        $this->event(['title' => 'Wi-Fi seminar, not published', 'slug' => 'unpublished', 'status' => PublishStatus::Draft]);

        // Site search: published only, with the date as the kicker.
        $groups = collect($this->getJson('/api/v1/search?q=wi-fi')->assertOk()->json('data.groups'));
        $group = $groups->firstWhere('type', 'event');
        $this->assertSame('Events', $group['label']);
        $this->assertSame(1, $group['total']);
        $this->assertSame('/events/wifi-7-working-session', $group['results'][0]['path']);
        $this->assertSame('Thursday 12 November 2026', $group['results'][0]['kicker']);

        // The console's palette: drafts too, for a role that may open them.
        $palette = collect($this->actingAs($this->staff(), 'sanctum')->getJson('/api/v1/admin/search?q=wi-fi')->assertOk()->json('data'));
        $found = $palette->firstWhere('type', 'event');
        $this->assertCount(2, $found['items']);
        $this->assertContains("/admin/events/{$event->id}", array_column($found['items'], 'admin_path'));
        $this->app['auth']->forgetGuards();
        $sales = collect($this->actingAs($this->staff(RoleEnum::SalesManager), 'sanctum')->getJson('/api/v1/admin/search?q=wi-fi')->assertOk()->json('data'));
        $this->assertNull($sales->firstWhere('type', 'event'));

        // The assistant: what is coming, with its date — and never the join link.
        $sources = collect(Retriever::for('Is there a working session about the office Wi-Fi?'));
        $source = $sources->firstWhere('type', 'event');
        $this->assertSame('/events/wifi-7-working-session', $source['url']);
        $this->assertStringContainsString('Thursday 12 November 2026', $source['excerpt']);
        $this->assertStringNotContainsString('meet.example.com', (string) json_encode($sources->all()));
        $this->assertCount(1, $sources->where('type', 'event'));

        // The SEO overview: a row per event, addressed at the console's own route.
        $this->app['auth']->forgetGuards();
        $rows = collect($this->actingAs($this->staff(RoleEnum::SeoManager), 'sanctum')->getJson('/api/v1/admin/seo?type=event')->assertOk()->json('data'));
        $row = $rows->firstWhere('id', $event->id);
        $this->assertSame('event', $row['type']);
        $this->assertSame("/admin/events/{$event->id}", $row['admin_path']);
        $this->assertSame('/events/wifi-7-working-session', $row['public_path']);
    }

    public function test_menus_site_sections_and_faq_owners_know_an_event(): void
    {
        $editor = $this->staff();

        // The section is dropped until an event is published.
        $menu = Menu::create(['name' => 'Footer', 'location' => 'footer']);
        MenuItem::create(['menu_id' => $menu->id, 'sort_order' => 0, 'label' => 'Events', 'type' => 'section', 'target_key' => 'events', 'is_active' => true]);
        $hrefs = function () {
            Cache::flush();
            SiteSection::forgetContent();

            return array_column($this->getJson('/api/v1/menus/footer')->assertOk()->json('data'), 'href');
        };

        $this->assertSame([], $hrefs());
        $event = $this->event(['status' => PublishStatus::Draft]);
        $this->assertSame([], $hrefs(), 'A draft event is not content.');

        // An item pointing at the event itself follows the same rule.
        MenuItem::create([
            'menu_id' => $menu->id, 'sort_order' => 1, 'label' => 'Wi-Fi 7 session', 'type' => MenuItemType::Event->value,
            'target_type' => 'event', 'target_id' => $event->id, 'is_active' => true,
        ]);
        $this->assertSame([], $hrefs());

        $event->update(['status' => PublishStatus::Published]);
        $this->assertSame(['/events', '/events/wifi-7-working-session'], $hrefs());

        // The picker offers it, with where it will go.
        $targets = $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/menu-targets?type=event&q=wi-fi')->assertOk()->json('data');
        $this->assertSame([['id' => $event->id, 'label' => 'Wi-Fi 7 for the office: a working session', 'url' => '/events/wifi-7-working-session']], $targets);
        $meta = $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/menus')->assertOk()->json('meta');
        $this->assertContains('event', array_column($meta['types'], 'value'));
        $this->assertContains('events', array_column($meta['sections'], 'value'));

        // And an FAQ may be filed under it from the FAQ screen.
        $owners = collect($this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/faq-owners')->assertOk()->json('data'));
        $this->assertSame([['id' => $event->id, 'name' => $event->title]], $owners->firstWhere('type', 'event')['options']);
        $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/faqs', [
            'question' => 'Is there parking?', 'answer' => '<p>Yes.</p>', 'owner_type' => 'event', 'owner_id' => $event->id,
        ])->assertCreated()->assertJsonPath('data.owner_name', $event->title);
        $this->assertSame(1, $event->faqs()->count());
    }
}
