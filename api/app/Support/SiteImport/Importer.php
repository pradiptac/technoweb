<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\IndexNow;
use App\Support\SiteImport\Steps\Step;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Rendered\Parts;
use App\Support\WordPress\Report;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Runs the steps: dry, for the review, and for real — both a slice at a time.
 * `WordPress\Importer`'s loop, over this import's steps.
 *
 * **The order is the dependency order**: pages before the menus that point at
 * them, everything before the links step rewrites addresses between them, the
 * redirects last. **One loop does both**: `analyse()` plans every record and
 * writes nothing — media included, which is counted rather than fetched;
 * `commit()` plans and writes, a record per transaction, one that cannot be
 * saved named in the report while the run goes on. Per-record IndexNow pings
 * are held back for the whole commit.
 */
final class Importer
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    private const CHECKPOINT = 25;

    /** @return list<Step> */
    public static function steps(): array
    {
        return [
            new Steps\PagesStep,
            new Steps\MenusStep,
            new Steps\LinksStep,
            new Steps\RedirectsStep,
        ];
    }

    /** @return array<string, string> step key => heading, in order */
    public static function labels(): array
    {
        return [
            'pages' => 'Pages',
            Context::MEDIA_STEP => 'Files and pictures',
            Parts::STEP => Parts::LABEL,
            'menus' => 'Menus',
            'links' => 'Links between pages',
            'redirects' => 'Redirects from old addresses',
        ];
    }

    public function analyse(SiteImport $import, CarbonImmutable $deadline): string
    {
        return $this->run($import, $deadline, dryRun: true);
    }

    public function commit(SiteImport $import, CarbonImmutable $deadline): string
    {
        return IndexNow::suppressed(fn () => $this->run($import, $deadline, dryRun: false));
    }

    private function run(SiteImport $import, CarbonImmutable $deadline, bool $dryRun): string
    {
        $slot = $dryRun ? 'analyse' : 'commit';
        $cursor = (array) (($import->progress ?? [])[$slot] ?? []);
        $ctx = new Context($import, $dryRun, Report::fromArray((array) ($cursor['report'] ?? [])));
        $ctx->map->restorePlanned((array) ($cursor['planned'] ?? []));
        $ctx->rows = array_values((array) ($cursor['rows'] ?? []));
        $steps = self::steps();

        for ($i = (int) ($cursor['step'] ?? 0), $offset = (int) ($cursor['offset'] ?? 0); $i < count($steps); $i++, $offset = 0) {
            $step = $steps[$i];

            if (! $step->applies($ctx)) {
                continue;
            }

            $n = 0;

            foreach ($step->records($ctx) as $record) {
                if ($n++ < $offset) {
                    continue;
                }

                if (CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                    $this->checkpoint($import, $ctx, $slot, $i, $n - 1);

                    return self::PAUSED;
                }

                $dryRun ? $this->plan($ctx, $step, $record) : $this->write($ctx, $step, $record);

                if ($n % self::CHECKPOINT === 0) {
                    $this->checkpoint($import, $ctx, $slot, $i, $n);
                }
            }

            if (! $dryRun) {
                $step->finish($ctx);
            }

            $this->checkpoint($import, $ctx, $slot, $i + 1, 0);
        }

        if ($dryRun) {
            $import->update(['analysis' => array_merge($import->analysis ?? [], [
                'steps' => $ctx->report->steps(self::labels()),
                'notices' => $ctx->report->notices(),
                'pages' => $ctx->rows,
                'decisions' => Decisions::options($ctx),
                'analysed_at' => now()->toIso8601String(),
            ])]);
        }

        return self::DONE;
    }

    /** @param  array<string, mixed>  $record */
    private function plan(Context $ctx, Step $step, array $record): void
    {
        $outcome = $step->plan($ctx, $record);

        if ($outcome->writes() && ($type = $step->mapType()) !== null) {
            $ctx->map->plan($type, $step->identity($record));
        }

        $ctx->report->record($step->key(), $outcome);
    }

    /** @param  array<string, mixed>  $record */
    private function write(Context $ctx, Step $step, array $record): void
    {
        $outcome = $step->plan($ctx, $record);

        if ($outcome->writes()) {
            try {
                DB::transaction(fn () => $step->write($ctx, $record, $outcome));
            } catch (Throwable $e) {
                report($e);
                Log::warning('A site import could not save a record', ['step' => $step->key(), 'record' => $step->identity($record), 'error' => $e->getMessage()]);
                $outcome = Outcome::skip($outcome->label, 'Could not be saved: '.mb_substr($e->getMessage(), 0, 160));
            }
        }

        $ctx->report->record($step->key(), $outcome);
    }

    private function checkpoint(SiteImport $import, Context $ctx, string $slot, int $step, int $offset): void
    {
        $cursor = ['step' => $step, 'offset' => $offset, 'report' => $ctx->report->toArray(), 'planned' => $ctx->map->planned()];

        if ($ctx->dryRun) {
            $cursor['rows'] = $ctx->rows;
        }

        $import->update(['progress' => array_merge($import->progress ?? [], [
            $slot => $cursor,
            $slot.'_step' => (self::steps()[$step] ?? null)?->label(),
        ])]);
    }

    /**
     * The commit's report, in the review's shape.
     *
     * @return array{steps: list<array<string, mixed>>, notices: list<string>}
     */
    public static function result(SiteImport $import): array
    {
        $report = Report::fromArray((array) ((($import->progress ?? [])['commit'] ?? [])['report'] ?? []));

        return ['steps' => $report->steps(self::labels()), 'notices' => $report->notices()];
    }
}
