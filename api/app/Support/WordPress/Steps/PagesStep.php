<?php

namespace App\Support\WordPress\Steps;

use App\Models\ContentType;
use App\Models\Page;
use App\Support\PageSections\SectionRules;
use App\Support\ReservedSlugs;
use App\Support\WordPress\Context;
use App\Support\WordPress\GutenbergSections;
use App\Support\WordPress\Outcome;
use App\Support\WordPress\Rendered\Parts;
use App\Support\WordPress\Rendered\RenderedSections;

/**
 * Pages. Pages here are not nested, so a child page keeps its own slug at
 * the top level and its old nested address (`/about/team/`) is redirected
 * by the redirect step. The shop's own pages — cart, checkout, my account —
 * are WooCommerce machinery rather than content, and are skipped: this site
 * has its own.
 *
 * **A page arrives laid out as builder sections** (0.109.0, the review's
 * `page_layout`, default `sections`): from its WordPress blocks where it was
 * written in the block editor (`GutenbergSections`), otherwise from its
 * rendered HTML (`RenderedSections`) — a classic-editor page, a page laid
 * out by Elementor, Divi or WPBakery, or one whose shortcodes only the
 * rendered HTML expands. Either way the widgets a page builder drew — a
 * form, a price table, a gallery, counters, an accordion — are recognised
 * and become their own sections (0.110.0); the form, the pricing block and
 * the gallery are records of their own (`Parts`). The body is stored as
 * well, as the fallback. `html` keeps a page as one text body.
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

        if ($outcome->writes() && $ctx->decision('page_layout', 'sections') === 'sections' && $this->laysOut($outcome)) {
            // A dry pass: nothing fetched or created, the parts counted, and what would not come across named.
            $parts = $this->layout($ctx, $record, $outcome->label, writes: false)[1];

            foreach (array_unique($this->skipped) as $block) {
                $outcome->warn('The '.str_replace(['core/', '-'], ['', ' '], $block).' block is drawn by WordPress when the page is requested; it does not come across.');
            }

            if (($builder = self::builder($record)) !== null) {
                $outcome->warnings = array_values(array_filter($outcome->warnings, fn (string $w) => ! str_starts_with($w, 'Laid out with ')));
                $outcome->warn("Laid out with {$builder}: its widgets were read into sections; check the arrangement in the builder.");
            }

            // A form shortcode is not lost when its form came across.
            if (($parts->found['form'] ?? 0) > 0) {
                $outcome->warnings = array_values(array_filter($outcome->warnings, fn (string $w) => ! preg_match('/^Uses the \[[^\]]*form[^\]]*\] shortcode/i', $w)));
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
            $blocks = $sections ? $this->layout($ctx, $record, $outcome->label, writes: true)[0] : [];

            return $blocks !== [] ? ['template' => 'builder', 'blocks' => $blocks] : ['template' => 'default'];
        }

        if ($sections && $this->laysOut($outcome)) {
            $blocks = $this->layout($ctx, $record, $outcome->label, writes: true)[0];

            return $blocks !== [] ? ['template' => 'builder', 'blocks' => $blocks] : [];
        }

        return [];
    }

    /**
     * Whether this run lays the page out: always a new one, and on a second
     * run only a page still as the import left it — one text body and no
     * sections. A template or sections somebody chose here since survive.
     */
    private function laysOut(Outcome $outcome): bool
    {
        if ($outcome->action === Outcome::CREATE || ! $outcome->data['existing']) {
            return true;
        }
        $existing = Page::query()->find($outcome->data['existing']);

        return $existing !== null && $existing->template === 'default' && empty($existing->blocks);
    }

    /** @var list<string> the blocks the last layout could not bring */
    private array $skipped = [];

    /**
     * The page as stored sections, and the parts it holds.
     *
     * Planning (`writes: false`) fetches nothing and creates nothing: markup
     * is left as it is, a picture is "planned", and `Parts` only counts.
     *
     * @param  array<string, mixed>  $record
     * @return array{0: list<array<string, mixed>>, 1: Parts}
     */
    private function layout(Context $ctx, array $record, string $label, bool $writes): array
    {
        $parts = new Parts($ctx, (string) ($record['id'] ?? $label), $label, $writes);
        $body = $writes ? fn (string $html) => self::body($ctx, $html, $label) : fn (string $html) => $html;
        $media = $writes ? fn (int|string $source) => $ctx->media($source, $label) : fn () => 'planned';
        $rendered = new RenderedSections($body, $media, $parts);
        $html = self::rendered($record['content'] ?? '');
        $raw = self::blockSource($record);
        $this->skipped = [];

        if (self::readsBlocks($record, $raw)) {
            $forms = RenderedSections::forms($html);
            $nextForm = function () use (&$forms, $rendered): array {
                $piece = array_shift($forms);

                return $piece === null ? [] : $rendered->rows([$piece]);
            };
            $gutenberg = new GutenbergSections($body, $media, $rendered, $nextForm);
            $rows = $gutenberg->toSections(GutenbergSections::parse($raw));
            $this->skipped = $gutenberg->skipped;
        } else {
            $rows = $rendered->toSections($html);
        }

        return [SectionRules::normalise($rows), $parts];
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
