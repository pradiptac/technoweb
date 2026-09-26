<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Page;
use App\Support\ReservedSlugs;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;

/**
 * Pages. Pages here are not nested, so a child page keeps its own slug at
 * the top level and its old nested address (`/about/team/`) is redirected
 * by the redirect step. The shop's own pages — cart, checkout, my account —
 * are WooCommerce machinery rather than content, and are skipped: this site
 * has its own.
 */
class PagesStep extends ContentStep
{
    /** Pages WooCommerce creates to host its own screens, by slug. */
    private const WOO_PAGES = ['cart', 'checkout', 'my-account', 'shop'];

    public function key(): string
    {
        return 'pages';
    }

    public function label(): string
    {
        return 'Pages';
    }

    public function section(): string
    {
        return 'content';
    }

    public function mapType(): ?string
    {
        return 'page';
    }

    protected function model(): string
    {
        return Page::class;
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $slug = rawurldecode((string) ($record['slug'] ?? ''));

        if (($ctx->site()['woocommerce'] ?? false) && in_array($slug, self::WOO_PAGES, true)) {
            return Outcome::skip(self::raw($record['title'] ?? $slug), 'A WooCommerce screen; this site has its own shop, basket and account pages.');
        }

        $outcome = parent::plan($ctx, $record);

        if ($outcome->writes() && ! empty($record['parent'])) {
            $outcome->warn('Was a sub-page; pages here are not nested, and its old address is redirected.');
        }

        return $outcome;
    }

    /**
     * A page lives at `/{slug}`, so a slug the site already routes (`/blog`,
     * `/services`) or a content type's archive would hide it behind that
     * route. Those count as taken, like another page's.
     */
    protected function slugTaken(Context $ctx, array $record, string $slug): bool
    {
        return parent::slugTaken($ctx, $record, $slug)
            || ReservedSlugs::reserved($slug)
            || ContentType::query()->where('slug', $slug)->exists();
    }

    protected function fields(Context $ctx, array $record, Outcome $outcome): array
    {
        // Only on the way in: a template chosen here since (the builder, say) survives a second run.
        return $outcome->action === Outcome::CREATE ? ['template' => 'default'] : [];
    }
}
