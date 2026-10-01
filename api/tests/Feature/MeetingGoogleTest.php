<?php

namespace Tests\Feature;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingStatus;
use App\Enums\Role as RoleEnum;
use App\Events\MeetingSynced;
use App\Models\Meeting;
use App\Models\MeetingType;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Meetings\GoogleCalendar;
use App\Support\Meetings\MeetingCalendar;
use App\Support\OAuth\OAuthConnection;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The company's Google calendar (docs/meetings.md, "Google Calendar"),
 * against a pretend Google: an in-memory events store behind `Http::fake`,
 * with a script of one-off answers a test can put in front of it.
 *
 * What it pins: the event carries our id, the host and the customer and
 * nothing the customer typed but their name; a 409 on insert is the earlier
 * attempt's event; a move PATCHes the whole attendee list and never the
 * conference; a cancel DELETEs and a 404 is done; a failure is written in
 * Google's words and the sweeper finishes the job; a pending Meet link is
 * filled in later; an unreadable calendar is unknown, never busy; an event
 * under another account is left alone; and the consent round trip.
 */
class MeetingGoogleTest extends TestCase
{
    use RefreshDatabase;

    private const MEET = 'https://meet.google.com/abc-defg-hij';

    /** @var array<string, array<string, mixed>> */
    private array $events = [];

    /** @var list<array{0: string, 1: string, 2: mixed}> */
    private array $script = [];

    private MeetingType $type;

    private User $host;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);

        Carbon::setTestNow(Carbon::parse('2026-10-01 10:00', 'Asia/Kolkata'));

        Setting::put('company_name', 'Acme Networks');
        Setting::put('meetings_google_oauth_client_id', 'client-id');
        Setting::put('meetings_google_oauth_client_secret', 'client-secret');
        Setting::put('meetings_google_oauth_refresh_token', 'refresh');
        Setting::put('meetings_google_oauth_account', 'meetings@acme.example');
        Setting::put('meetings_google_calendar_id', 'meetings@acme.example');

        $this->type = MeetingType::create(['name' => 'Discovery call', 'slug' => 'discovery', 'minutes' => 30]);
        $this->host = $this->staff('Hana Host', 'hana@acme.example');

        Event::fake([MeetingSynced::class]);
        $this->fakeGoogle();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    /* ------------------------------------------------------------ insert */

    public function test_an_event_is_made_under_our_id_with_both_attendees_and_nothing_the_customer_typed(): void
    {
        $meeting = $this->meeting();

        $this->calendar()->sync($meeting);

        $insert = $this->sent('POST', '/events');
        $this->assertCount(1, $insert);
        $request = $insert[0];

        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
        $this->assertSame('1', $query['conferenceDataVersion']);
        $this->assertSame('all', $query['sendUpdates']);

        $data = $request->data();
        $this->assertSame(GoogleCalendar::eventIdFor($meeting), $data['id']);
        $this->assertMatchesRegularExpression('/^[0-9a-v]{5,1024}$/', $data['id']);
        $this->assertSame(['hana@acme.example', 'neil@customer.test'], array_column($data['attendees'], 'email'));
        $this->assertFalse($data['guestsCanInviteOthers']);
        $this->assertArrayNotHasKey('reminders', $data);
        $this->assertSame('Discovery call — Acme Networks', $data['summary']);
        $this->assertStringContainsString($meeting->publicUrl(), $data['description']);
        $this->assertSame('hangoutsMeet', $data['conferenceData']['createRequest']['conferenceSolutionKey']['type']);
        $this->assertSame('2026-10-06T15:00:00+05:30', $data['start']['dateTime']);

        $body = json_encode($data);
        $this->assertStringNotContainsString('hunter2', $body);
        $this->assertStringNotContainsString($meeting->access_token, $body);
        $this->assertStringNotContainsString('/open?token', $body);

        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertSame(self::MEET, $meeting->meet_url);
        $this->assertSame($data['id'], $meeting->google_event_id);
        $this->assertSame('meetings@acme.example', $meeting->google_account);
        $this->assertSame('meetings@acme.example', $meeting->google_calendar_id);
        $this->assertSame(0, $meeting->google_attempts);
        $this->assertNull($meeting->google_error);

        Event::assertDispatched(MeetingSynced::class, fn (MeetingSynced $e) => $e->meeting->is($meeting)
            && $e->before === MeetingGoogleStatus::Pending
            && $e->previousMeetUrl === null);
    }

    public function test_a_409_on_insert_is_the_earlier_attempts_event(): void
    {
        $meeting = $this->meeting();
        // An insert that timed out on our side and landed on Google's.
        $this->events[GoogleCalendar::eventIdFor($meeting)] = $this->storedEvent(GoogleCalendar::eventIdFor($meeting), $meeting);

        $this->calendar()->sync($meeting);

        $this->assertCount(1, $this->sent('POST', '/events'));
        $this->assertCount(1, $this->events);
        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertSame(self::MEET, $meeting->meet_url);
        $this->assertCount(0, $this->sent('PATCH', '/events/'), 'The earlier event already matched; nobody is mailed again.');
    }

    /* -------------------------------------------------------------- move */

    public function test_a_move_patches_the_time_and_the_whole_attendee_list_and_never_the_conference(): void
    {
        $meeting = $this->meeting();
        $this->calendar()->sync($meeting);

        // A re-run with nothing changed sends nothing.
        $this->calendar()->sync($meeting->fresh());
        $this->assertCount(0, $this->sent('PATCH', '/events/'));

        $other = $this->staff('Omar Other', 'omar@acme.example');
        $meeting->refresh()->forceFill([
            'starts_at' => Carbon::parse('2026-10-07 11:00', 'Asia/Kolkata'),
            'ends_at' => Carbon::parse('2026-10-07 11:30', 'Asia/Kolkata'),
            'host_id' => $other->id,
            'host_name' => $other->name,
            'google_status' => MeetingGoogleStatus::Pending,
        ])->save();

        $this->calendar()->sync($meeting->fresh());

        $patches = $this->sent('PATCH', '/events/');
        $this->assertCount(1, $patches);
        $this->assertStringContainsString('sendUpdates=all', $patches[0]->url());
        $data = $patches[0]->data();
        $this->assertSame(['omar@acme.example', 'neil@customer.test'], array_column($data['attendees'], 'email'));
        $this->assertSame('2026-10-07T11:00:00+05:30', $data['start']['dateTime']);
        $this->assertArrayNotHasKey('conferenceData', $data);
        $this->assertStringNotContainsString('conferenceDataVersion', $patches[0]->url());

        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertSame(self::MEET, $meeting->meet_url, 'The Meet link survives a move.');
    }

    /* ------------------------------------------------------------ cancel */

    public function test_a_cancel_deletes_the_event_and_a_404_counts_as_done(): void
    {
        $meeting = $this->meeting();
        $this->calendar()->sync($meeting);

        $meeting->refresh()->forceFill(['status' => MeetingStatus::Cancelled, 'google_status' => MeetingGoogleStatus::Pending])->save();
        $this->calendar()->sync($meeting->fresh());

        $deletes = $this->sent('DELETE', '/events/');
        $this->assertCount(1, $deletes);
        $this->assertStringContainsString('sendUpdates=all', $deletes[0]->url());
        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertNull($meeting->meet_url);

        // Somebody already deleted it in Google: a 404 is the same outcome.
        $gone = $this->meeting(['email' => 'gone@customer.test']);
        $this->calendar()->sync($gone);
        $this->script('DELETE', '/events/', Http::response(['error' => ['message' => 'Not Found']], 404));
        $gone->refresh()->forceFill(['status' => MeetingStatus::Cancelled, 'google_status' => MeetingGoogleStatus::Pending])->save();

        $this->calendar()->sync($gone->fresh());

        $this->assertSame(MeetingGoogleStatus::Synced, $gone->fresh()->google_status);
        $this->assertNull($gone->fresh()->google_error);
    }

    /* ------------------------------------------------ failure and sweeper */

    public function test_a_500_leaves_the_meeting_failed_in_googles_words_and_the_sweeper_finishes_it(): void
    {
        $meeting = $this->meeting();
        $this->script('POST', '/events', Http::response(['error' => ['code' => 500, 'message' => 'Backend Error']], 500));

        $this->calendar()->sync($meeting);

        $meeting->refresh();
        $this->assertSame(MeetingStatus::Scheduled, $meeting->status, 'A Google failure never undoes a booking.');
        $this->assertSame(MeetingGoogleStatus::Failed, $meeting->google_status);
        $this->assertSame('Backend Error (HTTP 500)', $meeting->google_error);
        $this->assertNull($meeting->meet_url);

        $this->artisan('technoware:sync-meetings')->assertSuccessful();

        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertSame(self::MEET, $meeting->meet_url);
        $this->assertSame(0, $meeting->google_attempts);
        $this->assertNull($meeting->google_error);
        Event::assertDispatched(MeetingSynced::class, fn (MeetingSynced $e) => $e->before === MeetingGoogleStatus::Failed);
    }

    public function test_the_sweeper_stops_at_the_retry_cap(): void
    {
        $meeting = $this->meeting();
        $meeting->forceFill(['google_status' => MeetingGoogleStatus::Failed, 'google_attempts' => GoogleCalendar::MAX_ATTEMPTS])->save();

        $this->artisan('technoware:sync-meetings')->assertSuccessful();

        $this->assertCount(0, $this->sent('POST', '/events'));
        $this->assertSame(MeetingGoogleStatus::Failed, $meeting->fresh()->google_status);
    }

    public function test_a_rate_limit_backs_every_sync_off(): void
    {
        $meeting = $this->meeting();
        $this->script('POST', '/events', Http::response(['error' => [
            'code' => 403, 'message' => 'Rate Limit Exceeded', 'errors' => [['reason' => 'rateLimitExceeded']],
        ]], 403));

        $this->calendar()->sync($meeting);

        $this->assertSame(MeetingGoogleStatus::Failed, $meeting->fresh()->google_status);
        $this->assertStringContainsString('Rate Limit Exceeded (HTTP 403)', (string) $meeting->fresh()->google_error);
        $this->assertSame(Carbon::now()->timestamp + 30, GoogleCalendar::backedOffUntil());

        // The sweeper waits it out rather than hitting Google again.
        $this->artisan('technoware:sync-meetings')->assertSuccessful();
        $this->assertCount(1, $this->sent('POST', '/events'));

        Carbon::setTestNow(Carbon::now()->addSeconds(31));
        $this->artisan('technoware:sync-meetings')->assertSuccessful();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->fresh()->google_status);
        $this->assertNull(GoogleCalendar::backedOffUntil());
    }

    /* ---------------------------------------------------------- Meet link */

    public function test_the_link_is_read_from_the_video_entry_point_and_a_pending_one_is_filled_in_by_the_sweeper(): void
    {
        $this->assertSame('https://meet.google.com/x', GoogleCalendar::meetLink(['conferenceData' => ['entryPoints' => [
            ['entryPointType' => 'phone', 'uri' => 'tel:+1-555'],
            ['entryPointType' => 'video', 'uri' => 'https://meet.google.com/x'],
        ]], 'hangoutLink' => 'https://meet.google.com/old']));
        $this->assertSame('https://meet.google.com/old', GoogleCalendar::meetLink(['hangoutLink' => 'https://meet.google.com/old']));

        $meeting = $this->meeting();
        $id = GoogleCalendar::eventIdFor($meeting);
        $pending = $this->storedEvent($id, $meeting, link: false);
        $this->script('POST', '/events', Http::response($pending));

        $this->calendar()->sync($meeting);

        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->google_status);
        $this->assertNull($meeting->meet_url);
        $this->assertSame($id, $meeting->google_event_id);

        // Google finishes the conference; the sweeper reads it.
        $this->events[$id] = $this->storedEvent($id, $meeting);
        $this->artisan('technoware:sync-meetings')->assertSuccessful();

        $meeting->refresh();
        $this->assertSame(self::MEET, $meeting->meet_url);
        $this->assertSame(0, $meeting->google_attempts);
        Event::assertDispatched(MeetingSynced::class, fn (MeetingSynced $e) => $e->previousMeetUrl === null && $e->meeting->meet_url === self::MEET);
    }

    /* -------------------------------------------------- another account */

    public function test_an_event_made_under_another_account_is_left_alone_and_the_meeting_marked_off(): void
    {
        $meeting = $this->meeting();
        $meeting->forceFill([
            'google_event_id' => 'abc123',
            'google_account' => 'old@acme.example',
            'google_calendar_id' => 'old@acme.example',
            'google_status' => MeetingGoogleStatus::Pending,
        ])->save();

        $this->calendar()->sync($meeting);

        $meeting->refresh();
        $this->assertSame(MeetingGoogleStatus::Off, $meeting->google_status);
        $this->assertStringContainsString('old@acme.example', (string) $meeting->google_error);
        $this->assertCount(0, $this->sent('POST', '/events'));
        $this->assertCount(0, $this->sent('PATCH', '/events/'));
    }

    public function test_with_nothing_connected_a_sync_marks_the_meeting_off(): void
    {
        Setting::put('meetings_google_oauth_refresh_token', null);
        $meeting = $this->meeting();

        $this->assertFalse($this->calendar()->connected());
        $this->calendar()->sync($meeting);

        $this->assertSame(MeetingGoogleStatus::Off, $meeting->fresh()->google_status);
        Http::assertNothingSent();
        Event::assertDispatched(MeetingSynced::class, fn (MeetingSynced $e) => $e->before === MeetingGoogleStatus::Pending);
    }

    /* ----------------------------------------------------------- busy */

    public function test_busy_is_one_call_converted_to_the_apps_zone_and_an_unreadable_calendar_is_unknown(): void
    {
        $this->script('POST', '/freeBusy', Http::response(['calendars' => [
            'hana@acme.example' => ['busy' => [['start' => '2026-10-06T04:30:00Z', 'end' => '2026-10-06T05:30:00Z']]],
            'shared-not@elsewhere.example' => ['errors' => [['domain' => 'global', 'reason' => 'notFound']], 'busy' => []],
        ]]));

        $from = Carbon::parse('2026-10-06 00:00', 'Asia/Kolkata');
        $to = Carbon::parse('2026-10-08 00:00', 'Asia/Kolkata');

        $busy = $this->calendar()->busy(['hana@acme.example', 'shared-not@elsewhere.example'], $from, $to);

        $this->assertNull($busy['shared-not@elsewhere.example']);
        $this->assertCount(1, $busy['hana@acme.example']);
        [$start, $end] = $busy['hana@acme.example'][0];
        $this->assertSame('2026-10-06 10:00', $start->format('Y-m-d H:i'));
        $this->assertSame('Asia/Kolkata', $start->getTimezone()->getName());
        $this->assertSame('2026-10-06 11:00', $end->format('Y-m-d H:i'));

        $calls = $this->sent('POST', '/freeBusy');
        $this->assertCount(1, $calls);
        $this->assertSame(['hana@acme.example', 'shared-not@elsewhere.example'], array_column($calls[0]->data()['items'], 'id'));

        // Held for five minutes: the next visitor costs nothing.
        $this->calendar()->busy(['hana@acme.example', 'shared-not@elsewhere.example'], $from, $to);
        $this->assertCount(1, $this->sent('POST', '/freeBusy'));
    }

    public function test_busy_is_unknown_for_everybody_when_the_call_fails(): void
    {
        $this->script('POST', '/freeBusy', Http::response(['error' => ['message' => 'Backend Error']], 500));

        $busy = $this->calendar()->busy(['hana@acme.example'], Carbon::now(), Carbon::now()->addDay());

        $this->assertSame(['hana@acme.example' => null], $busy);
    }

    /* ---------------------------------------------------- the connection */

    public function test_the_scope_reaches_other_peoples_free_busy(): void
    {
        $scope = OAuthConnection::meetingsCalendar()->scope;

        $this->assertStringContainsString('https://www.googleapis.com/auth/calendar.events ', $scope);
        $this->assertStringContainsString('https://www.googleapis.com/auth/calendar.events.freebusy', $scope);
        $this->assertStringNotContainsString('auth/calendar.freebusy', $scope);
    }

    public function test_authorize_accepts_only_this_sites_callback(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/authorize', ['redirect_uri' => 'https://attacker.example/admin/meetings/google/callback'])
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/authorize', ['redirect_uri' => 'http://localhost:3000/admin/backups/drive/callback'])
            ->assertStatus(422);

        $url = $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/authorize', ['redirect_uri' => 'http://localhost:3000/admin/meetings/google/callback'])
            ->assertOk()
            ->json('data.url');

        $this->assertStringStartsWith('https://accounts.google.com/', $url);
        $this->assertStringContainsString(urlencode('https://www.googleapis.com/auth/calendar.events.freebusy'), $url);
    }

    public function test_the_callback_connects_the_account_and_fills_a_blank_calendar_id(): void
    {
        Setting::put('meetings_google_oauth_refresh_token', null);
        Setting::put('meetings_google_oauth_account', null);
        Setting::put('meetings_google_calendar_id', null);

        $state = OAuthConnection::meetingsCalendar()->authorizeUrl('http://localhost:3000/admin/meetings/google/callback')['state'];
        $claims = rtrim(strtr(base64_encode((string) json_encode(['email' => 'meetings@acme.example'])), '+/', '-_'), '=');
        $this->script('POST', 'oauth2.googleapis.com/token', Http::response([
            'access_token' => 'access', 'refresh_token' => 'new-refresh', 'expires_in' => 3600, 'id_token' => "h.{$claims}.s",
        ]));

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/callback', ['code' => 'the-code', 'state' => $state])
            ->assertOk()
            ->assertJsonPath('data.account', 'meetings@acme.example');

        $this->assertSame('new-refresh', Setting::get('meetings_google_oauth_refresh_token'));
        $this->assertSame('meetings@acme.example', Setting::get('meetings_google_calendar_id'));
        $this->assertNull(Setting::get('backup_gdrive_oauth_refresh_token'), 'Its own slot, nobody else\'s.');

        // A state spent once cannot be spent again.
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/callback', ['code' => 'the-code', 'state' => $state])
            ->assertStatus(422);

        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/meetings/google')
            ->assertOk()
            ->assertJsonPath('data.is_connected', true)
            ->assertJsonPath('data.account', 'meetings@acme.example')
            ->assertJsonPath('data.calendar_id', 'meetings@acme.example')
            ->assertJsonPath('data.client_configured', true)
            ->assertJsonPath('data.callback_path', '/admin/meetings/google/callback')
            ->assertJsonPath('data.synced_future_count', 0);
    }

    public function test_disconnecting_reports_what_it_strands_and_forgets_the_token(): void
    {
        $this->calendar()->sync($this->meeting());

        $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/meetings/google')
            ->assertJsonPath('data.synced_future_count', 1);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/disconnect')
            ->assertOk()
            ->assertJsonPath('data.is_connected', false)
            ->assertJsonPath('data.synced_future_count', 1);

        $this->assertNull(Setting::get('meetings_google_oauth_refresh_token'));
        $this->assertFalse($this->calendar()->connected());
    }

    public function test_the_test_button_reads_free_busy_and_writes_a_refusal_where_the_panel_shows_it(): void
    {
        $this->script('POST', '/freeBusy', Http::response(['error' => ['code' => 403, 'message' => 'Request had insufficient authentication scopes.']], 403));

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Request had insufficient authentication scopes. (HTTP 403)');
        $this->assertStringContainsString('insufficient authentication scopes', (string) Setting::get('meetings_google_error'));

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/meetings/google/test')
            ->assertOk()
            ->assertJsonPath('data.account', 'meetings@acme.example')
            ->assertJsonPath('data.calendar', 'meetings@acme.example');
        $this->assertNull(Setting::get('meetings_google_error'));
    }

    public function test_the_google_panel_is_for_administrators_only(): void
    {
        $sales = $this->staff('Sam Sales', 'sam@acme.example', RoleEnum::SalesManager);

        $this->actingAs($sales, 'sanctum')->getJson('/api/v1/admin/meetings/google')->assertForbidden();
    }

    /* ------------------------------------------------ a host's new email */

    public function test_a_hosts_new_email_sends_their_future_meetings_back_to_google(): void
    {
        $meeting = $this->meeting();
        $this->calendar()->sync($meeting);
        $past = $this->meeting([
            'starts_at' => Carbon::parse('2026-09-20 15:00', 'Asia/Kolkata'),
            'ends_at' => Carbon::parse('2026-09-20 15:30', 'Asia/Kolkata'),
            'google_status' => MeetingGoogleStatus::Synced,
        ]);

        $this->host->update(['email' => 'hana.new@acme.example']);

        $this->assertSame(MeetingGoogleStatus::Pending, $meeting->fresh()->google_status);
        $this->assertSame(MeetingGoogleStatus::Synced, $past->fresh()->google_status);

        $this->artisan('technoware:sync-meetings')->assertSuccessful();

        $patch = $this->sent('PATCH', '/events/');
        $this->assertCount(1, $patch);
        $this->assertSame(['hana.new@acme.example', 'neil@customer.test'], array_column($patch[0]->data()['attendees'], 'email'));
        $this->assertSame(MeetingGoogleStatus::Synced, $meeting->fresh()->google_status);
    }

    /* =========================================================== helpers */

    private function calendar(): GoogleCalendar
    {
        $calendar = $this->app->make(MeetingCalendar::class);
        $this->assertInstanceOf(GoogleCalendar::class, $calendar);

        return $calendar;
    }

    /** @param  array<string, mixed>  $attrs */
    private function meeting(array $attrs = []): Meeting
    {
        return Meeting::create($attrs + [
            'meeting_type_id' => $this->type->id,
            'host_id' => $this->host->id,
            'host_name' => $this->host->name,
            'name' => 'Neil Basu',
            'email' => 'neil@customer.test',
            'phone' => '9876543210',
            'company' => 'Meridian Foods',
            'agenda' => 'Our firewall password is hunter2',
            'starts_at' => Carbon::parse('2026-10-06 15:00', 'Asia/Kolkata'),
            'ends_at' => Carbon::parse('2026-10-06 15:30', 'Asia/Kolkata'),
        ]);
    }

    private function staff(string $name, string $email, RoleEnum $role = RoleEnum::MeetingHost): User
    {
        $user = User::create(['name' => $name, 'email' => $email, 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function admin(): User
    {
        return User::query()->where('email', 'ada@acme.example')->first()
            ?? $this->staff('Ada Admin', 'ada@acme.example', RoleEnum::Admin);
    }

    private function script(string $method, string $needle, mixed $response): void
    {
        $this->script[] = [$method, $needle, $response];
    }

    /** @return list<Request> */
    private function sent(string $method, string $needle): array
    {
        return array_values(array_map(
            fn (array $pair) => $pair[0],
            Http::recorded(fn (Request $r) => $r->method() === $method && str_contains((string) parse_url($r->url(), PHP_URL_PATH), $needle)
                && ! str_contains($r->url(), 'oauth2.googleapis.com'))->all(),
        ));
    }

    /** @return array<string, mixed> */
    private function storedEvent(string $id, Meeting $meeting, bool $link = true): array
    {
        return [
            'id' => $id,
            'status' => 'confirmed',
            'start' => ['dateTime' => $meeting->starts_at->toRfc3339String()],
            'end' => ['dateTime' => $meeting->ends_at->toRfc3339String()],
            'attendees' => [
                ['email' => $meeting->host?->email, 'responseStatus' => 'needsAction'],
                ['email' => $meeting->email, 'responseStatus' => 'needsAction'],
            ],
            'conferenceData' => $link
                ? ['createRequest' => ['status' => ['statusCode' => 'success']], 'entryPoints' => [['entryPointType' => 'video', 'uri' => self::MEET]]]
                : ['createRequest' => ['status' => ['statusCode' => 'pending']]],
        ];
    }

    /**
     * A pretend Google: the scripted answers first, in order, then an
     * events store that inserts (409 on a used id), reads, patches and
     * deletes like the real one.
     */
    private function fakeGoogle(): void
    {
        Http::fake(function (Request $request) {
            $url = $request->url();
            $method = $request->method();

            foreach ($this->script as $i => [$m, $needle, $response]) {
                if ($m === $method && str_contains($url, $needle)) {
                    unset($this->script[$i]);

                    return $response;
                }
            }

            if (str_contains($url, 'oauth2.googleapis.com/token')) {
                return Http::response(['access_token' => 'ya29.test', 'expires_in' => 3600]);
            }

            $path = (string) parse_url($url, PHP_URL_PATH);

            if (str_ends_with($path, '/freeBusy')) {
                return Http::response(['calendars' => []]);
            }

            if (str_ends_with($path, '/events') && $method === 'POST') {
                $data = $request->data();

                if (isset($this->events[$data['id']])) {
                    return Http::response(['error' => ['code' => 409, 'message' => 'The requested identifier already exists.']], 409);
                }

                $event = $data + ['status' => 'confirmed'];
                unset($event['conferenceData']);
                $event['conferenceData'] = ['createRequest' => ['status' => ['statusCode' => 'success']], 'entryPoints' => [['entryPointType' => 'video', 'uri' => self::MEET]]];

                return Http::response($this->events[$data['id']] = $event);
            }

            if (preg_match('#/events/([^/]+)$#', $path, $m)) {
                $id = rawurldecode($m[1]);
                $event = $this->events[$id] ?? null;

                if ($event === null) {
                    return Http::response(['error' => ['code' => 404, 'message' => 'Not Found']], 404);
                }

                return match ($method) {
                    'GET' => Http::response($event),
                    'PATCH' => Http::response($this->events[$id] = array_merge($event, $request->data())),
                    'DELETE' => $event['status'] === 'cancelled'
                        ? Http::response(['error' => ['code' => 410, 'message' => 'Resource has been deleted']], 410)
                        : (function () use ($id) {
                            $this->events[$id]['status'] = 'cancelled';

                            return Http::response('', 204);
                        })(),
                    default => Http::response([], 405),
                };
            }

            return Http::response(['error' => ['message' => "Unexpected {$method} {$url}"]], 599);
        });
    }
}
