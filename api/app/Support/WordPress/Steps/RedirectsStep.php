<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Page;
use App\Models\Redirect;
use App\Support\ReservedSlugs;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;

/**
 * A 301 from every imported record's old address to its new one, so the
 * old site's links and search rankings arrive with the content.
 *
 * Written from the map: a post at `/2024/05/cabling-guide/` becomes
 * `/blog/cabling-guide`, a product at `/product/cbs350/` becomes
 * `/store/products/cbs350`, a shop category at `/product-category/switches/`
 * becomes `/store/categories/switches`, and the shop's front page `/shop`
 * becomes `/store`. An address that is already the same here needs nothing.
 *
 * **Never over a live address.** A redirect is looked up before a page is
 * rendered, so one from `/about` would take visitors away from a real page
 * called About. An old path whose first segment is a route this site has, a
 * CMS page or a content type's archive is left alone. Chains are
 * shortened the way `ContentType::moveSlug` shortens them, and a redirect
 * that would point at itself is removed.
 *
 * `?p=123`-style addresses cannot be redirected: the proxy matches paths,
 * and the query string is not part of one. The review says so once.
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

    public function section(): string
    {
        return 'content';
    }

    public function applies(Context $ctx): bool
    {
        if ($ctx->dryRun) {
            $ctx->report->notice('Every imported page, post, product and category gets a redirect from its old address. Old "?p=123" links cannot be redirected.');
        }

        return true;
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
        $pairs = LinksStep::paths($ctx);

        if (($ctx->site()['woocommerce'] ?? false) && $ctx->import->wants('catalogue')) {
            $pairs['/shop'] = '/store';
        }

        foreach ($pairs as $from => $to) {
            if ($from === $to || str_starts_with($from, '/wp-') || $this->live($from)) {
                continue;
            }

            $from = mb_substr($from, 0, 255);

            // Anything already pointing at the old address now points at the new one.
            Redirect::query()->where('to_path', $from)->update(['to_path' => $to]);

            $redirect = Redirect::query()->updateOrCreate(
                ['from_path' => $from],
                ['to_path' => $to, 'status_code' => 301, 'is_active' => true, 'created_automatically' => true],
            );

            $ctx->report->count($this->key(), $redirect->wasRecentlyCreated ? 'create' : 'update');
        }

        Redirect::query()->whereColumn('from_path', 'to_path')->delete();
    }

    /** Whether an old path collides with something this site serves itself. */
    private function live(string $path): bool
    {
        $first = explode('/', ltrim($path, '/'))[0];

        return ReservedSlugs::reserved($first)
            || ($first === ltrim($path, '/') && Page::query()->where('slug', $first)->exists())
            || ContentType::query()->where('slug', $first)->exists() && substr_count($path, '/') === 1;
    }
}
