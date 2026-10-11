<?php

namespace App\Support\SiteImport;

use App\Models\SiteImport;
use App\Support\WordPress\Harvest;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * Reading a site into the harvest, and then working out what is furniture.
 *
 * Phases, each resumable from `state.json`: **crawl** (a live URL, by
 * `SiteCrawler`) or **zip** (an upload, by `ZipSource`) write every page into
 * `pages.jsonl`; **assets** (a URL import only) reads the site's own
 * stylesheets for `Brand`; **chrome** then tallies, page by page, the blocks that could
 * be the site's header, menu and footer, and when the tally is complete picks
 * the ones repeated across most pages (`Chrome`), reads the site's name out of
 * its titles, and reads the header's and footer's menus off the home page.
 * Those findings go on `analysis.site`, which every later phase reads.
 */
final class Scanner
{
    public const PAUSED = 'paused';

    public const DONE = 'done';

    public function run(SiteImport $import, ScanState $state, Harvest $harvest, CarbonImmutable $deadline): string
    {
        if ($state->phase === 'crawl' || $state->phase === 'zip') {
            $result = $import->source === 'zip'
                ? (new ZipSource)->run($import, $state, $harvest, $deadline)
                : (new SiteCrawler)->run($import, $state, $harvest, $deadline);

            if ($result === SiteCrawler::PAUSED) {
                return self::PAUSED;
            }

            if ($state->pages === 0) {
                throw new RuntimeException($this->nothing($state));
            }

            $state->phase = $import->source === 'zip' ? 'chrome' : 'assets';
        }

        if ($state->phase === 'assets') {
            if ((new StyleSheets)->run($import, $state, $harvest, $deadline) === StyleSheets::PAUSED) {
                return self::PAUSED;
            }

            $state->phase = 'chrome';
        }

        if ($state->phase === 'chrome' && $this->chrome($import, $state, $deadline) === self::PAUSED) {
            return self::PAUSED;
        }

        $state->phase = 'done';

        return self::DONE;
    }

    /** Tally the page's candidate blocks; at the end, decide. */
    private function chrome(SiteImport $import, ScanState $state, CarbonImmutable $deadline): string
    {
        $offset = (int) $state->chrome['offset'];
        $n = 0;
        $worked = false;

        foreach (Harvest::read($import, 'pages') as $page) {
            if ($n++ < $offset) {
                continue;
            }

            if ($worked && CarbonImmutable::now()->greaterThanOrEqualTo($deadline)) {
                $state->chrome['offset'] = $n - 1;

                return self::PAUSED;
            }

            $worked = true;
            $state->current = (string) $page['path'];
            $doc = PageDocument::load((string) $page['html'], (string) $page['url']);

            foreach (array_keys(Chrome::candidates($doc->body())) as $signature) {
                $state->chrome['counts'][$signature] = ($state->chrome['counts'][$signature] ?? 0) + 1;
            }

            $state->chrome['offset'] = $n;
        }

        $this->decide($import, $state);

        return self::DONE;
    }

    private function decide(SiteImport $import, ScanState $state): void
    {
        $titles = [];
        $home = null;

        foreach (Harvest::read($import, 'pages') as $page) {
            $titles[] = (string) $page['title'];

            // The home page: `/`, else the shallowest path read.
            if ($home === null || ($page['path'] === '/') || (substr_count((string) $page['path'], '/') < substr_count((string) $home['path'], '/') && $home['path'] !== '/')) {
                $home = $page;
            }
        }

        $name = SiteName::detect($titles);
        $repeated = Chrome::repeated(array_map('intval', $state->chrome['counts']), $state->pages);
        $menus = ['primary' => [], 'footer' => []];
        $removed = 0;

        if ($home !== null) {
            $doc = PageDocument::load((string) $home['html'], (string) $home['url'])->absolutise();
            $name ??= trim($doc->meta('og:site_name')) ?: null;
            $menus = Chrome::menus($doc->body(), $repeated);
            // What came off the home page: its header, menu and footer, by what they are and by what repeats.
            $removed = count(Chrome::strip($doc->body(), $repeated));
        }

        $state->site = [
            'name' => $name ?? ($home !== null ? SiteName::strip((string) $home['title'], null) : null) ?? Paths::bare($import->site_url),
            'url' => $import->site_url,
            'source' => $import->source,
            'pages' => $state->pages,
            'home_path' => $home['path'] ?? null,
            'chrome' => $repeated,
            'brand' => Brand::detect($import),
            'chrome_removed' => $removed,
            'menus' => $menus,
            'skipped' => $state->skipped,
            'notes' => $state->notes,
            'capped' => $state->capped,
        ];

        // The tally is large and has done its job.
        $state->chrome['counts'] = [];
    }

    /** Why a scan found no pages, in the site's own terms where it said anything. */
    private function nothing(ScanState $state): string
    {
        $first = array_key_first($state->skipped);

        if ($first !== null) {
            return 'No page could be read. '.$first;
        }

        return $state->phase === 'zip' || isset($state->zip['files'])
            ? 'The ZIP holds no HTML pages.'
            : 'No page could be read from that address.';
    }
}
