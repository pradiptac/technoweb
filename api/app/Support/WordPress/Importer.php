<?php

namespace App\Support\WordPress;

use App\Models\WordPressImport;
use App\Support\IndexNow;
use App\Support\WordPress\Steps\Step;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Runs the steps: dry, for the review, and for real — both a slice at a time.
 *
 * **The order is the dependency order.** Categories before the posts that
 * sit in them, content types and field groups before the entries and values
 * that need them, products before the orders that point at them, customers
 * before orders and reviews, everything before the links step rewrites
 * addresses between them, and the redirects last of all.
 *
 * **One loop does both.** `analyse()` plans every record and writes nothing —
 * media included, which is counted rather than downloaded; `commit()` plans
 * and writes. Both work from a cursor on `progress` (which step, how many
 * records into it, the report so far, and for a dry run what it has planned)
 * until the slice's budget runs out, so a twenty-thousand-order shop is many
 * short jobs rather than one the queue kills at ninety seconds. Each record
 * the commit writes is its own transaction: one that cannot be saved is named
 * in the report and the run goes on, `CatalogueImport`'s rule.
 *
 * Per-record IndexNow pings are held back for the whole commit
 * (`IndexNow::suppressed`).
 */
final class Importer
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    /** How often the cursor is written down, in records. */
    private const CHECKPOINT = 25;

    /** @return list<Step> */
    public static function steps(): array
    {
        return [
            new Steps\MediaLibraryStep,
            new Steps\BlogCategoriesStep,
            new Steps\ContentTypesStep,
            new Steps\FieldGroupsStep,
            new Steps\PostsStep,
            new Steps\PagesStep,
            new Steps\EntriesStep,
            new Steps\ProductCategoriesStep,
            new Steps\BrandsStep,
            new Steps\ProductsStep,
            new Steps\CustomersStep,
            new Steps\CouponsStep,
            new Steps\OrdersStep,
            new Steps\ReviewsStep,
            new Steps\CommentsStep,
            new Steps\MenusStep,
            new Steps\LinksStep,
            new Steps\RedirectsStep,
        ];
    }

    /** @return array<string, string> step key => heading, in order, media included */
    public static function labels(): array
    {
        $labels = [];

        foreach (self::steps() as $step) {
            $labels[$step->key()] = $step->label();

            if ($step->key() === 'media_library') {
                $labels[Context::MEDIA_STEP] = 'Files and pictures';
            }

            if ($step->key() === 'pages') {
                $labels[Rendered\Parts::STEP] = Rendered\Parts::LABEL;
            }
        }

        return $labels;
    }

    /** One slice of the dry run; on `DONE` the review's payload is on `analysis`. */
    public function analyse(WordPressImport $import, CarbonImmutable $deadline): string
    {
        return $this->run($import, $deadline, dryRun: true);
    }

    /** One slice of the commit. */
    public function commit(WordPressImport $import, CarbonImmutable $deadline): string
    {
        return IndexNow::suppressed(fn () => $this->run($import, $deadline, dryRun: false));
    }

    private function run(WordPressImport $import, CarbonImmutable $deadline, bool $dryRun): string
    {
        $slot = $dryRun ? 'analyse' : 'commit';
        $cursor = (array) (($import->progress ?? [])[$slot] ?? []);
        $ctx = new Context($import, $dryRun, Report::fromArray((array) ($cursor['report'] ?? [])));
        $ctx->map->restorePlanned((array) ($cursor['planned'] ?? []));
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

        if ($outcome->writes()) {
            if (($type = $step->mapType()) !== null && isset($record['id'])) {
                $ctx->map->plan($type, $record['id']);
            }

            // Counted here, fetched at commit.
            foreach ($step->media($ctx, $record) as $source) {
                $ctx->media($source, $outcome->label);
            }
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
                Log::warning('A WordPress import could not save a record', ['step' => $step->key(), 'id' => $record['id'] ?? null, 'error' => $e->getMessage()]);
                $outcome = Outcome::skip($outcome->label, 'Could not be saved: '.mb_substr($e->getMessage(), 0, 160));
            }
        }

        $ctx->report->record($step->key(), $outcome);
    }

    private function checkpoint(WordPressImport $import, Context $ctx, string $slot, int $step, int $offset): void
    {
        $cursor = ['step' => $step, 'offset' => $offset, 'report' => $ctx->report->toArray()];

        // The commit carries it too: `Parts` counts a form placed on many pages once per run.
        $cursor['planned'] = $ctx->map->planned();

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
    public static function result(WordPressImport $import): array
    {
        $report = Report::fromArray((array) ((($import->progress ?? [])['commit'] ?? [])['report'] ?? []));

        return ['steps' => $report->steps(self::labels()), 'notices' => $report->notices()];
    }
}
