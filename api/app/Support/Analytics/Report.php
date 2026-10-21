<?php

namespace App\Support\Analytics;

use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Every read of native analytics (C3). Closed days from analytics_daily, today from the raw hits. */
final class Report
{
    /**
     * Closed days are summed by the database per (dimension, key, kind) — or per day too, for a series — and today's rows
     * from the raw hits are appended: a caller that groups by key sums the two halves itself.
     *
     * @param  string|list<string>|null  $kind
     * @return Collection<int, array<string, mixed>>
     */
    public static function rows(Carbon $from, Carbon $to, ?string $dimension = null, string|array|null $kind = null, bool $perDay = false): Collection
    {
        $kinds = $kind === null ? null : (array) $kind;
        $tz = (string) config('app.timezone');
        $today = now()->setTimezone($tz)->toDateString();
        $f = $from->copy()->setTimezone($tz)->toDateString();
        $t = $to->copy()->setTimezone($tz)->toDateString();

        $closed = DB::table('analytics_daily')->whereBetween('day', [$f, min($t, now()->setTimezone($tz)->subDay()->toDateString())])
            ->when($dimension, fn ($q) => $q->where('dimension', $dimension))
            ->when($kinds, fn ($q) => $q->whereIn('kind', $kinds))
            ->groupBy(...($perDay ? ['day', 'dimension', 'key', 'kind'] : ['dimension', 'key', 'kind']))
            ->selectRaw(($perDay ? 'day, ' : '').'dimension, `key`, kind, SUM(views) as views, SUM(visitors) as visitors, SUM(entries) as entries, SUM(bounces) as bounces, SUM(value_paise) as value_paise')
            ->get()->map(fn ($r) => [
                'dimension' => $r->dimension, 'key' => $r->key, 'kind' => $r->kind, 'views' => (int) $r->views, 'visitors' => (int) $r->visitors,
                'entries' => (int) $r->entries, 'bounces' => (int) $r->bounces, 'value_paise' => (int) $r->value_paise,
                ...($perDay ? ['day' => Carbon::parse($r->day)->toDateString()] : []),
            ]);

        $live = $t >= $today && $f <= $today
            ? collect(Rollup::rows($today))->filter(fn ($r) => ($dimension === null || $r['dimension'] === $dimension) && ($kinds === null || in_array($r['kind'], $kinds, true)))
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
        $conv = $rows->whereIn('kind', Kinds::COUNTED);

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
        $byDay = self::rows($from, $to, 'total', $kind, true)->groupBy('day');
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
        // `conversions` is every counted conversion kind at once.
        return self::rows($from, $to, $dimension, $kind === 'conversions' ? Kinds::COUNTED : $kind)->groupBy('key')
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
        // Yesterday covers the thirty minutes across midnight, and lets the (day, kind) index do the work.
        $q = DB::table('analytics_hits')->where('day', '>=', now()->setTimezone((string) config('app.timezone'))->subDay()->toDateString())
            ->where('kind', 'pageview')->where('at', '>=', $since);

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
