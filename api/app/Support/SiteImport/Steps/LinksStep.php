<?php

namespace App\Support\SiteImport\Steps;

use App\Models\BlogPost;
use App\Models\Page;
use App\Models\Product;
use App\Support\Import\LinkRewriter;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\Paths;
use App\Support\WordPress\ImportMap;
use App\Support\WordPress\Outcome;
use Closure;
use Illuminate\Database\Eloquent\Model;

/**
 * Links between imported pages, pointed at their new addresses: a link to
 * `https://old.example/about.html` becomes `/about`, `#fragment` kept.
 *
 * Runs in the commit only, once every page exists, over each page's sections
 * (every section `body` as markup and every `href`) with the same rewriter the
 * WordPress import uses. A link to a page of the old site that was not
 * imported stays pointing at the old site — but for an uploaded ZIP, whose
 * "site" is only a folder, it becomes the bare path, since the folder is
 * nowhere a visitor could follow it.
 */
class LinksStep extends Step
{
    public function key(): string
    {
        return 'links';
    }

    public function label(): string
    {
        return 'Links between pages';
    }

    public function records(Context $ctx): iterable
    {
        return [];
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        return Outcome::delegated('');
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void {}

    public function finish(Context $ctx): void
    {
        $paths = self::paths($ctx);
        $map = $this->mapper($ctx, $paths);

        foreach (PagesStep::mapped($ctx) as $row) {
            $page = ImportMap::resolve($row);

            // A page, a blog post or a product; nothing else is ours to rewrite.
            if (! ($page instanceof Page || $page instanceof BlogPost || $page instanceof Product)) {
                continue;
            }

            // A page edited here since it was imported is not ours to rewrite.
            $stored = $ctx->map->get(PagesStep::HASH, $row->source_id)['url'] ?? null;

            if ($stored !== null && $stored !== PagesStep::fingerprint($page)) {
                continue;
            }

            $blocks = is_array($page->blocks) ? $page->blocks : [];
            $rewritten = LinkRewriter::sections($blocks, $map);
            $changed = $rewritten !== $blocks;

            if ($changed) {
                $page->blocks = $rewritten;
            }

            // The written body a post or product keeps beside its sections.
            $column = $page instanceof BlogPost ? 'body' : ($page instanceof Product ? 'description' : null);

            if ($column !== null && filled($page->{$column}) && ($html = LinkRewriter::html((string) $page->{$column}, $map)) !== $page->{$column}) {
                $page->{$column} = $html;
                $changed = true;
            }

            if ($changed) {
                $page->save();
                $ctx->map->put(PagesStep::HASH, $row->source_id, $page, PagesStep::fingerprint($page));
                $ctx->report->count($this->key(), 'update');
            }
        }
    }

    /**
     * Every imported page's old path → its public path here.
     *
     * @return array<string, string>
     */
    public static function paths(Context $ctx): array
    {
        return $ctx->memo('old-paths', function () use ($ctx) {
            $paths = [];

            foreach (PagesStep::mapped($ctx) as $row) {
                $page = ImportMap::resolve($row);

                if ($page instanceof Model && method_exists($page, 'publicPath')) {
                    $paths[(string) $row->source_id] = $page->publicPath();
                }
            }

            return $paths;
        });
    }

    /**
     * What an `href` becomes.
     *
     * @param  array<string, string>  $paths
     * @return Closure(string): ?string
     */
    private function mapper(Context $ctx, array $paths): Closure
    {
        return function (string $href) use ($ctx, $paths): ?string {
            if (! preg_match('#^https?://#i', $href) || ! Paths::sameSite($href, $ctx->siteUrl())) {
                return null;
            }

            $old = Paths::normalise($href);
            $fragment = (string) parse_url($href, PHP_URL_FRAGMENT);

            // The old home page is still the home page here, whatever it was imported as.
            if (isset($paths[$old])) {
                return ($old === '/' ? '/' : $paths[$old]).($fragment !== '' ? '#'.$fragment : '');
            }

            return $ctx->isZip() ? $old.($fragment !== '' ? '#'.$fragment : '') : null;
        };
    }
}
