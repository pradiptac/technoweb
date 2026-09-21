<?php

namespace App\Support\Seo;

/**
 * The arithmetic a rubric score shares: a check declares whether it applies,
 * what it weighs and whether it passed, and the score is earned weight over
 * applicable weight.
 *
 * Extracted from `SeoScore` on 2026-09-21 so `AeoScore` and `GeoScore` could
 * be the same shape without being the same code copied twice. `SeoScore`'s
 * output did not change: it still adds its own `issues` list on top, which
 * is a question only that score answers.
 *
 * A class using this declares `LABELS` — key to badge text — and calls
 * `check()` per rule and `tally()` once. Scoring over what *applies* is the
 * whole design (see `SeoScore`'s docblock): a check that cannot apply to a
 * record is left out of the divisor, so a score is a grade and not a count.
 */
trait ScoresChecks
{
    public static function band(int $value): string
    {
        return match (true) {
            $value >= 80 => 'good',
            $value >= 50 => 'fair',
            default => 'poor',
        };
    }

    /**
     * @return array{key: string, group: string, weight: int, applicable: bool, passed: bool, hint: string, issue: bool}
     */
    protected static function check(
        string $key, string $group, int $weight, bool $applicable, bool $passed, string $hint, ?bool $issue = null,
    ): array {
        $issue ??= in_array($key, static::alwaysAnIssue(), true);

        return compact('key', 'group', 'weight', 'applicable', 'passed', 'hint', 'issue');
    }

    /**
     * Which failed checks count as an issue as well as a lost mark. The AEO
     * and GEO scores have none: a missing definition is a gap, not a fault.
     *
     * @return array<int, string>
     */
    protected static function alwaysAnIssue(): array
    {
        return [];
    }

    /**
     * Earned weight over applicable weight.
     *
     * A record with nothing applicable cannot arise — several checks always
     * apply — but the guard is here rather than a division by zero waiting for
     * the entity that manages it.
     *
     * @param  array<int, array{key: string, group: string, weight: int, applicable: bool, passed: bool, hint: string, issue: bool}>  $checks
     * @return array{value: int, band: string, passed: int, checked: int, failed: array<int, array{key: string, group: string, label: string, weight: int, hint: string}>, issues: array<int, string>}
     */
    protected static function tally(array $checks): array
    {
        $applicable = array_values(array_filter($checks, fn ($c) => $c['applicable']));
        $possible = array_sum(array_column($applicable, 'weight'));
        $earned = array_sum(array_map(fn ($c) => $c['passed'] ? $c['weight'] : 0, $applicable));

        $value = $possible > 0 ? (int) round(100 * $earned / $possible) : 100;
        $failed = array_values(array_filter($applicable, fn ($c) => ! $c['passed']));

        return [
            'value' => $value,
            'band' => self::band($value),
            'passed' => count($applicable) - count($failed),
            'checked' => count($applicable),
            'failed' => array_map(fn ($c) => [
                'key' => $c['key'],
                'group' => $c['group'],
                'label' => static::LABELS[$c['key']],
                'weight' => $c['weight'],
                'hint' => $c['hint'],
            ], $failed),
            'issues' => array_values(array_map(
                fn ($c) => static::LABELS[$c['key']],
                array_filter($failed, fn ($c) => $c['issue']),
            )),
        ];
    }
}
