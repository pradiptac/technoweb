<?php

namespace App\Support\WordPress;

/**
 * What a run did, or would do: counts per step, and every reason something
 * was skipped or brought across with a loss, grouped.
 *
 * Grouped by reason rather than listed by record because that is how the
 * decisions get made: "31 downloadable products — the store delivers codes,
 * not files" is one thing to understand, not 31 rows to read. Each reason
 * keeps its first few record names so the person can go and look, and its
 * full count so nothing is understated.
 *
 * `skip` means nothing was written for that record. `warn` means it was
 * written and something about it did not come across — a coupon imported
 * without its product restriction, a page whose Elementor layout is now
 * plain HTML. Both land in `reasons`; the difference is which count goes up.
 */
final class Report
{
    private const EXAMPLES = 5;

    /** @var array<string, array{create: int, update: int, skip: int, warn: int}> */
    private array $counts = [];

    /** @var array<string, array<string, array{count: int, kind: string, examples: list<string>}>> */
    private array $reasons = [];

    /** @var list<string> */
    private array $notices = [];

    /** @param  array<string, mixed>  $state  from a previous `toArray()`, to resume a commit */
    public static function fromArray(array $state): self
    {
        $report = new self;
        $report->counts = (array) ($state['counts'] ?? []);
        $report->reasons = (array) ($state['reasons'] ?? []);
        $report->notices = array_values((array) ($state['notices'] ?? []));

        return $report;
    }

    public function count(string $step, string $action): void
    {
        $this->counts[$step] ??= ['create' => 0, 'update' => 0, 'skip' => 0, 'warn' => 0];
        $this->counts[$step][$action]++;
    }

    public function reason(string $step, string $kind, string $reason, string $label): void
    {
        $entry = $this->reasons[$step][$reason] ?? ['count' => 0, 'kind' => $kind, 'examples' => []];
        $entry['count']++;

        if (count($entry['examples']) < self::EXAMPLES && $label !== '') {
            $entry['examples'][] = mb_substr($label, 0, 120);
        }

        $this->reasons[$step][$reason] = $entry;
    }

    public function notice(string $text): void
    {
        if (! in_array($text, $this->notices, true)) {
            $this->notices[] = $text;
        }
    }

    public function record(string $step, Outcome $outcome): void
    {
        if ($outcome->action === Outcome::DELEGATED) {
            return;
        }

        $this->count($step, $outcome->action);

        if ($outcome->action === Outcome::SKIP) {
            $this->reason($step, 'skip', (string) $outcome->reason, $outcome->label);
        }

        foreach ($outcome->warnings as $warning) {
            $this->count($step, 'warn');
            $this->reason($step, 'warn', $warning, $outcome->label);
        }
    }

    /** @return array{counts: array<string, array<string, int>>, reasons: array<string, mixed>, notices: list<string>} */
    public function toArray(): array
    {
        return ['counts' => $this->counts, 'reasons' => $this->reasons, 'notices' => $this->notices];
    }

    /**
     * The shape the console reads: one row per step, each with its reasons
     * as a list, largest first.
     *
     * @param  array<string, string>  $labels  step key => heading
     * @return list<array<string, mixed>>
     */
    public function steps(array $labels): array
    {
        $rows = [];

        foreach ($labels as $key => $label) {
            if (! isset($this->counts[$key]) && ! isset($this->reasons[$key])) {
                continue;
            }

            $reasons = [];
            foreach ($this->reasons[$key] ?? [] as $reason => $entry) {
                $reasons[] = ['reason' => $reason] + $entry;
            }
            usort($reasons, fn ($a, $b) => $b['count'] <=> $a['count']);

            $rows[] = ['key' => $key, 'label' => $label]
                + ($this->counts[$key] ?? ['create' => 0, 'update' => 0, 'skip' => 0, 'warn' => 0])
                + ['reasons' => $reasons];
        }

        return $rows;
    }

    /** @return list<string> */
    public function notices(): array
    {
        return $this->notices;
    }
}
