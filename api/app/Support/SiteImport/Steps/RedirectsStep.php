<?php

namespace App\Support\SiteImport\Steps;

use App\Models\BlogPost;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Support\Import\Redirects;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\Paths;
use App\Support\WordPress\ImportMap;
use App\Support\WordPress\Outcome;
use Illuminate\Database\Eloquent\Model;

/**
 * A 301 from every imported page's old address to its new one, so the old
 * site's links and search rankings arrive with the content. Both the address
 * as the site used it (`/about.html`) and its tidy form (`/about`) are
 * redirected; the home page is not (`/` is still the home page). Never over
 * an address this site serves itself, chains shortened — `Redirects::write`,
 * shared with the WordPress import.
 */
class RedirectsStep extends Step
{
    public function key(): string
    {
        return 'redirects';
    }

    public function label(): string
    {
        return 'Redirects from old addresses';
    }

    public function applies(Context $ctx): bool
    {
        if ($ctx->dryRun && $ctx->import->wants('redirects')) {
            $ctx->report->notice('Every imported page gets a redirect from its old address, so links to the old site keep working.');
        }

        return $ctx->import->wants('redirects');
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

    /**
     * Whether this site already serves an old address. A path directly under
     * `/blog` or `/products` is taken only when a post, product or category has
     * that slug (a post's old address in that folder is the usual one to
     * redirect); anything else is `Redirects::live()`'s call.
     */
    private static function taken(string $path): bool
    {
        $segments = explode('/', trim($path, '/'));

        if (count($segments) === 2 && $segments[0] === 'blog') {
            return BlogPost::query()->where('slug', $segments[1])->exists();
        }

        if (count($segments) === 2 && $segments[0] === 'products') {
            return Product::withTrashed()->where('slug', $segments[1])->exists() || ProductCategory::query()->where('slug', $segments[1])->exists();
        }

        return Redirects::live($path);
    }

    public function finish(Context $ctx): void
    {
        $pairs = [];

        foreach (PagesStep::mapped($ctx) as $row) {
            $page = ImportMap::resolve($row);

            if (! $page instanceof Model || ! method_exists($page, 'publicPath')) {
                continue;
            }

            // `/index.html` and `/` are the same page; the old home page is still the home page here.
            $to = Paths::normalise((string) $row->source_url) === '/' ? '/' : $page->publicPath();

            foreach ([Paths::normalise((string) $row->source_url), '/'.trim(rawurldecode((string) parse_url((string) $row->source_url, PHP_URL_PATH)), '/')] as $from) {
                if ($from !== '/' && $from !== $to) {
                    $pairs[$from] = $to;
                }
            }
        }

        Redirects::write($pairs, fn (string $from, bool $created) => $ctx->report->count($this->key(), $created ? 'create' : 'update'), live: self::taken(...));
    }
}
