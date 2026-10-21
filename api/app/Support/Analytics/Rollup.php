<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsDaily;
use Illuminate\Support\Facades\DB;

/** Daily totals from raw hits (C3). A day is rebuilt whole, so running it twice changes nothing. */
final class Rollup
{
    private const VISIT_DIMENSIONS = ['channel', 'source', 'campaign', 'device', 'browser', 'os', 'country'];

    /** @return list<array<string, mixed>> */
    public static function rows(string $day): array
    {
        $hits = fn () => DB::table('analytics_hits')->where('day', $day);
        $rows = [];
        $add = function (string $dimension, string $kind, iterable $groups) use ($day, &$rows) {
            foreach ($groups as $g) {
                $rows[] = ['day' => $day, 'dimension' => $dimension, 'key' => (string) ($g->k ?? ''), 'kind' => $kind,
                    'views' => (int) $g->views, 'visitors' => (int) ($g->visitors ?? 0), 'entries' => (int) ($g->entries ?? 0),
                    'bounces' => (int) ($g->bounces ?? 0), 'value_paise' => (int) ($g->value ?? 0)];
            }
        };

        // Visitors with exactly one page view that day: a bounce.
        $single = DB::table('analytics_hits')->select('visitor')->where('day', $day)->where('kind', 'pageview')
            ->groupBy('visitor')->havingRaw('COUNT(*) = 1');

        $add('total', 'pageview', $hits()->where('kind', 'pageview')->selectRaw(
            "'' as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(entry) as entries, (SELECT COUNT(*) FROM ({$single->toSql()}) s) as bounces",
            $single->getBindings(),
        )->get());
        $add('page', 'pageview', $hits()->where('kind', 'pageview')->groupBy('path')->selectRaw('path as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors')->get());
        $add('entry', 'pageview', $hits()->where('kind', 'pageview')->where('entry', true)->groupBy('path')->selectRaw(
            "path as k, COUNT(*) as views, COUNT(*) as entries, SUM(visitor IN (SELECT visitor FROM ({$single->toSql()}) s2)) as bounces",
            $single->getBindings(),
        )->get());
        foreach (self::VISIT_DIMENSIONS as $col) {
            $add($col, 'pageview', $hits()->where('kind', 'pageview')->groupBy($col)->selectRaw("COALESCE({$col}, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors")->get());
        }

        foreach ($hits()->where('kind', '!=', 'pageview')->distinct()->pluck('kind') as $kind) {
            $of = fn () => $hits()->where('kind', $kind);
            $add('total', $kind, $of()->selectRaw("'' as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            $add('target', $kind, $of()->groupBy('target')->selectRaw("COALESCE(target, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            $add('page', $kind, $of()->groupBy('path')->selectRaw("COALESCE(path, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            foreach (['channel', 'source'] as $col) {
                $add($col, $kind, $of()->groupBy($col)->selectRaw("COALESCE({$col}, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            }
        }

        return array_values(array_filter($rows, fn (array $r) => $r['views'] > 0));
    }

    public static function day(string $day): void
    {
        $rows = self::rows($day);
        DB::transaction(function () use ($day, $rows) {
            AnalyticsDaily::query()->where('day', $day)->delete();
            foreach (array_chunk($rows, 500) as $chunk) {
                AnalyticsDaily::query()->insert($chunk);
            }
        });
    }
}
