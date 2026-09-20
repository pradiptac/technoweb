<?php

namespace App\Console\Commands;

use App\Enums\LandingPageKind;
use App\Models\LandingPage;
use App\Support\LandingPageOpportunities;
use App\Support\LandingPageQuality;
use Illuminate\Console\Command;

/**
 * Turns the combinations the catalogue supports into drafts.
 *
 * Three properties, and each is a refusal to do something a generator normally
 * does:
 *
 * **It reports by default.** `--create` is opt-in, so the first thing anybody
 * runs prints what would happen and changes nothing. A command whose default
 * is to write is one that gets run once with the wrong flag.
 *
 * **It never publishes.** Everything it makes is a draft with an empty
 * introduction, which is precisely a page `LandingPageQuality` will refuse to
 * publish until a person has written something. That is the whole safety
 * argument in one sentence: the machine proposes, and nothing it proposes can
 * reach the public site without somebody writing prose that is not a
 * near-duplicate of prose that already exists.
 *
 * **It is bounded.** `--limit` defaults to ten. Forty drafts arriving at once
 * is forty introductions somebody has to write, and the realistic outcome of
 * asking for that is forty introductions written from one template — which is
 * the exact failure this module exists to prevent, arrived at by way of the
 * tool meant to prevent it.
 */
class GenerateLandingPages extends Command
{
    protected $signature = 'technoware:landing-pages
        {--create : Actually create the drafts. Without this, nothing is written}
        {--kind= : Only one kind — brand, brand_category, brand_solution, location, service_location, solution_location}
        {--limit=10 : How many to create at most}';

    protected $description = 'Report, and optionally draft, the landing pages the catalogue supports';

    public function handle(): int
    {
        $kind = null;

        if ($raw = $this->option('kind')) {
            $kind = LandingPageKind::tryFrom($raw);

            if (! $kind) {
                $this->error("Unknown kind “{$raw}”. One of: ".implode(', ', LandingPageKind::values()));

                return self::FAILURE;
            }
        }

        $candidates = LandingPageOpportunities::find($kind);
        $skipped = LandingPageOpportunities::skippedLocations();

        if ($candidates === []) {
            $this->info('Nothing to propose — every combination the catalogue supports already has a page.');
            $this->reportSkipped($skipped);

            return self::SUCCESS;
        }

        $limit = max(1, (int) $this->option('limit'));
        $creating = (bool) $this->option('create');

        $this->newLine();
        $this->line(sprintf(
            '%d %s the catalogue supports%s',
            count($candidates),
            count($candidates) === 1 ? 'combination' : 'combinations',
            $creating ? ', creating up to '.$limit : ' (nothing will be written — pass --create)',
        ));
        $this->newLine();

        $this->table(
            ['kind', 'path', 'evidence'],
            array_map(fn (array $c) => [
                $c['kind'],
                $c['path'],
                isset($c['evidence']['products']) && $c['evidence']['products'] > 0
                    ? $c['evidence']['products'].' products'
                    : 'local detail on record',
            ], array_slice($candidates, 0, $creating ? $limit : 50)),
        );

        if (! $creating) {
            $this->reportSkipped($skipped);
            $this->newLine();
            $this->line('Re-run with --create to draft these. Every one arrives empty and stays unpublishable');
            $this->line('until somebody writes an introduction that is not a near-duplicate of another page.');

            return self::SUCCESS;
        }

        $made = 0;

        foreach (array_slice($candidates, 0, $limit) as $c) {
            LandingPage::create([
                'kind' => $c['kind'],
                'brand_id' => $c['brand_id'] ?? null,
                'product_category_id' => $c['product_category_id'] ?? null,
                'solution_id' => $c['solution_id'] ?? null,
                'service_id' => $c['service_id'] ?? null,
                'location_id' => $c['location_id'] ?? null,
                'title' => $c['title'],
                'heading' => $c['heading'],
                // Deliberately empty. See the class docblock.
                'intro' => null,
                'status' => 'draft',
                'auto_generated' => true,
                'evidence' => $c['evidence'],
            ]);
            $made++;
        }

        $this->newLine();
        $this->info("{$made} drafts created, none published.");
        $this->line('Each needs at least '.LandingPageQuality::MIN_INTRO_WORDS.' words of its own before it can go live;');
        $this->line('the console lists what each one is still missing at /admin/landing-pages.');
        $this->reportSkipped($skipped);

        return self::SUCCESS;
    }

    /**
     * Say what was passed over and why.
     *
     * "No opportunities" from a console showing three cities reads as a broken
     * feature. The answer is nearly always that nobody has written the local
     * detail yet, and saying so turns a dead end into a next step.
     */
    private function reportSkipped(array $skipped): void
    {
        if ($skipped === []) {
            return;
        }

        $this->newLine();
        $this->comment('Locations passed over:');

        foreach ($skipped as $line) {
            $this->line("  · {$line}");
        }
    }
}
