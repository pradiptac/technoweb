<?php

namespace App\Support;

use App\Enums\TicketStatus;
use App\Models\Ticket;
use App\Models\TicketCategory;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * The figures behind the admin dashboard's charts.
 *
 * Separate from the controller because every one of these is a decision, not
 * a query — which window, which average, what to do when there is no data —
 * and those decisions are easier to argue with when they are in one place.
 */
class TicketMetrics
{
    /** Days of history the dashboard shows. */
    public const WINDOW = 30;

    /**
     * Tickets opened and resolved per day, oldest first, with no gaps.
     *
     * Every day in the window is present even when nothing happened on it. A
     * series built straight from a GROUP BY skips empty days, and a chart
     * drawn from that shows a busy Tuesday next to a busy Friday as if they
     * were consecutive — it misreports the shape rather than merely omitting
     * a point.
     *
     * @return list<array{date:string,created:int,resolved:int}>
     */
    public static function dailyVolume(int $days = self::WINDOW): array
    {
        $from = CarbonImmutable::today()->subDays($days - 1);

        $created = Ticket::query()
            ->where('created_at', '>=', $from)
            ->selectRaw('DATE(created_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $resolved = Ticket::query()
            ->whereNotNull('resolved_at')
            ->where('resolved_at', '>=', $from)
            ->selectRaw('DATE(resolved_at) as day, COUNT(*) as total')
            ->groupBy('day')
            ->pluck('total', 'day');

        $series = [];

        for ($i = 0; $i < $days; $i++) {
            $day = $from->addDays($i)->toDateString();
            $series[] = [
                'date' => $day,
                'created' => (int) ($created[$day] ?? 0),
                'resolved' => (int) ($resolved[$day] ?? 0),
            ];
        }

        return $series;
    }

    /** The ticket volume chart's periods, and the bucket each is drawn in. */
    public const VOLUME_PERIODS = [
        'month' => ['bucket' => 'day', 'count' => 30],
        'quarter' => ['bucket' => 'week', 'count' => 13],
        'half' => ['bucket' => 'week', 'count' => 26],
        'year' => ['bucket' => 'month', 'count' => 12],
    ];

    /**
     * Tickets opened and resolved over a period, in buckets that suit it.
     *
     * A month is thirty days, a quarter and a half year are weeks (13 and 26,
     * Monday to Sunday, the last one this week), a year is twelve calendar
     * months ending with this one. Three hundred and sixty-five daily points
     * would be a line too dense to read a spike off, and a spike is the only
     * question the chart is asked.
     *
     * Counted per day in SQL and bucketed here, so the grouping is the same
     * on every database and there is still no gap: every bucket is present,
     * empty ones as zero — the `dailyVolume` rule, one level up.
     *
     * An unknown period falls back to `month`, the catalogue's `?sort=` rule:
     * it arrives from a link, and the chart is a better answer than a 422.
     *
     * @return array{period:string,bucket:string,points:list<array{date:string,end:string,created:int,resolved:int}>}
     */
    public static function volume(string $period): array
    {
        $period = array_key_exists($period, self::VOLUME_PERIODS) ? $period : 'month';
        ['bucket' => $bucket, 'count' => $count] = self::VOLUME_PERIODS[$period];

        if ($bucket === 'day') {
            $points = array_map(fn (array $d) => [
                'date' => $d['date'], 'end' => $d['date'], 'created' => $d['created'], 'resolved' => $d['resolved'],
            ], self::dailyVolume($count));

            return ['period' => $period, 'bucket' => $bucket, 'points' => $points];
        }

        $today = CarbonImmutable::today();
        $starts = [];
        if ($bucket === 'week') {
            $first = $today->startOfWeek(CarbonImmutable::MONDAY)->subWeeks($count - 1);
            for ($i = 0; $i < $count; $i++) {
                $starts[] = $first->addWeeks($i);
            }
        } else {
            $first = $today->startOfMonth()->subMonthsNoOverflow($count - 1);
            for ($i = 0; $i < $count; $i++) {
                $starts[] = $first->addMonthsNoOverflow($i);
            }
        }

        $from = $starts[0];
        $created = self::perDay('created_at', $from);
        $resolved = self::perDay('resolved_at', $from);

        $points = [];
        foreach ($starts as $i => $start) {
            $next = $starts[$i + 1] ?? ($bucket === 'week' ? $start->addWeek() : $start->addMonthNoOverflow());
            $end = $next->subDay();
            $points[] = [
                'date' => $start->toDateString(),
                'end' => ($end->greaterThan($today) ? $today : $end)->toDateString(),
                'created' => self::sumBetween($created, $start, $next),
                'resolved' => self::sumBetween($resolved, $start, $next),
            ];
        }

        return ['period' => $period, 'bucket' => $bucket, 'points' => $points];
    }

    /** @return array<string,int> day => count, from a date onwards */
    private static function perDay(string $column, CarbonImmutable $from): array
    {
        return Ticket::query()
            ->whereNotNull($column)
            ->where($column, '>=', $from)
            ->selectRaw("DATE({$column}) as day, COUNT(*) as total")
            ->groupBy('day')
            ->pluck('total', 'day')
            ->map(fn ($n) => (int) $n)
            ->all();
    }

    /** @param array<string,int> $perDay */
    private static function sumBetween(array $perDay, CarbonImmutable $from, CarbonImmutable $before): int
    {
        $lo = $from->toDateString();
        $hi = $before->toDateString();
        $sum = 0;
        foreach ($perDay as $day => $n) {
            if ($day >= $lo && $day < $hi) {
                $sum += $n;
            }
        }

        return $sum;
    }

    /**
     * Median hours from a ticket arriving to somebody answering it.
     *
     * Median rather than mean, and it matters at this scale: one ticket
     * answered after a fortnight drags a mean of seven tickets somewhere that
     * describes none of them. `null` when nothing has been answered yet,
     * because zero would read as "instant".
     */
    public static function firstResponseHours(): ?float
    {
        return self::medianHours('first_responded_at');
    }

    /** Median hours from arriving to being resolved. */
    public static function resolutionHours(): ?float
    {
        return self::medianHours('resolved_at');
    }

    /**
     * Share of answered tickets whose first reply beat the SLA clock.
     *
     * Only tickets that have both a due date and a response can be judged, so
     * the count they were measured out of is returned alongside — a bare
     * "100%" from two tickets should not read like "100%" from two hundred.
     *
     * @return array{pct:int|null,of:int}
     */
    public static function slaFirstResponse(): array
    {
        // One aggregate rather than every judgeable ticket's two timestamps
        // to PHP: `SUM(a <= b)` counts the true rows.
        $row = DB::table('tickets')
            ->whereNotNull('due_at')
            ->whereNotNull('first_responded_at')
            ->selectRaw('COUNT(*) AS judged, SUM(first_responded_at <= due_at) AS met')
            ->first();

        $judged = (int) ($row->judged ?? 0);

        if ($judged === 0) {
            return ['pct' => null, 'of' => 0];
        }

        return [
            'pct' => (int) round(((int) ($row->met ?? 0) / $judged) * 100),
            'of' => $judged,
        ];
    }

    /**
     * New tickets this window against the one before it.
     *
     * `change` is null rather than 0 or 100 when the previous window was
     * empty: going from no tickets to some tickets is not a percentage, and
     * rendering it as +100% invents a baseline that never existed.
     *
     * @return array{current:int,previous:int,change:int|null}
     */
    public static function volumeTrend(int $days = self::WINDOW): array
    {
        $now = CarbonImmutable::today()->addDay();
        $currentFrom = $now->subDays($days);
        $previousFrom = $currentFrom->subDays($days);

        $current = Ticket::whereBetween('created_at', [$currentFrom, $now])->count();
        $previous = Ticket::whereBetween('created_at', [$previousFrom, $currentFrom])->count();

        return [
            'current' => $current,
            'previous' => $previous,
            'change' => $previous === 0 ? null : (int) round((($current - $previous) / $previous) * 100),
        ];
    }

    /**
     * Open tickets grouped by something, largest first.
     *
     * @return list<array{label:string,total:int}>
     */
    public static function openBy(string $relation): array
    {
        if ($relation === 'priority') {
            return Ticket::query()->open()
                ->selectRaw('priority as label, COUNT(*) as total')
                ->groupBy('priority')
                ->orderByDesc('total')
                ->get()
                ->map(fn ($r) => ['label' => (string) $r->label, 'total' => (int) $r->total])
                ->all();
        }

        $rows = DB::table('tickets')
            ->whereIn('status', array_map(fn (TicketStatus $s) => $s->value, TicketStatus::openStates()))
            ->selectRaw('ticket_category_id, COUNT(*) as total')
            ->groupBy('ticket_category_id')
            ->orderByDesc('total')
            ->limit(6)
            ->get();

        $names = TicketCategory::query()
            ->whereIn('id', $rows->pluck('ticket_category_id')->filter()->all())
            ->pluck('name', 'id');

        return $rows
            ->map(fn ($r) => [
                'label' => (string) ($names[$r->ticket_category_id] ?? 'Uncategorised'),
                'total' => (int) $r->total,
            ])
            ->all();
    }

    /**
     * The median of `created_at → $endColumn`, in hours, computed in SQL.
     *
     * It used to load every answered ticket's two timestamps into PHP and
     * sort them there — the whole table, on every dashboard view, growing
     * with the desk's history. One window-function query returns the one
     * or two middle rows instead: `ROW_NUMBER()` orders the gaps and
     * `COUNT(*) OVER ()` says how many there are, so an even count averages
     * the two in the middle exactly as the PHP version did. `$endColumn` is
     * a column name this class chooses, never input.
     */
    private static function medianHours(string $endColumn): ?float
    {
        $diff = "TIMESTAMPDIFF(MINUTE, created_at, {$endColumn})";

        $row = DB::selectOne(
            "SELECT AVG(gap) AS median FROM (
                SELECT {$diff} AS gap,
                       ROW_NUMBER() OVER (ORDER BY {$diff}) AS rn,
                       COUNT(*) OVER () AS n
                FROM tickets
                WHERE {$endColumn} IS NOT NULL
            ) gaps
            WHERE rn IN (FLOOR((n + 1) / 2), CEIL((n + 1) / 2))"
        );

        if ($row === null || $row->median === null) {
            return null;
        }

        return round(((float) $row->median) / 60, 1);
    }
}
