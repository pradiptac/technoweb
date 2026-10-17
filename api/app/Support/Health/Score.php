<?php

namespace App\Support\Health;

use App\Models\HealthFinding;
use App\Models\HealthSnapshot;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * The site-wide figure (docs/health.md "The score"): the share of published
 * checked records with no unignored error or warning finding. Null, never
 * zero, when nothing has been checked. A notice never lowers it.
 */
final class Score
{
    public const LAST_SWEEP_KEY = 'health:last_sweep_at';

    /**
     * When the last sweep finished, or null before the first. The cache key is
     * the quick answer; the newest snapshot is the lasting one, because every
     * update runs `optimize:clear`, which empties the cache.
     */
    public static function lastSweepAt(): ?string
    {
        return Cache::get(self::LAST_SWEEP_KEY)
            ?? HealthSnapshot::query()->latest('updated_at')->first()?->updated_at?->toIso8601String();
    }

    public static function now(): ?int
    {
        // Before the first sweep nothing has been checked, and "100" would claim it had.
        if (self::lastSweepAt() === null) {
            return null;
        }

        $total = 0;
        foreach (Kinds::aliases() as $alias) {
            // Every kind has a status column; Kinds::isPublished is the same rule per record.
            $total += Kinds::classFor($alias)::query()->where('status', 'published')->count();
        }

        if ($total === 0) {
            return null;
        }

        $bad = HealthFinding::query()
            ->where('subject_published', true)
            ->whereNull('ignored_at')
            ->whereIn('severity', ['error', 'warning'])
            ->distinct()
            ->count(DB::raw("concat(subject_type, ':', subject_id)"));

        $score = max(0, (int) round(100 * ($total - $bad) / $total));

        // 100% is never shown beside a problem: one bad record in a thousand rounds up to it.
        return $bad > 0 ? min($score, 99) : $score;
    }

    /**
     * @param  list<string>|null  $aliases  the caller's kinds; null for all
     * @return array<string, array<string, int>>
     */
    public static function counts(?array $aliases = null): array
    {
        $counts = array_map(fn () => array_fill_keys(array_keys(Findings::SEVERITIES), 0), Findings::GROUPS);

        HealthFinding::query()
            ->whereNull('ignored_at')
            ->when($aliases !== null, fn ($q) => $q->whereIn('subject_type', $aliases))
            ->selectRaw('`check`, severity, count(*) as n')
            ->groupBy('check', 'severity')
            ->toBase()
            ->get()
            ->each(function ($row) use (&$counts) {
                $group = Findings::CHECKS[$row->check][0] ?? null;
                if ($group !== null) {
                    $counts[$group][$row->severity] += (int) $row->n;
                }
            });

        return $counts;
    }

    public static function snapshot(): HealthSnapshot
    {
        $records = 0;
        foreach (Kinds::aliases() as $alias) {
            $records += Kinds::classFor($alias)::query()->count();
        }

        return HealthSnapshot::updateOrCreate(
            ['date' => now()->toDateString()],
            ['score' => self::now(), 'records_checked' => $records, 'counts' => self::counts()],
        );
    }
}
