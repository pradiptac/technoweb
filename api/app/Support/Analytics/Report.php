<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsDaily;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Every read of native analytics (C3). Closed days from analytics_daily, today from the raw hits. */
final class Report
{
    /** @return Collection<int, array<string, mixed>> */
    public static function rows(Carbon $from, Carbon $to, ?string $dimension = null, ?string $kind = null): Collection
    {
        $tz = (string) config('app.timezone');
        $today = now()->setTimezone($tz)->toDateString();
        $f = $from->copy()->setTimezone($tz)->toDateString();
        $t = $to->copy()->setTimezone($tz)->toDateString();

        $closed = AnalyticsDaily::query()->whereBetween('day', [$f, min($t, now()->setTimezone($tz)->subDay()->toDateString())])
            ->when($dimension, fn ($q) => $q->where('dimension', $dimension))
            ->when($kind, fn ($q) => $q->where('kind', $kind))
            ->get()->map(fn (AnalyticsDaily $r) => [...$r->only(['dimension', 'key', 'kind', 'views', 'visitors', 'entries', 'bounces', 'value_paise']), 'day' => $r->day->toDateString()]);

        $live = $t >= $today && $f <= $today
            ? collect(Rollup::rows($today))->filter(fn ($r) => ($dimension === null || $r['dimension'] === $dimension) && ($kind === null || $r['kind'] === $kind))
            : collect();

        return $closed->concat($live)->values();
    }

    /** @return array<string, array{value: int|float|null, previous: int|float|null, change: float|null}> */
    public static function summary(Carbon $from, Carbon $to, string $compare): array
    {
        $now = self::totals($from, $to);
        [$pf, $pt] = self::comparison($from, $to, $compare);
        $before = $pf === null || $pt === null ? null : self::totals($pf, $pt);

        $out = [];
        foreach ($now as $key => $value) {
            $prev = $before[$key] ?? null;
            $out[$key] = ['value' => $value, 'previous' => $prev,
                'change' => $prev === null || $value === null || (float) $prev === 0.0 ? null : round(($value - $prev) / $prev * 100, 1)];
        }

        return $out;
    }

    /** @return array{views: int, visits: int, entries: int, bounce_share: ?float, views_per_visit: ?float, conversions: int, revenue_paise: int} */
    private static function totals(Carbon $from, Carbon $to): array
    {
        $rows = self::rows($from, $to, 'total');
        $pv = $rows->where('kind', 'pageview');
        $visits = (int) $pv->sum('visitors');
        $conv = $rows->whereIn('kind', Kinds::CONVERSIONS);

        return [
            'views' => (int) $pv->sum('views'),
            'visits' => $visits,
            'entries' => (int) $pv->sum('entries'),
            'bounce_share' => $visits > 0 ? round($pv->sum('bounces') / $visits * 100, 1) : null,
            'views_per_visit' => $visits > 0 ? round($pv->sum('views') / $visits, 2) : null,
            'conversions' => (int) $conv->sum('views'),
            'revenue_paise' => (int) $rows->where('kind', 'order_paid')->sum('value_paise'),
        ];
    }

    /** @return array{0: ?Carbon, 1: ?Carbon} */
    private static function comparison(Carbon $from, Carbon $to, string $compare): array
    {
        $days = (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1;

        return match ($compare) {
            'previous' => [$from->copy()->subDays($days), $from->copy()->subDay()],
            'year' => [$from->copy()->subYear(), $to->copy()->subYear()],
            default => [null, null],
        };
    }

    /** @return list<array{day: string, views: int, visitors: int}> */
    public static function series(Carbon $from, Carbon $to, string $kind = 'pageview'): array
    {
        $byDay = self::rows($from, $to, 'total', $kind)->groupBy('day');
        $out = [];
        for ($d = $from->copy()->startOfDay(); $d->lte($to); $d->addDay()) {
            $day = $d->toDateString();
            $out[] = ['day' => $day, 'views' => (int) ($byDay[$day] ?? collect())->sum('views'), 'visitors' => (int) ($byDay[$day] ?? collect())->sum('visitors')];
        }

        return $out;
    }

    /** @return list<array{key: string, label: string, views: int, visitors: int, value_paise: int}> */
    public static function breakdown(string $dimension, Carbon $from, Carbon $to, string $kind = 'pageview', int $limit = 10): array
    {
        return self::rows($from, $to, $dimension, $kind)->groupBy('key')
            ->map(fn (Collection $g, $key) => ['key' => (string) $key, 'label' => Labels::of($dimension, (string) $key),
                'views' => (int) $g->sum('views'), 'visitors' => (int) $g->sum('visitors'), 'value_paise' => (int) $g->sum('value_paise')])
            ->sortByDesc('views')->take($limit)->values()->all();
    }

    /** @return array{terms: list<array<string, mixed>>, nothing: list<array<string, mixed>>} */
    public static function search(Carbon $from, Carbon $to, ?string $scope): array
    {
        $raw = DB::table('analytics_hits')->where('kind', 'search')
            ->whereBetween('day', [$from->toDateString(), $to->toDateString()])
            ->when($scope, fn ($q) => $q->where('path', $scope === 'shop' ? '/store' : '/search'))
            ->selectRaw('target, COUNT(*) as n, MAX(results) as best')->groupBy('target')->orderByDesc('n')->limit(100)->get();

        return [
            'terms' => $raw->take(25)->map(fn ($r) => ['term' => $r->target, 'searches' => (int) $r->n, 'results' => $r->best === null ? null : (int) $r->best])->values()->all(),
            // A NULL max means the count was never recorded, not that nothing was found.
            'nothing' => $raw->filter(fn ($r) => $r->best !== null && (int) $r->best === 0)->take(25)->map(fn ($r) => ['term' => $r->target, 'searches' => (int) $r->n])->values()->all(),
        ];
    }

    /** @return array{views: int, pages: list<array{path: string, views: int}>} */
    public static function now(): array
    {
        $since = now()->subMinutes(30);
        $q = DB::table('analytics_hits')->where('kind', 'pageview')->where('at', '>=', $since);

        return ['views' => (clone $q)->count(),
            'pages' => (clone $q)->selectRaw('path, COUNT(*) as n')->groupBy('path')->orderByDesc('n')->limit(5)->get()
                ->map(fn ($r) => ['path' => (string) $r->path, 'views' => (int) $r->n])->all()];
    }

    /** The SEO overview's shape: path => {views, users} over the last $days. @return array<string, array{views: int, users: int}> */
    public static function pages(int $days = 28): array
    {
        return self::rows(now()->subDays($days - 1), now(), 'page', 'pageview')->groupBy('key')
            ->map(fn (Collection $g) => ['views' => (int) $g->sum('views'), 'users' => (int) $g->sum('visitors')])->all();
    }

    public static function productViews(Carbon $from, Carbon $to): ?int
    {
        if (! Collector::enabled()) {
            return null;
        }

        return (int) self::rows($from, $to, 'page', 'pageview')->filter(fn ($r) => str_starts_with((string) $r['key'], '/store/products/'))->sum('views');
    }
}
