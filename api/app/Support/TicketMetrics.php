<?php

namespace App\Support;

use App\Models\Ticket;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

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
        return self::medianHours(
            Ticket::query()->whereNotNull('first_responded_at')
                ->get(['created_at', 'first_responded_at'])
                ->map(fn (Ticket $t) => $t->created_at->diffInMinutes($t->first_responded_at))
        );
    }

    /** Median hours from arriving to being resolved. */
    public static function resolutionHours(): ?float
    {
        return self::medianHours(
            Ticket::query()->whereNotNull('resolved_at')
                ->get(['created_at', 'resolved_at'])
                ->map(fn (Ticket $t) => $t->created_at->diffInMinutes($t->resolved_at))
        );
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
        $judgeable = Ticket::query()
            ->whereNotNull('due_at')
            ->whereNotNull('first_responded_at')
            ->get(['due_at', 'first_responded_at']);

        if ($judgeable->isEmpty()) {
            return ['pct' => null, 'of' => 0];
        }

        $met = $judgeable->filter(fn (Ticket $t) => $t->first_responded_at->lte($t->due_at))->count();

        return [
            'pct' => (int) round(($met / $judgeable->count()) * 100),
            'of' => $judgeable->count(),
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

        return Ticket::query()->open()
            ->with('category')
            ->get()
            ->groupBy(fn (Ticket $t) => $t->category?->name ?? 'Uncategorised')
            ->map->count()
            ->sortDesc()
            ->take(6)
            ->map(fn (int $total, string $label) => ['label' => $label, 'total' => $total])
            ->values()
            ->all();
    }

    /** @param Collection<int,int> $minutes */
    private static function medianHours(Collection $minutes): ?float
    {
        if ($minutes->isEmpty()) {
            return null;
        }

        $sorted = $minutes->sort()->values();
        $count = $sorted->count();
        $middle = intdiv($count, 2);

        $median = $count % 2 === 1
            ? $sorted[$middle]
            : ($sorted[$middle - 1] + $sorted[$middle]) / 2;

        return round($median / 60, 1);
    }
}
