<?php

namespace App\Support\WordPress\Steps;

use App\Support\Import\Redirects;
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
 * A site on "Plain" permalinks addresses its records by query — `/?p=62`,
 * `/?page_id=5`, `/?product=cap` — and those are redirected too: the old
 * address is stored in that shape (`LinksStep::normalise`) and the proxy
 * looks it up when a request for the home path carries a query.
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
            $ctx->report->notice('Every imported page, post, product and category gets a redirect from its old address, "?p=123" addresses included.');
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

        Redirects::write($pairs, fn (string $from, bool $created) => $ctx->report->count($this->key(), $created ? 'create' : 'update'), fn (string $from) => str_starts_with($from, '/wp-'));
    }
}
