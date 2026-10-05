<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Page;
use App\Support\PageSections\BodySections;
use App\Support\PageSections\SectionRules;
use App\Support\ReservedSlugs;
use App\Support\WordPress\Context;
use App\Support\WordPress\GutenbergSections;
use App\Support\WordPress\Outcome;

/**
 * Pages. Pages here are not nested, so a child page keeps its own slug at
 * the top level and its old nested address (`/about/team/`) is redirected
 * by the redirect step. The shop's own pages — cart, checkout, my account —
 * are WooCommerce machinery rather than content, and are skipped: this site
 * has its own.
 *
 * **A page arrives laid out as builder sections** (0.109.0, the review's
 * `page_layout`, default `sections`): from its WordPress blocks where it was
 * written in the block editor (`GutenbergSections`), otherwise split at its
 * headings (`BodySections`) — a classic-editor page, a page laid out by
 * Elementor, Divi or WPBakery, or one whose shortcodes only the rendered
 * HTML expands. The body is stored as well, as the fallback. `html` keeps a
 * page as one text body.
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

        if ($outcome->writes() && $ctx->decision('page_layout', 'sections') === 'sections') {
            $raw = self::blockSource($record);

            if (self::readsBlocks($record, $raw)) {
                // A dry pass over the blocks: no pictures fetched, only what would not come across.
                $probe = new GutenbergSections(fn (string $html) => $html, fn () => 'planned');
                $probe->toSections(GutenbergSections::parse($raw));

                foreach (array_unique($probe->skipped) as $block) {
                    $outcome->warn('The '.str_replace(['core/', '-'], ['', ' '], $block).' block is drawn by WordPress when the page is requested; it does not come across.');
                }
            } elseif (self::builder($record) !== null) {
                $outcome->warn('Brought in as text sections split at its headings, to arrange in the builder.');
            }
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
        $sections = $ctx->decision('page_layout', 'sections') === 'sections';

        if ($outcome->action === Outcome::CREATE) {
            $blocks = $sections ? $this->sections($ctx, $record, $outcome->label) : [];

            return $blocks !== [] ? ['template' => 'builder', 'blocks' => $blocks] : ['template' => 'default'];
        }

        // A second run lays out a page only while it is still as the import
        // left it: one text body and no sections. A template or sections
        // somebody chose here since survive.
        $existing = $outcome->data['existing'] ? Page::query()->find($outcome->data['existing']) : null;
        if ($sections && $existing && $existing->template === 'default' && empty($existing->blocks)) {
            $blocks = $this->sections($ctx, $record, $outcome->label);

            return $blocks !== [] ? ['template' => 'builder', 'blocks' => $blocks] : [];
        }

        return [];
    }

    /**
     * The page as stored sections.
     *
     * @param  array<string, mixed>  $record
     * @return list<array<string, mixed>>
     */
    private function sections(Context $ctx, array $record, string $label): array
    {
        $raw = self::blockSource($record);

        $rows = self::readsBlocks($record, $raw)
            ? (new GutenbergSections(
                fn (string $html) => self::body($ctx, $html, $label),
                fn (int|string $source) => $ctx->media($source, $label),
            ))->toSections(GutenbergSections::parse($raw))
            : BodySections::raw(self::body($ctx, self::rendered($record['content'] ?? ''), $label));

        return SectionRules::normalise($rows);
    }

    /** The block editor's source: `content.raw`, as harvested with `context=edit`. */
    private static function blockSource(array $record): string
    {
        return is_array($record['content'] ?? null) ? (string) ($record['content']['raw'] ?? '') : '';
    }

    /**
     * Whether the blocks can be read: written in the block editor, not laid
     * out by a page builder, and with no shortcode the raw blocks would show
     * as text (the rendered page expanded it; the heading split keeps that).
     */
    private static function readsBlocks(array $record, string $raw): bool
    {
        return GutenbergSections::isBlocks($raw)
            && self::builder($record) === null
            && self::shortcodes((string) preg_replace('/<!--.*?-->/s', '', $raw)) === [];
    }
}
