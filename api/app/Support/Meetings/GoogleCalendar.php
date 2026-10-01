<?php

namespace App\Support\Meetings;

use App\Enums\MeetingGoogleStatus;
use App\Enums\MeetingStatus;
use App\Events\MeetingSynced;
use App\Models\Meeting;
use App\Models\Setting;
use App\Support\Mail\MailBrand;
use App\Support\OAuth\OAuthConnection;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * The company's Google Workspace calendar (docs/meetings.md, "Google
 * Calendar"): every meeting is an event on it, organised by the connected
 * account (e.g. meetings@), with the host and the customer invited and a
 * Meet link on it.
 *
 * Always bound; `connected()` reads the OAuth slot, and a sync with nothing
 * connected marks the meeting `off` — `NullMeetingCalendar`'s answer — so
 * the `.ics` path takes over.
 *
 * The rules, each of which exists because the obvious version is wrong:
 *
 * - **We choose the event id** (`eventIdFor()`, sha1 of the app key, the
 *   reference and `google_event_seq` — lowercase hex is inside Google's
 *   base32hex alphabet). An insert that timed out and is retried answers 409
 *   rather than making a second event, and a 409 is read as success and
 *   followed by a GET.
 * - **A move is a PATCH of the time and the whole attendee list**, never the
 *   conference: the Meet link stays the one the customer already has. It is
 *   sent only when Google's copy differs, so a re-run never mails everybody
 *   an "updated invitation" about nothing.
 * - **Nothing the customer typed goes into the event** but their name and
 *   address. Google mails the event, from the company's domain, to whatever
 *   address was typed into a public form: the agenda and the manage-token URL
 *   stay in our own email. No `reminders.overrides` either — they reach only
 *   the organiser.
 * - **An event made under another account or calendar is left alone** and
 *   the meeting marked `off`: the connected account cannot change it, and
 *   inventing a second event would invite everybody twice.
 * - **Google's own words go to `google_error`.** A 429, or a 403 whose
 *   reason is a rate or quota limit, backs every sync off for 30s, then
 *   2 minutes, then 10 (`BACKOFF`); the sweeper waits it out.
 * - **It never throws.** A Google failure never fails or undoes a booking.
 */
final class GoogleCalendar implements MeetingCalendar
{
    public const API = 'https://www.googleapis.com/calendar/v3';

    /**
     * The sweeper's retry cap: after this many claimed attempts (on top of
     * the booking's own first try) a failure is final. One number, shared
     * with the confirmation listener through `MeetingSync`.
     */
    public const MAX_ATTEMPTS = MeetingSync::MAX_ATTEMPTS;

    /** Seconds to wait after a rate limit — the first, the second, and every one after. */
    public const BACKOFF = [30, 120, 600];

    public const BACKOFF_KEY = 'meetings-google:backoff';

    /** How long one day's free/busy answer is believed. */
    public const BUSY_TTL = 300;

    /** Seconds a free/busy read may take: it sits on the booking page's request. */
    public const BUSY_TIMEOUT = 4;

    /** Google's reasons for a 403 that means "slow down" rather than "no". */
    private const RATE_REASONS = ['rateLimitExceeded', 'userRateLimitExceeded', 'quotaExceeded'];

    private ?int $timeout = null;

    /**
     * Seconds a request may take: 10 in a queued job or the sweeper, 4 when
     * the sync runs inline inside somebody's request. Detected from the
     * process unless set.
     */
    public function timeout(int $seconds): self
    {
        $this->timeout = $seconds;

        return $this;
    }

    public function connected(): bool
    {
        return OAuthConnection::meetingsCalendar()->isConnected();
    }

    /** The connected account's address, as the consent named it. */
    public function account(): ?string
    {
        $account = trim((string) Setting::get('meetings_google_oauth_account'));

        return $account !== '' ? $account : null;
    }

    /** The calendar events are written to — blank means the account's primary. */
    public function calendarId(): string
    {
        $id = trim((string) Setting::get('meetings_google_calendar_id'));

        return $id !== '' ? $id : 'primary';
    }

    /**
     * Our id for the meeting's event: stable across retries, new after
     * `google_event_seq` is bumped (an event somebody deleted in Google).
     */
    public static function eventIdFor(Meeting $meeting): string
    {
        return sha1(config('app.key').'|'.$meeting->reference.'|'.(int) $meeting->google_event_seq);
    }

    /**
     * Until when every sync is held back after a rate limit, as a timestamp, or null.
     *
     * @phpstan-impure
     */
    public static function backedOffUntil(): ?int
    {
        $backoff = Cache::get(self::BACKOFF_KEY);

        return is_array($backoff) && (int) ($backoff['until'] ?? 0) > now()->timestamp ? (int) $backoff['until'] : null;
    }

    public function sync(Meeting $meeting): void
    {
        $meeting->loadMissing(['meetingType', 'host']);

        $before = $meeting->google_status;
        $previousUrl = $meeting->meet_url;

        try {
            $this->reconcile($meeting);
        } catch (ConnectionException $e) {
            $this->failed($meeting, 'Google Calendar did not answer in time ('.$this->seconds().'s): '.$e->getMessage());
        } catch (Throwable $e) {
            // A refused token refresh lands here, in Google's words — the
            // slot has already written them to meetings_google_error too.
            $this->failed($meeting, $e->getMessage());
        }

        MeetingSynced::dispatch($meeting, $before, $previousUrl);
    }

    private function reconcile(Meeting $meeting): void
    {
        if (! $this->connected()) {
            $this->mark($meeting, MeetingGoogleStatus::Off, [
                'google_error' => $meeting->google_event_id !== null
                    ? 'Google Calendar is not connected, so this meeting\'s event is no longer kept in step. The customer is sent the calendar file instead.'
                    : null,
            ]);

            return;
        }

        // Over and given an outcome: the calendar has nothing more to learn.
        if (in_array($meeting->status, [MeetingStatus::Completed, MeetingStatus::NoShow], true)) {
            if (in_array($meeting->google_status, MeetingGoogleStatus::retryable(), true)) {
                $this->mark($meeting, $meeting->google_event_id !== null ? MeetingGoogleStatus::Synced : MeetingGoogleStatus::Off);
            }

            return;
        }

        if ($meeting->google_event_id !== null && ! $this->owns($meeting)) {
            $this->mark($meeting, MeetingGoogleStatus::Off, ['google_error' => sprintf(
                'This meeting\'s event was made in the calendar "%s" under %s, which is no longer the connected calendar (%s under %s). It is left as it is there, and the customer is sent the calendar file instead — tell them if the time or the host changes.',
                $meeting->google_calendar_id ?? 'primary',
                $meeting->google_account ?? 'another account',
                $this->calendarId(),
                $this->account() ?? 'the connected account',
            )]);

            return;
        }

        $until = self::backedOffUntil();

        if ($until !== null) {
            $this->failed($meeting, 'Google asked us to slow down; trying again after '
                .Carbon::createFromTimestamp($until, MeetingSettings::timezone())->format('H:i:s').'.');

            return;
        }

        if ($meeting->status === MeetingStatus::Cancelled) {
            $this->delete($meeting);

            return;
        }

        $this->upsert($meeting);
    }

    /**
     * A cancelled meeting's event goes, and Google tells the guests.
     *
     * With no stored id the computed one is deleted all the same: an insert
     * that timed out may have made the event without us hearing, and a 404
     * costs nothing. A meeting Google was never part of is left `off`.
     */
    private function delete(Meeting $meeting): void
    {
        if ($meeting->google_event_id === null && $meeting->google_status === MeetingGoogleStatus::Off) {
            return;
        }

        $id = $meeting->google_event_id ?? self::eventIdFor($meeting);
        $response = $this->http()->delete($this->eventUrl($id).'?sendUpdates=all');

        if ($response->successful() || in_array($response->status(), [404, 410], true)) {
            $this->succeeded($meeting, ['meet_url' => null, 'google_attempts' => 0]);

            return;
        }

        $this->refused($meeting, $response);
    }

    private function upsert(Meeting $meeting): void
    {
        $event = null;

        if ($meeting->google_event_id !== null) {
            $response = $this->http()->get($this->eventUrl($meeting->google_event_id));

            if ($response->successful() && ($response->json('status') ?? '') !== 'cancelled') {
                $event = (array) $response->json();
            } elseif ($response->successful() || in_array($response->status(), [404, 410], true)) {
                // Somebody deleted it in Google. A new id, because a deleted
                // event keeps its id and an insert under it answers 409.
                $meeting->google_event_seq = (int) $meeting->google_event_seq + 1;
                $meeting->google_event_id = null;
            } else {
                $this->refused($meeting, $response);

                return;
            }
        }

        if ($event === null) {
            $event = $this->insert($meeting);

            if ($event === null) {
                return;
            }
        } else {
            $event = $this->move($meeting, $event);

            if ($event === null) {
                return;
            }
        }

        $url = self::meetLink($event);
        $code = self::conferenceStatus($event);

        // No link, and nothing on its way: ask for a conference again under
        // this attempt's request id. Only on a later attempt — the same
        // request id would only be handed the same failure back.
        if ($url === null && $code !== 'pending' && (int) $meeting->google_attempts > 0) {
            $response = $this->http()->patch(
                $this->eventUrl((string) $meeting->google_event_id).'?conferenceDataVersion=1&sendUpdates=all',
                ['conferenceData' => ['createRequest' => $this->createRequest($meeting)]],
            );

            if (! $response->successful()) {
                $this->refused($meeting, $response);

                return;
            }

            $event = (array) $response->json();
            $url = self::meetLink($event);
            $code = self::conferenceStatus($event);
        }

        if ($url === null && $code !== 'pending') {
            $this->failed($meeting, 'Google made the event but could not make a Meet link for it'
                .($code !== null ? " (conference status: {$code})" : '').'. It will be asked again.');

            return;
        }

        // A link still pending leaves the meeting synced with no link: the
        // sweeper comes back for it, under the retry cap, which is why the
        // attempts are reset only once the link is there.
        $this->succeeded($meeting, [
            'meet_url' => $url,
            'google_attempts' => $url !== null ? 0 : (int) $meeting->google_attempts,
        ]);
    }

    /**
     * Make the event under our id. A 409 means an earlier attempt already
     * did — read it back; a 409 whose event turns out deleted means the id
     * was spent, so the next one is tried.
     *
     * @return array<string, mixed>|null
     */
    private function insert(Meeting $meeting): ?array
    {
        for ($try = 0; $try < 2; $try++) {
            $id = self::eventIdFor($meeting);
            $response = $this->http()->post(
                $this->eventsUrl().'?conferenceDataVersion=1&sendUpdates=all',
                $this->eventBody($meeting, $id),
            );

            if ($response->status() === 409) {
                $response = $this->http()->get($this->eventUrl($id));

                if ($response->successful() && ($response->json('status') ?? '') === 'cancelled') {
                    $meeting->google_event_seq = (int) $meeting->google_event_seq + 1;

                    continue;
                }
            }

            if (! $response->successful()) {
                $this->refused($meeting, $response);

                return null;
            }

            $this->own($meeting, $id);

            $event = (array) $response->json();

            // Read back after a 409: the event may predate a move.
            return $this->differs($meeting, $event) ? $this->move($meeting, $event) : $event;
        }

        $this->failed($meeting, 'Google refused two event ids for this meeting as already used.');

        return null;
    }

    /**
     * Bring an existing event to the meeting's time and attendees — only
     * when Google's copy differs, so a re-run is silent.
     *
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>|null
     */
    private function move(Meeting $meeting, array $event): ?array
    {
        if (! $this->differs($meeting, $event)) {
            return $event;
        }

        $response = $this->http()->patch($this->eventUrl((string) $meeting->google_event_id).'?sendUpdates=all', [
            'start' => $this->when($meeting->starts_at),
            'end' => $this->when($meeting->ends_at),
            'attendees' => $this->mergedAttendees($meeting, $event),
        ]);

        if (! $response->successful()) {
            $this->refused($meeting, $response);

            return null;
        }

        return (array) $response->json();
    }

    /** @param  array<string, mixed>  $event */
    private function differs(Meeting $meeting, array $event): bool
    {
        $start = $event['start']['dateTime'] ?? null;
        $end = $event['end']['dateTime'] ?? null;

        if (! is_string($start) || ! is_string($end)
            || Carbon::parse($start)->timestamp !== $meeting->starts_at->timestamp
            || Carbon::parse($end)->timestamp !== $meeting->ends_at->timestamp) {
            return true;
        }

        $theirs = [];

        foreach ((array) ($event['attendees'] ?? []) as $attendee) {
            if (is_array($attendee) && ! $this->bystander($attendee) && isset($attendee['email'])) {
                $theirs[] = strtolower((string) $attendee['email']);
            }
        }

        $ours = array_map(fn (array $a) => strtolower($a['email']), $this->attendees($meeting));
        sort($theirs);
        sort($ours);

        return $theirs !== $ours;
    }

    /**
     * The whole attendee list, as a PATCH must send it: each person we want
     * keeps the entry Google already holds (their reply with it), anyone not
     * wanted — a host swapped out — is dropped, and the organiser or a room
     * Google added itself is kept.
     *
     * @param  array<string, mixed>  $event
     * @return list<array<string, mixed>>
     */
    private function mergedAttendees(Meeting $meeting, array $event): array
    {
        $existing = [];
        $kept = [];

        foreach ((array) ($event['attendees'] ?? []) as $attendee) {
            if (! is_array($attendee) || ! isset($attendee['email'])) {
                continue;
            }

            if ($this->bystander($attendee)) {
                $kept[] = $attendee;
            } else {
                $existing[strtolower((string) $attendee['email'])] = $attendee;
            }
        }

        $list = [];

        foreach ($this->attendees($meeting) as $wanted) {
            $list[] = $existing[strtolower($wanted['email'])] ?? $wanted;
        }

        return [...$list, ...$kept];
    }

    /** @param  array<string, mixed>  $attendee */
    private function bystander(array $attendee): bool
    {
        return ($attendee['organizer'] ?? false) === true
            || ($attendee['self'] ?? false) === true
            || ($attendee['resource'] ?? false) === true;
    }

    /**
     * The host and the customer, nobody else.
     *
     * @return list<array{email: string, displayName: string}>
     */
    private function attendees(Meeting $meeting): array
    {
        $people = [];
        $host = $meeting->host;

        if ($host !== null && filled($host->email)) {
            $people[strtolower((string) $host->email)] = ['email' => (string) $host->email, 'displayName' => (string) ($meeting->host_name ?: $host->name)];
        }

        if (filled($meeting->email)) {
            $people[strtolower((string) $meeting->email)] ??= ['email' => (string) $meeting->email, 'displayName' => (string) $meeting->name];
        }

        return array_values($people);
    }

    /**
     * What an insert sends. Everything the customer typed stays out but
     * their name and address; see the class note.
     *
     * @return array<string, mixed>
     */
    private function eventBody(Meeting $meeting, string $id): array
    {
        return [
            'id' => $id,
            'summary' => $this->summary($meeting),
            'description' => $this->description($meeting),
            'start' => $this->when($meeting->starts_at),
            'end' => $this->when($meeting->ends_at),
            'attendees' => $this->attendees($meeting),
            'guestsCanInviteOthers' => false,
            'conferenceData' => ['createRequest' => $this->createRequest($meeting)],
        ];
    }

    public function summary(Meeting $meeting): string
    {
        return ($meeting->meetingType->name ?? 'Meeting').' — '.MailBrand::name();
    }

    /** Fixed words and the clean page's address: never the agenda, never the token. */
    public function description(Meeting $meeting): string
    {
        $company = MailBrand::name();
        $type = $meeting->meetingType->name ?? 'Meeting';

        return "{$type} with {$company}, on Google Meet — join with the link on this invitation.\n\n"
            ."To move or cancel it, use the link in the confirmation email from {$company}. The meeting's page:\n"
            .$meeting->publicUrl();
    }

    /** @return array{requestId: string, conferenceSolutionKey: array{type: string}} */
    private function createRequest(Meeting $meeting): array
    {
        return [
            'requestId' => $meeting->reference.'-'.(int) $meeting->google_attempts,
            'conferenceSolutionKey' => ['type' => 'hangoutsMeet'],
        ];
    }

    /** @return array{dateTime: string, timeZone: string} */
    private function when(CarbonInterface $at): array
    {
        $tz = MeetingSettings::timezone();

        return ['dateTime' => $at->copy()->setTimezone($tz)->toRfc3339String(), 'timeZone' => $tz];
    }

    /**
     * The Meet link on an event: the video entry point, else the older
     * `hangoutLink`, else none yet.
     *
     * @param  array<string, mixed>  $event
     */
    public static function meetLink(array $event): ?string
    {
        foreach ((array) ($event['conferenceData']['entryPoints'] ?? []) as $entry) {
            if (is_array($entry) && ($entry['entryPointType'] ?? null) === 'video' && filled($entry['uri'] ?? null)) {
                return (string) $entry['uri'];
            }
        }

        return filled($event['hangoutLink'] ?? null) ? (string) $event['hangoutLink'] : null;
    }

    /** @param  array<string, mixed>  $event */
    private static function conferenceStatus(array $event): ?string
    {
        $code = $event['conferenceData']['createRequest']['status']['statusCode'] ?? null;

        return is_string($code) ? $code : null;
    }

    /** Whether the event was made under the account and calendar connected now. */
    private function owns(Meeting $meeting): bool
    {
        $account = $this->account();

        $sameAccount = $meeting->google_account === null || $account === null
            || strcasecmp($meeting->google_account, $account) === 0;

        return $sameAccount && ($meeting->google_calendar_id ?? 'primary') === $this->calendarId();
    }

    private function own(Meeting $meeting, string $id): void
    {
        $meeting->forceFill([
            'google_event_id' => $id,
            'google_event_seq' => (int) $meeting->google_event_seq,
            'google_calendar_id' => $this->calendarId(),
            'google_account' => $this->account(),
        ])->saveQuietly();
    }

    /** @param  array<string, mixed>  $extra */
    private function succeeded(Meeting $meeting, array $extra = []): void
    {
        Cache::forget(self::BACKOFF_KEY);

        $this->mark($meeting, MeetingGoogleStatus::Synced, ['google_error' => null] + $extra);
    }

    private function refused(Meeting $meeting, Response $response): void
    {
        $status = $response->status();
        $reason = $response->json('error.errors.0.reason');
        $words = $this->describe($response);

        if ($status === 429 || ($status === 403 && in_array($reason, self::RATE_REASONS, true))) {
            $until = $this->backOff();
            $words .= ' Trying again after '.Carbon::createFromTimestamp($until, MeetingSettings::timezone())->format('H:i:s').'.';
        }

        $this->failed($meeting, $words);
    }

    private function failed(Meeting $meeting, string $message): void
    {
        $this->mark($meeting, MeetingGoogleStatus::Failed, ['google_error' => trim($message)]);
    }

    /** @param  array<string, mixed>  $extra */
    private function mark(Meeting $meeting, MeetingGoogleStatus $status, array $extra = []): void
    {
        $meeting->forceFill(['google_status' => $status] + $extra)->saveQuietly();
    }

    /** Hold every sync back, a step longer each time Google says so in a row. */
    private function backOff(): int
    {
        $previous = Cache::get(self::BACKOFF_KEY);
        $step = is_array($previous) ? min((int) ($previous['step'] ?? 0) + 1, count(self::BACKOFF) - 1) : 0;
        $until = now()->timestamp + self::BACKOFF[$step];

        // Remembered past its end so that the next limit in a row waits longer.
        Cache::put(self::BACKOFF_KEY, ['until' => $until, 'step' => $step], now()->addSeconds(self::BACKOFF[$step] + 900));

        return $until;
    }

    /** Google's own words when it gives any. */
    private function describe(Response $response): string
    {
        $message = $response->json('error.message');

        if (! is_string($message) || $message === '') {
            $message = trim(substr((string) $response->body(), 0, 300)) ?: 'Google Calendar refused the request.';
        }

        return "{$message} (HTTP {$response->status()})";
    }

    /**
     * Busy times for each address across the range (the interface's note).
     *
     * One freeBusy call for every address and every day not already held,
     * behind a lock so a burst of visitors on the booking page is one call.
     * Each day's answer is believed for five minutes. A calendar Google
     * answers with `errors` for — not shared with the organiser, outside the
     * domain — is unknown, and so is everything when the call fails: an
     * unreadable calendar never blocks a slot.
     */
    public function busy(array $emails, CarbonInterface $from, CarbonInterface $to): array
    {
        $emails = array_values(array_unique(array_filter(array_map(fn ($e) => trim((string) $e), $emails))));
        $unknown = array_fill_keys($emails, null);

        if ($emails === [] || $to <= $from || ! $this->connected()) {
            return $unknown;
        }

        $tz = MeetingSettings::timezone();
        $days = [];

        for ($day = Carbon::instance($from)->setTimezone($tz)->startOfDay(); $day < $to; $day = $day->copy()->addDay()) {
            $days[] = $day->toDateString();
        }

        $lower = array_map('strtolower', $emails);
        sort($lower);
        $hash = sha1(implode(',', $lower));

        $held = $this->heldDays($hash, $days);

        if (count($held) < count($days)) {
            try {
                $held = Cache::lock("meetings-google-busy-lock:{$hash}", 15)->block(self::BUSY_TIMEOUT, function () use ($hash, $days, $lower, $tz) {
                    // Whoever held the lock may have fetched them while we waited.
                    $held = $this->heldDays($hash, $days);
                    $missing = array_values(array_diff($days, array_keys($held)));

                    if ($missing === []) {
                        return $held;
                    }

                    $start = Carbon::parse($missing[0], $tz)->startOfDay();
                    $end = Carbon::parse($missing[count($missing) - 1], $tz)->addDay()->startOfDay();
                    $answer = $this->freeBusy($lower, $start, $end, self::BUSY_TIMEOUT);

                    if ($answer === null) {
                        return null;
                    }

                    foreach ($missing as $date) {
                        $dayFrom = Carbon::parse($date, $tz)->startOfDay()->timestamp;
                        $dayTo = Carbon::parse($date, $tz)->addDay()->startOfDay()->timestamp;
                        $entry = [];

                        foreach ($lower as $email) {
                            $spans = $answer[$email] ?? null;
                            $entry[$email] = $spans === null ? null : array_values(array_filter(
                                $spans,
                                fn (array $span) => $span[0] < $dayTo && $span[1] > $dayFrom,
                            ));
                        }

                        Cache::put("meetings-google-busy:{$hash}:{$date}", $entry, self::BUSY_TTL);
                        $held[$date] = $entry;
                    }

                    return $held;
                });
            } catch (LockTimeoutException) {
                return $unknown;
            }

            if (! is_array($held) || count($held) < count($days)) {
                return $unknown;
            }
        }

        $result = [];
        $fromTs = $from->getTimestamp();
        $toTs = $to->getTimestamp();

        foreach ($emails as $email) {
            $key = strtolower($email);
            $spans = [];
            $known = true;

            foreach ($days as $date) {
                $entry = $held[$date][$key] ?? null;

                if (! is_array($entry)) {
                    $known = false;
                    break;
                }

                foreach ($entry as $span) {
                    if ($span[0] < $toTs && $span[1] > $fromTs) {
                        $spans["{$span[0]}-{$span[1]}"] = $span;
                    }
                }
            }

            if (! $known) {
                $result[$email] = null;

                continue;
            }

            ksort($spans);
            $result[$email] = array_values(array_map(
                fn (array $span) => [Carbon::createFromTimestamp($span[0], $tz), Carbon::createFromTimestamp($span[1], $tz)],
                $spans,
            ));
        }

        return $result;
    }

    /**
     * The days whose answer is still believed — timestamps, never Carbon,
     * because the cache refuses to unserialise objects here.
     *
     * @param  list<string>  $days
     * @return array<string, array<string, list<array{0: int, 1: int}>|null>>
     */
    private function heldDays(string $hash, array $days): array
    {
        $held = [];

        foreach ($days as $date) {
            $entry = Cache::get("meetings-google-busy:{$hash}:{$date}");

            if (is_array($entry)) {
                $held[$date] = $entry;
            }
        }

        return $held;
    }

    /**
     * One freeBusy call. Lower-cased address → busy spans as UTC timestamps,
     * or null for a calendar Google could not read; null for the whole call
     * when it failed.
     *
     * @param  list<string>  $emails
     * @return array<string, list<array{0: int, 1: int}>|null>|null
     */
    private function freeBusy(array $emails, CarbonInterface $from, CarbonInterface $to, int $timeout): ?array
    {
        try {
            $response = $this->http($timeout)->post(self::API.'/freeBusy', [
                'timeMin' => $from->copy()->utc()->toRfc3339String(),
                'timeMax' => $to->copy()->utc()->toRfc3339String(),
                'timeZone' => 'UTC',
                'items' => array_map(fn (string $e) => ['id' => $e], $emails),
            ]);
        } catch (Throwable) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        $calendars = [];

        foreach ((array) $response->json('calendars', []) as $id => $calendar) {
            $calendars[strtolower((string) $id)] = is_array($calendar) ? $calendar : [];
        }

        $answer = [];

        foreach ($emails as $email) {
            $calendar = $calendars[$email] ?? null;

            if ($calendar === null || ! empty($calendar['errors'])) {
                $answer[$email] = null;

                continue;
            }

            $spans = [];

            foreach ((array) ($calendar['busy'] ?? []) as $busy) {
                if (is_array($busy) && isset($busy['start'], $busy['end'])) {
                    $spans[] = [Carbon::parse((string) $busy['start'])->timestamp, Carbon::parse((string) $busy['end'])->timestamp];
                }
            }

            $answer[$email] = $spans;
        }

        return $answer;
    }

    /**
     * The connection check behind the console's Test button: one real
     * freeBusy on the connected calendar over the next day.
     *
     * @return array{account: ?string, calendar: string}
     *
     * @throws RuntimeException in Google's words
     */
    public function probe(): array
    {
        $calendar = $this->calendarId();

        $response = $this->http(10)->post(self::API.'/freeBusy', [
            'timeMin' => now()->utc()->toRfc3339String(),
            'timeMax' => now()->addDay()->utc()->toRfc3339String(),
            'timeZone' => 'UTC',
            'items' => [['id' => $calendar]],
        ]);

        if (! $response->successful()) {
            throw new RuntimeException($this->describe($response));
        }

        // Read by key, not by a dotted path: a calendar id is an address full of dots.
        $calendars = (array) $response->json('calendars', []);
        $errors = $calendars[$calendar]['errors'] ?? null;

        if (is_array($errors) && $errors !== []) {
            $reason = is_array($errors[0] ?? null) ? (string) ($errors[0]['reason'] ?? 'unknown') : 'unknown';

            throw new RuntimeException("Google could not read the calendar \"{$calendar}\": {$reason}.");
        }

        return ['account' => $this->account(), 'calendar' => $calendar];
    }

    private function http(?int $timeout = null): PendingRequest
    {
        return Http::withToken(OAuthConnection::meetingsCalendar()->accessToken())
            ->acceptJson()
            ->asJson()
            ->timeout($timeout ?? $this->seconds())
            ->withoutRedirecting();
    }

    private function seconds(): int
    {
        return $this->timeout ?? (app()->runningInConsole() ? 10 : 4);
    }

    private function eventsUrl(): string
    {
        return self::API.'/calendars/'.rawurlencode($this->calendarId()).'/events';
    }

    private function eventUrl(string $id): string
    {
        return $this->eventsUrl().'/'.rawurlencode($id);
    }
}
