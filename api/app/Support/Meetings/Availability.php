<?php

namespace App\Support\Meetings;

use App\Enums\MeetingStatus;
use App\Enums\Role;
use App\Models\Meeting;
use App\Models\MeetingHostHour;
use App\Models\MeetingTimeOff;
use App\Models\MeetingType;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Log;

/**
 * The slot engine: which start times a meeting type can be booked at, and
 * which hosts are free for each (docs/meetings.md, "The slot engine").
 *
 * Everything is worked in `APP_TIMEZONE` — the day, the working hours, the
 * alignment of the steps — and compared as Unix timestamps, never as a
 * string with a hard-coded "IST".
 *
 * A start time `s` is a slot for a host when:
 *
 *  1. the host is a **candidate**: active, holding `meeting_host` explicitly
 *     (the administrator's implicit pass does not count), and allowed for
 *     the type — an empty allowed list means every eligible host, a
 *     non-empty one whose hosts are all gone means nobody;
 *  2. the meeting `[s, s + minutes)` lies inside one of the host's working
 *     stretches that day — their own hours, or the defaults when they have
 *     none — and the day is not a holiday;
 *  3. the meeting widened by the type's buffers, `[s − before, s + minutes +
 *     after)`, overlaps none of: the host's time off, the blocks of their
 *     scheduled meetings (`blocked_from`/`blocked_until`, which already carry
 *     *those* meetings' buffers), or — when the setting is on and the
 *     calendar is connected — their Google busy times. A calendar Google
 *     would not show is unknown, and unknown never blocks;
 *  4. `s` sits on a step boundary aligned to the hour on the wall clock, and
 *     inside the booking window: at least the minimum notice from now and on
 *     or before the last bookable day.
 *
 * The console's variant (`forStaff()`) skips the window — it still refuses
 * the past — and may widen (2) and the Google half of (3) behind the two
 * confirm ticks, marking which hosts needed it. Nothing widens the rest of
 * (3): a meeting booked here can never be overlapped.
 *
 * This reads; it never locks. `MeetingActions` takes its answer as the
 * shortlist and re-checks the one thing another request can change — the
 * bookings — inside the lock.
 */
final class Availability
{
    /** The longest range one question may cover, in days. */
    public const MAX_RANGE_DAYS = 62;

    private ?int $onlyHost = null;

    private bool $staff = false;

    private bool $outsideHours = false;

    private bool $ignoreGoogleBusy = false;

    private ?int $excluding = null;

    /** @var Collection<int, User>|null */
    private ?Collection $hosts = null;

    private function __construct(private readonly MeetingType $type) {}

    public static function for(MeetingType $type): self
    {
        return new self($type);
    }

    /**
     * Staff who may host at all: active and holding the role **explicitly**.
     *
     * @return Builder<User>
     */
    public static function eligibleQuery(): Builder
    {
        return User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($r) => $r->where('slug', Role::MeetingHost->value));
    }

    public static function isEligible(User $user): bool
    {
        return $user->is_active && $user->roles()->where('slug', Role::MeetingHost->value)->exists();
    }

    /**
     * The candidate hosts for a type, by id.
     *
     * @return Collection<int, User>
     */
    public static function candidates(MeetingType $type): Collection
    {
        $allowed = $type->hosts()->pluck('users.id')->map(fn ($id) => (int) $id)->all();

        return self::eligibleQuery()
            ->when($allowed !== [], fn ($q) => $q->whereIn('id', $allowed))
            ->orderBy('id')
            ->get(['id', 'name', 'email']);
    }

    /** Ask about one host only — the console's `host=`, or a staff move to a named host. */
    public function onlyHost(?int $hostId): self
    {
        $this->onlyHost = $hostId;

        return $this;
    }

    /** The console: no notice, no window — never the past. */
    public function forStaff(bool $staff = true): self
    {
        $this->staff = $staff;

        return $this;
    }

    /** Offer times outside working hours (and on holidays), marked as such. */
    public function allowOutsideHours(bool $allow = true): self
    {
        $this->outsideHours = $allow;

        return $this;
    }

    /** Offer times a Google busy block covers, marked as such. */
    public function allowGoogleBusy(bool $allow = true): self
    {
        $this->ignoreGoogleBusy = $allow;

        return $this;
    }

    /** Leave one meeting's own block out — a move may overlap where it is now. */
    public function excluding(?int $meetingId): self
    {
        $this->excluding = $meetingId;

        return $this;
    }

    /**
     * The hosts this question is about: the type's candidates, or the one
     * asked for when it is one of them.
     *
     * @return Collection<int, User>
     */
    public function hosts(): Collection
    {
        if ($this->hosts === null) {
            $all = self::candidates($this->type);
            $this->hosts = $this->onlyHost !== null ? $all->where('id', $this->onlyHost)->values() : $all;
        }

        return $this->hosts;
    }

    /**
     * How many start times each day has, every date from `$from` to `$to`
     * present — zero when the day is closed or full.
     *
     * @return list<array{date: string, count: int}>
     */
    public function days(CarbonInterface $from, CarbonInterface $to): array
    {
        $out = [];

        foreach ($this->compute($from, $to) as $date => $slots) {
            $out[] = ['date' => $date, 'count' => count($slots)];
        }

        return $out;
    }

    /**
     * The start times on one day, each with the hosts free for it.
     *
     * @return list<array{start: CarbonImmutable, end: CarbonImmutable, hosts: list<array{id: int, name: string, outside_hours: bool, google_busy: bool}>}>
     */
    public function slots(CarbonInterface $date): array
    {
        $day = self::day($date);

        return $this->compute($day, $day)[$day->format('Y-m-d')] ?? [];
    }

    /**
     * The hosts free at exactly this start, or null when it is not a start
     * time on offer at all (off the step, outside the window, closed).
     *
     * @return list<array{id: int, name: string, outside_hours: bool, google_busy: bool}>|null
     */
    public function hostsAt(CarbonInterface $start): ?array
    {
        $local = MeetingText::local($start);
        $ts = $local->getTimestamp();

        if (! $this->onStep($local) || ! $this->inWindow($ts)) {
            return null;
        }

        foreach ($this->slots($local) as $slot) {
            if ($slot['start']->getTimestamp() === $ts) {
                return $slot['hosts'];
            }
        }

        return [];
    }

    /** Whether a time is a step boundary aligned to the hour, on the wall clock. */
    public function onStep(CarbonInterface $start): bool
    {
        $local = MeetingText::local($start);

        return $local->second === 0 && $local->minute % MeetingSettings::slotStep() === 0;
    }

    /** The first moment a start may be at (inclusive), as a timestamp. */
    public function earliest(): int
    {
        return $this->staff
            ? now()->getTimestamp() + 1
            : now()->addHours(MeetingSettings::minNoticeHours())->getTimestamp();
    }

    /** The last day a start may fall on, in the app's timezone; null for the console. */
    public function lastDay(): ?CarbonImmutable
    {
        return $this->staff ? null : self::day(now())->addDays(MeetingSettings::maxDays());
    }

    public function inWindow(int $ts): bool
    {
        if ($ts < $this->earliest()) {
            return false;
        }

        $last = $this->lastDay();

        return $last === null || $ts < $last->addDay()->getTimestamp();
    }

    /** Midnight of a moment's day, on the app's wall clock. */
    public static function day(CarbonInterface $at): CarbonImmutable
    {
        return CarbonImmutable::instance($at)->setTimezone(MeetingSettings::timezone())->startOfDay();
    }

    /* ------------------------------------------------------------------ */

    /**
     * Every slot from one day to another, keyed by date.
     *
     * @return array<string, list<array{start: CarbonImmutable, end: CarbonImmutable, hosts: list<array{id: int, name: string, outside_hours: bool, google_busy: bool}>}>>
     */
    private function compute(CarbonInterface $from, CarbonInterface $to): array
    {
        $first = self::day($from);
        $last = self::day($to);

        if ($last->lt($first)) {
            [$first, $last] = [$last, $first];
        }

        if ($first->diffInDays($last) > self::MAX_RANGE_DAYS) {
            $last = $first->addDays(self::MAX_RANGE_DAYS);
        }

        $dates = [];

        for ($d = $first; $d->lte($last); $d = $d->addDay()) {
            $dates[] = $d;
        }

        $hosts = $this->hosts();
        $result = array_fill_keys(array_map(fn ($d) => $d->format('Y-m-d'), $dates), []);

        if ($hosts->isEmpty()) {
            return $result;
        }

        $minutes = max(1, (int) $this->type->minutes);
        $before = (int) $this->type->buffer_before * 60;
        $after = (int) $this->type->buffer_after * 60;
        $step = MeetingSettings::slotStep();

        // Everything that can block, loaded once for the whole range and a
        // margin either side for the buffers.
        $rangeFrom = $first->subDay();
        $rangeTo = $last->addDays(2);
        $ids = $hosts->pluck('id')->all();

        $ownHours = self::ownHours($ids);
        $defaults = MeetingSettings::defaultHours();
        $holidays = array_flip(MeetingSettings::holidays());
        $blocked = $this->blocked($ids, $rangeFrom, $rangeTo);
        $google = $this->googleBusy($hosts, $rangeFrom, $rangeTo);
        $earliest = $this->earliest();
        $lastDay = $this->lastDay();

        foreach ($dates as $date) {
            $key = $date->format('Y-m-d');

            if ($lastDay !== null && $date->gt($lastDay)) {
                continue;
            }

            if ($date->addDay()->getTimestamp() <= $earliest) {
                continue;
            }

            $weekday = $date->dayOfWeekIso;
            $holiday = isset($holidays[$key]);

            // Each host's working stretches today, as timestamps.
            $hours = [];

            foreach ($hosts as $host) {
                $spans = match (true) {
                    $holiday => [],
                    isset($ownHours[$host->id]) => $ownHours[$host->id][$weekday] ?? [],
                    default => $defaults[$weekday] ?? [],
                };

                $hours[$host->id] = array_map(fn (array $s) => [
                    self::at($key, $s[0])->getTimestamp(),
                    self::at($key, $s[1])->getTimestamp(),
                ], $spans);
            }

            for ($m = 0; $m + $step <= 1440; $m += $step) {
                $start = self::at($key, sprintf('%02d:%02d', intdiv($m, 60), $m % 60));
                $s = $start->getTimestamp();

                // A day that repeats an hour (a DST change) would offer it twice.
                if ($start->format('Y-m-d') !== $key || $s < $earliest) {
                    continue;
                }

                $e = $s + $minutes * 60;
                $blockFrom = $s - $before;
                $blockUntil = $e + $after;
                $free = [];

                foreach ($hosts as $host) {
                    $inHours = false;

                    foreach ($hours[$host->id] as [$hs, $he]) {
                        if ($hs <= $s && $e <= $he) {
                            $inHours = true;
                            break;
                        }
                    }

                    if (! $inHours && ! $this->outsideHours) {
                        continue;
                    }

                    if (self::overlaps($blocked[$host->id] ?? [], $blockFrom, $blockUntil)) {
                        continue;
                    }

                    $busy = self::overlaps($google[$host->id] ?? [], $blockFrom, $blockUntil);

                    if ($busy && ! $this->ignoreGoogleBusy) {
                        continue;
                    }

                    $free[] = [
                        'id' => (int) $host->id,
                        'name' => (string) $host->name,
                        'outside_hours' => ! $inHours,
                        'google_busy' => $busy,
                    ];
                }

                if ($free !== []) {
                    $result[$key][] = [
                        'start' => $start,
                        'end' => $start->addMinutes($minutes),
                        'hosts' => $free,
                    ];
                }
            }
        }

        return $result;
    }

    /** A wall-clock time on a date, in the app's timezone. `24:00` is the next midnight. */
    private static function at(string $date, string $time): CarbonImmutable
    {
        if (str_starts_with($time, '24:')) {
            return CarbonImmutable::parse($date, MeetingSettings::timezone())->addDay()->startOfDay();
        }

        return CarbonImmutable::createFromFormat('Y-m-d H:i', $date.' '.substr($time, 0, 5), MeetingSettings::timezone())
            ->startOfMinute();
    }

    /** @param  list<array{0: int, 1: int}>  $intervals */
    private static function overlaps(array $intervals, int $from, int $until): bool
    {
        foreach ($intervals as [$a, $b]) {
            if ($a < $until && $b > $from) {
                return true;
            }
        }

        return false;
    }

    /**
     * Hosts' own weekly hours, for those who have any — a host with no rows
     * works the defaults.
     *
     * @param  list<int>  $ids
     * @return array<int, array<int, list<array{0: string, 1: string}>>>
     */
    private static function ownHours(array $ids): array
    {
        $out = [];

        foreach (MeetingHostHour::query()->whereIn('user_id', $ids)->orderBy('start')->get() as $row) {
            $start = substr((string) $row->start, 0, 5);
            $end = substr((string) $row->end, 0, 5);

            if ($end > $start) {
                $out[(int) $row->user_id][(int) $row->weekday][] = [$start, $end];
            } else {
                // Still a host with hours of their own, even if this row is empty.
                $out[(int) $row->user_id] ??= [];
            }
        }

        return $out;
    }

    /**
     * Time off and scheduled meetings' blocks, per host, as timestamps.
     *
     * @param  list<int>  $ids
     * @return array<int, list<array{0: int, 1: int}>>
     */
    private function blocked(array $ids, CarbonInterface $from, CarbonInterface $to): array
    {
        $out = [];

        MeetingTimeOff::query()
            ->whereIn('user_id', $ids)
            ->where('starts_at', '<', $to)
            ->where('ends_at', '>', $from)
            ->get(['user_id', 'starts_at', 'ends_at'])
            ->each(function (MeetingTimeOff $off) use (&$out) {
                $out[(int) $off->user_id][] = [$off->starts_at->getTimestamp(), $off->ends_at->getTimestamp()];
            });

        Meeting::query()
            ->where('status', MeetingStatus::Scheduled->value)
            ->whereIn('host_id', $ids)
            ->where('blocked_from', '<', $to)
            ->where('blocked_until', '>', $from)
            ->when($this->excluding !== null, fn ($q) => $q->where('id', '!=', $this->excluding))
            ->get(['host_id', 'blocked_from', 'blocked_until'])
            ->each(function (Meeting $meeting) use (&$out) {
                $out[(int) $meeting->host_id][] = [$meeting->blocked_from->getTimestamp(), $meeting->blocked_until->getTimestamp()];
            });

        return $out;
    }

    /**
     * Google busy times per host, or nothing: the setting off, no calendar
     * connected, a calendar Google would not show, or the call failing all
     * read as "unknown", which never blocks a slot.
     *
     * @param  Collection<int, User>  $hosts
     * @return array<int, list<array{0: int, 1: int}>>
     */
    private function googleBusy(Collection $hosts, CarbonInterface $from, CarbonInterface $to): array
    {
        if (! MeetingSettings::blockGoogleBusy()) {
            return [];
        }

        try {
            $calendar = app(MeetingCalendar::class);

            if (! $calendar->connected()) {
                return [];
            }

            $busy = $calendar->busy($hosts->pluck('email')->filter()->values()->all(), $from, $to);
        } catch (\Throwable $e) {
            Log::warning('Google free/busy could not be read; treating every host as unknown', ['error' => $e->getMessage()]);

            return [];
        }

        $out = [];

        foreach ($hosts as $host) {
            $list = $busy[$host->email] ?? $busy[strtolower((string) $host->email)] ?? null;

            if (! is_array($list)) {
                continue;
            }

            foreach ($list as $pair) {
                $out[(int) $host->id][] = [$pair[0]->getTimestamp(), $pair[1]->getTimestamp()];
            }
        }

        return $out;
    }
}
