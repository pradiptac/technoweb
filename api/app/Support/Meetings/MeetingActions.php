<?php

namespace App\Support\Meetings;

use App\Enums\MeetingSource;
use App\Enums\MeetingStatus;
use App\Enums\MessageChannel;
use App\Models\Customer;
use App\Models\Meeting;
use App\Models\MeetingType;
use App\Models\User;
use App\Support\Crm\LeadIntake;
use App\Support\Crm\PageContext;
use App\Support\Messaging\Contacts;
use App\Support\Phone;
use App\Support\References;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Everything that changes a meeting, in one place (docs/meetings.md,
 * "Booking without overlap" and "Actions").
 *
 * Four doors reach these — the public page, the guest link, the portal and
 * the console — and each checks who is asking and calls here; this decides
 * what the change means.
 *
 * ## Booking without overlap
 *
 * A host can never be double-booked, and the proof is the lock, not the
 * slot list. `book()` and `move()` run in `DB::transaction(…, 3)` — retried
 * on a deadlock — whose **first statement is the lock**: MySQL takes a
 * transaction's read snapshot at its first ordinary read, so anything read
 * before the lock could be a picture from before a competing booking
 * committed. A booking locks every candidate host's `users` row in one
 * query ordered by id (so two bookings can never lock in opposite orders);
 * a move locks the meeting first and then the hosts. Inside the lock the
 * clash is a plain read of the hosts' scheduled blocks, the least-booked
 * free host is chosen (fewest meetings in the week of the slot, lowest id
 * on a tie), and the row and its first trail line are written. Nothing else
 * happens in the transaction: the lead, the opt-ins, the notices, the
 * webhook and the calendar sync all follow the commit.
 *
 * The slot engine's answer is the shortlist — hours, time off, holidays and
 * Google busy do not change under a competing booking — and the lock re-asks
 * the one question another request can change.
 *
 * ## The console
 *
 * A staff booking skips the notice and the window (never the past), may go
 * outside working hours and over a **Google** busy time behind the two
 * confirm ticks, and can never overlap a meeting booked here: nothing
 * widens the clash check.
 */
final class MeetingActions
{
    public const TAKEN = 'That time was just taken — choose another.';

    public const NOT_OFFERED = 'That is not one of the times on offer — choose another.';

    /**
     * A start as the wire carries it: ISO 8601 **with its offset**, read into
     * the app's timezone. A wall-clock time with no offset is refused — it
     * would mean whatever zone happened to parse it.
     */
    public static function parseStart(mixed $value, string $key = 'start'): CarbonImmutable
    {
        $value = is_string($value) ? trim($value) : '';
        $pattern = '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/';

        if (preg_match($pattern, $value) !== 1) {
            throw ValidationException::withMessages([$key => 'Choose a time from the list.']);
        }

        try {
            return CarbonImmutable::parse($value)->setTimezone(MeetingSettings::timezone());
        } catch (\Throwable) {
            throw ValidationException::withMessages([$key => 'Choose a time from the list.']);
        }
    }

    /**
     * A new meeting.
     *
     * @param  array{name: string, email: string, phone?: string|null, company?: string|null, agenda?: string|null, message_opt_in?: array<int, mixed>}  $contact
     */
    public static function book(
        MeetingType $type,
        CarbonInterface $start,
        array $contact,
        MeetingSource $source,
        Request $request,
        ?Customer $customer = null,
        ?User $by = null,
        ?int $hostId = null,
        bool $outsideHours = false,
        bool $overrideGoogleBusy = false,
    ): Meeting {
        $staff = $source === MeetingSource::Console;
        $start = MeetingText::local($start)->toImmutable();
        $email = trim($contact['email']);
        $phone = filled($contact['phone'] ?? null) ? (Phone::e164((string) $contact['phone']) ?? trim((string) $contact['phone'])) : null;

        if (! $staff) {
            self::refuseOverCaps($email, $phone, $request);
        }

        $availability = Availability::for($type)
            ->forStaff($staff)
            ->allowOutsideHours($staff && $outsideHours)
            ->allowGoogleBusy($staff && $overrideGoogleBusy)
            ->onlyHost($hostId);

        if ($hostId !== null && $availability->hosts()->isEmpty()) {
            throw ValidationException::withMessages(['host_id' => 'That person cannot host this kind of meeting.']);
        }

        $free = self::freeHosts($availability, $start, $staff);
        $candidates = $availability->hosts();
        $end = $start->addMinutes((int) $type->minutes);
        $blockFrom = $start->subMinutes((int) $type->buffer_before);
        $blockUntil = $end->addMinutes((int) $type->buffer_after);

        $meeting = self::withReferenceRetry(function (int $attempt) use (
            $type, $start, $end, $blockFrom, $blockUntil, $candidates, $free, $contact, $email, $phone,
            $source, $request, $customer, $by, $staff,
        ) {
            return DB::transaction(function () use (
                $attempt, $type, $start, $end, $blockFrom, $blockUntil, $candidates, $free, $contact, $email, $phone,
                $source, $request, $customer, $by, $staff,
            ) {
                // The first statement: every candidate host, in id order.
                User::query()->whereIn('id', $candidates->pluck('id')->all())
                    ->orderBy('id')->lockForUpdate()->pluck('id');

                $available = self::withoutClash($free, $blockFrom, $blockUntil);

                if ($available === []) {
                    throw ValidationException::withMessages(['start' => self::TAKEN]);
                }

                $hostId = self::leastBooked($available, $start);
                $host = $candidates->firstWhere('id', $hostId);

                $meeting = new Meeting;
                $meeting->setRelation('meetingType', $type);
                $meeting->forceFill([
                    'reference' => self::reference($attempt),
                    'meeting_type_id' => $type->id,
                    'host_id' => $hostId,
                    'host_name' => $host?->name,
                    'customer_id' => $customer?->id,
                    'name' => trim($contact['name']),
                    'email' => $email,
                    'phone' => $phone,
                    'company' => filled($contact['company'] ?? null) ? trim((string) $contact['company']) : null,
                    'agenda' => filled($contact['agenda'] ?? null) ? trim((string) $contact['agenda']) : null,
                    'starts_at' => $start,
                    'ends_at' => $end,
                    'status' => MeetingStatus::Scheduled,
                    'source' => $source,
                    'created_by' => $by?->id,
                    ...($staff ? [] : PageContext::from($request)),
                    'ip_address' => $staff ? null : $request->ip(),
                ]);
                $meeting->save();

                $meeting->record('booked', $by, null, self::when($meeting), trim($source->label()
                    .($host !== null ? ' · with '.$host->name : '')));

                return $meeting;
            }, 3);
        });

        $meeting->loadMissing('meetingType');

        // The pipeline record before the announcements, the visits' order:
        // `LeadIntake` never throws, and a lead it could not write is logged.
        if (! ($staff && $meeting->customer_id !== null)) {
            $lead = LeadIntake::fromMeeting($meeting, $request);

            if ($lead !== null) {
                $meeting->forceFill(['lead_id' => $lead->id])->saveQuietly();
            }
        }

        if (! $staff) {
            self::optIn($meeting, (array) ($contact['message_opt_in'] ?? []));
        }

        MeetingReminders::seedPast($meeting);
        MeetingNotices::booked($meeting);
        MeetingSync::queue($meeting);

        return $meeting;
    }

    /**
     * A meeting to a new time — and, from the console, perhaps a new host.
     *
     * A customer moves only into a free slot, outside the cutoff and under
     * the reschedule cap, and keeps their host when that host is free; staff
     * may name a host, who must be eligible, allowed and free. Either way the
     * meeting's own current block is left out of the clash, so it can move
     * half an hour into where it is now.
     */
    public static function move(
        Meeting $meeting,
        CarbonInterface $start,
        ?User $by,
        bool $byCustomer = false,
        ?int $hostId = null,
        bool $outsideHours = false,
        bool $overrideGoogleBusy = false,
    ): Meeting {
        $start = MeetingText::local($start)->toImmutable();
        self::refuseUnlessScheduled($meeting, 'move');

        if ($byCustomer) {
            self::refuseInsideCutoff($meeting);
            self::refusePastRescheduleCap($meeting);
        }

        $type = $meeting->meetingType()->firstOrFail();

        $availability = Availability::for($type)
            ->forStaff(! $byCustomer)
            ->allowOutsideHours(! $byCustomer && $outsideHours)
            ->allowGoogleBusy(! $byCustomer && $overrideGoogleBusy)
            ->onlyHost($byCustomer ? null : $hostId)
            ->excluding($meeting->id);

        if (! $byCustomer && $hostId !== null && $availability->hosts()->isEmpty()) {
            throw ValidationException::withMessages(['host_id' => 'That person cannot host this kind of meeting.']);
        }

        $free = self::freeHosts($availability, $start, ! $byCustomer);
        $candidates = $availability->hosts();
        $end = $start->addMinutes((int) $type->minutes);
        $blockFrom = $start->subMinutes((int) $type->buffer_before);
        $blockUntil = $end->addMinutes((int) $type->buffer_after);

        $result = DB::transaction(function () use (
            $meeting, $type, $start, $end, $blockFrom, $blockUntil, $candidates, $free, $by, $byCustomer, $hostId,
        ) {
            // The meeting first, then its hosts — one order for every move.
            /** @var Meeting $locked */
            $locked = Meeting::query()->whereKey($meeting->id)->lockForUpdate()->firstOrFail();

            $lockIds = $candidates->pluck('id')->push($locked->host_id)->filter()->unique()->sort()->values()->all();
            User::query()->whereIn('id', $lockIds)->orderBy('id')->lockForUpdate()->pluck('id');

            self::refuseUnlessScheduled($locked, 'move');

            if ($byCustomer) {
                self::refuseInsideCutoff($locked);
                self::refusePastRescheduleCap($locked);
            }

            $available = self::withoutClash($free, $blockFrom, $blockUntil, $locked->id);

            if ($available === []) {
                throw ValidationException::withMessages(['start' => self::TAKEN]);
            }

            $newHost = $hostId === null && in_array((int) $locked->host_id, $available, true)
                ? (int) $locked->host_id
                : self::leastBooked($available, $start);

            $previous = self::when($locked);
            $previousHost = $locked->host_name;
            $hostChanged = $newHost !== (int) $locked->host_id;
            $chosen = $candidates->firstWhere('id', $newHost);
            $newHostName = $chosen instanceof User ? $chosen->name : $locked->host_name;

            $locked->setRelation('meetingType', $type);
            $locked->forceFill([
                'starts_at' => $start,
                'ends_at' => $end,
                'host_id' => $newHost,
                'host_name' => $newHostName,
                'reschedule_count' => $locked->reschedule_count + ($byCustomer ? 1 : 0),
            ])->save();

            $note = trim(($byCustomer ? 'Moved by the customer.' : '')
                .($hostChanged ? ' Host: '.($previousHost ?: 'nobody').' → '.$locked->host_name.'.' : ''));
            $locked->record('rescheduled', $by, $previous, self::when($locked), $note !== '' ? $note : null);

            return [$locked, $previous, $hostChanged];
        }, 3);

        [$moved, $previous, $hostChanged] = $result;

        MeetingReminders::seedPast($moved);
        MeetingNotices::moved($moved, $previous, $hostChanged);
        MeetingSync::queue($moved);

        return $moved;
    }

    /** Called off — by the customer outside the cutoff, or by the desk at any time. */
    public static function cancel(Meeting $meeting, ?string $reason, bool $byCustomer, ?User $by = null): Meeting
    {
        self::refuseUnlessScheduled($meeting, 'cancel');

        if ($byCustomer) {
            self::refuseInsideCutoff($meeting);
        }

        $cancelled = DB::transaction(function () use ($meeting, $reason, $byCustomer, $by) {
            /** @var Meeting $locked */
            $locked = Meeting::query()->whereKey($meeting->id)->lockForUpdate()->firstOrFail();

            self::refuseUnlessScheduled($locked, 'cancel');

            if ($byCustomer) {
                self::refuseInsideCutoff($locked);
            }

            $reason = ! $byCustomer && filled($reason) ? mb_substr(trim((string) $reason), 0, 500) : null;

            $locked->forceFill([
                'status' => MeetingStatus::Cancelled,
                'cancelled_at' => $locked->cancelled_at ?? now(),
                'cancel_reason' => $reason,
            ])->save();

            $locked->record('cancelled', $by, MeetingStatus::Scheduled->value, MeetingStatus::Cancelled->value,
                $byCustomer ? 'Cancelled by the customer.' : $reason);

            return $locked;
        });

        $cancelled->loadMissing('meetingType');

        MeetingNotices::cancelled($cancelled);
        MeetingSync::queue($cancelled);

        return $cancelled;
    }

    /**
     * What happened: completed or a no-show, once the meeting has started.
     * The two correct to each other; nothing is marked a no-show by itself.
     */
    public static function outcome(Meeting $meeting, MeetingStatus $next, ?string $note, User $by): Meeting
    {
        if ($next === $meeting->status) {
            return $meeting;
        }

        if (! in_array($next, [MeetingStatus::Completed, MeetingStatus::NoShow], true)) {
            throw ValidationException::withMessages([
                'status' => $next === MeetingStatus::Cancelled
                    ? 'Use Cancel to call a meeting off, so the customer is told.'
                    : "A meeting cannot be set back to {$next->label()}.",
            ]);
        }

        if ($meeting->starts_at->isFuture()) {
            throw ValidationException::withMessages(['status' => 'An outcome can be recorded once the meeting has started.']);
        }

        if (! $meeting->status->canTransitionTo($next)) {
            throw ValidationException::withMessages([
                'status' => "A meeting cannot go from {$meeting->status->label()} to {$next->label()}.",
            ]);
        }

        $from = $meeting->status;
        $meeting->status = $next;

        if ($next === MeetingStatus::Completed) {
            $meeting->completed_at ??= now();
        }

        $meeting->save();
        $meeting->record($next->value, $by, $from->value, $next->value, filled($note) ? mb_substr(trim((string) $note), 0, 2000) : null);

        return $meeting;
    }

    /** Retry a calendar sync that failed — the console's Retry button. */
    public static function resync(Meeting $meeting, User $by): Meeting
    {
        $meeting->record(MeetingNotices::GOOGLE_RETRIED, $by);
        MeetingSync::queue($meeting);

        return $meeting->refresh();
    }

    /** "Tue 6 Oct 2026, 15:30 – 16:00 IST" — for the trail and the "it was" line. */
    public static function when(Meeting $meeting): string
    {
        return MeetingText::date($meeting->starts_at).', '.MeetingText::time($meeting).' '.MeetingText::timezone();
    }

    /**
     * Future meetings a staff member hosts — what must be reassigned before
     * they stop being a host.
     */
    public static function upcomingFor(User $user): int
    {
        return Meeting::query()->upcoming()->where('host_id', $user->id)->count();
    }

    /** The refusal when somebody still hosting would stop being a host. */
    public static function reassignFirst(int $count): string
    {
        return "This person hosts {$count} upcoming ".($count === 1 ? 'meeting' : 'meetings')
            .' — reassign '.($count === 1 ? 'it' : 'them').' to another host first (Meetings → move).';
    }

    /* ------------------------------------------------------------------ */

    /**
     * The shortlist from the slot engine: hosts free at this start before
     * the lock. Null is "not a time on offer", empty is "taken".
     *
     * @return list<int>
     */
    private static function freeHosts(Availability $availability, CarbonImmutable $start, bool $staff): array
    {
        if ($staff && $start->getTimestamp() <= now()->getTimestamp()) {
            throw ValidationException::withMessages(['start' => 'That time has already passed.']);
        }

        $hosts = $availability->hostsAt($start);

        if ($hosts === null) {
            throw ValidationException::withMessages(['start' => self::NOT_OFFERED]);
        }

        if ($hosts === []) {
            throw ValidationException::withMessages(['start' => self::TAKEN]);
        }

        return array_map(fn (array $h) => $h['id'], $hosts);
    }

    /**
     * Of these hosts, the ones with no scheduled block overlapping — a plain
     * read, inside the lock.
     *
     * @param  list<int>  $hostIds
     * @return list<int>
     */
    private static function withoutClash(array $hostIds, CarbonInterface $from, CarbonInterface $until, ?int $except = null): array
    {
        $clashing = Meeting::query()
            ->where('status', MeetingStatus::Scheduled->value)
            ->whereIn('host_id', $hostIds)
            ->where('blocked_from', '<', $until)
            ->where('blocked_until', '>', $from)
            ->when($except !== null, fn ($q) => $q->where('id', '!=', $except))
            ->pluck('host_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return array_values(array_diff($hostIds, $clashing));
    }

    /**
     * The free host with the fewest meetings in the slot's week (Monday to
     * Sunday on the app's clock), lowest id on a tie.
     *
     * @param  list<int>  $hostIds
     */
    private static function leastBooked(array $hostIds, CarbonImmutable $start): int
    {
        $week = MeetingText::local($start)->startOfWeek(CarbonInterface::MONDAY);

        $counts = Meeting::query()
            ->whereIn('host_id', $hostIds)
            ->where('status', '!=', MeetingStatus::Cancelled->value)
            ->where('starts_at', '>=', $week)
            ->where('starts_at', '<', $week->copy()->addWeek())
            ->groupBy('host_id')
            ->selectRaw('host_id, COUNT(*) as n')
            ->pluck('n', 'host_id');

        $ids = $hostIds;
        usort($ids, fn (int $a, int $b) => [(int) ($counts[$a] ?? 0), $a] <=> [(int) ($counts[$b] ?? 0), $b]);

        return $ids[0];
    }

    /**
     * Run a write, regenerating the reference when two bookings drew the
     * same number: up to three times, each in a fresh transaction (so a fresh
     * snapshot that sees the other booking).
     *
     * @template T
     *
     * @param  callable(int): T  $write
     * @return T
     */
    private static function withReferenceRetry(callable $write): mixed
    {
        for ($attempt = 0; ; $attempt++) {
            try {
                return $write($attempt);
            } catch (UniqueConstraintViolationException $e) {
                if ($attempt >= 2 || ! str_contains($e->getMessage(), 'reference')) {
                    throw $e;
                }
            }
        }
    }

    /**
     * The first try takes the model's own next number; a retry counts on from
     * the highest one issued this year, which a stale "last id" cannot hide.
     */
    private static function reference(int $attempt): ?string
    {
        if ($attempt === 0) {
            return null;
        }

        $prefix = References::meeting();
        $year = now()->year;
        $max = Meeting::query()->where('reference', 'like', "{$prefix}-{$year}-%")->max('reference');
        $n = is_string($max) ? (int) Str::afterLast($max, '-') : 0;

        return sprintf('%s-%d-%05d', $prefix, $year, $n + $attempt);
    }

    /**
     * The two limits on the public door: future meetings per contact (email
     * or mobile), and bookings per address per day.
     */
    private static function refuseOverCaps(string $email, ?string $phone, Request $request): void
    {
        $open = Meeting::query()->upcoming()
            ->where(fn ($q) => $q->where('email', $email)->when($phone !== null, fn ($w) => $w->orWhere('phone', $phone)))
            ->count();
        $max = MeetingSettings::maxOpenPerContact();

        if ($open >= $max) {
            throw ValidationException::withMessages(['email' => $max === 1
                ? 'You already have a meeting booked with us. Cancel it or choose another time from its page before booking another.'
                : "You already have {$open} meetings booked with us. Cancel one before booking another, or get in touch."]);
        }

        $ip = $request->ip();

        if ($ip !== null) {
            $today = Meeting::query()
                ->where('ip_address', $ip)
                ->where('created_at', '>=', Availability::day(now()))
                ->count();

            if ($today >= MeetingSettings::dailyIpCap()) {
                throw ValidationException::withMessages(['start' => 'Too many meetings have been booked from here today. Please get in touch with us instead.']);
            }
        }
    }

    private static function refuseUnlessScheduled(Meeting $meeting, string $verb): void
    {
        if ($meeting->status !== MeetingStatus::Scheduled) {
            throw ValidationException::withMessages([
                'meeting' => "This meeting is {$meeting->status->label()}, so there is nothing to {$verb}.",
            ]);
        }

        if ($meeting->starts_at->isPast()) {
            throw ValidationException::withMessages(['meeting' => "This meeting has already started, so it cannot be {$verb}d."]);
        }
    }

    private static function refuseInsideCutoff(Meeting $meeting): void
    {
        $hours = MeetingSettings::changeCutoffHours();

        if ($meeting->starts_at->copy()->subHours($hours)->lte(now())) {
            throw ValidationException::withMessages([
                'meeting' => "It is less than {$hours} hours to the meeting, so it can no longer be changed here. Please get in touch with us.",
            ]);
        }
    }

    private static function refusePastRescheduleCap(Meeting $meeting): void
    {
        if ($meeting->reschedule_count >= MeetingSettings::maxReschedules()) {
            throw ValidationException::withMessages([
                'meeting' => 'This meeting has been moved as many times as it can be here. Please get in touch with us.',
            ]);
        }
    }

    /**
     * The checkout's opt-in, for the mobile on the booking, sourced
     * `meeting`. Never fails the booking.
     *
     * @param  array<int, mixed>  $channels
     */
    private static function optIn(Meeting $meeting, array $channels): void
    {
        try {
            foreach ($channels as $value) {
                $channel = MessageChannel::tryFrom((string) $value);

                if ($channel !== null && $channel->addressKind() === 'phone' && $channel->ready()) {
                    Contacts::optIn($channel, $meeting->phone, $meeting->customer_id, 'meeting', $meeting->name);
                }
            }
        } catch (\Throwable $e) {
            Log::warning('A meeting messaging opt-in could not be recorded', ['meeting' => $meeting->reference, 'error' => $e->getMessage()]);
        }
    }
}
