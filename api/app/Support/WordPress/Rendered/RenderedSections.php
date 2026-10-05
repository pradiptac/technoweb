<?php

namespace App\Support\WordPress\Rendered;

use App\Enums\PageSectionType;
use App\Support\PageSections\BodySections;
use App\Support\PageSections\SectionRules;
use App\Support\WordPress\Rendered\Recognisers as R;
use Closure;
use DOMElement;
use DOMText;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * A rendered WordPress page as builder sections (0.110.0,
 * `docs/wordpress-import.md`, "What the import recognises").
 *
 * The rendered HTML is what every page builder leaves behind: Elementor's
 * widgets, Divi's modules, WPBakery's rows, Spectra's, Kadence's and
 * Stackable's blocks, the core blocks — and every shortcode expanded, so a
 * form is a real `<form>`. `pieces()` walks it: each element is offered to
 * the recognisers (`recognisers()`), and the first to claim it answers a
 * piece — a form, a price table, a counter. An element nobody claims is
 * looked inside if it is only a wrapper, and kept as text if it is not.
 *
 * **Neighbours of one kind are one section** (`Piece::MERGES`): three price
 * tables in three columns are one pricing block, four counters one figures
 * section. A heading just before a piece becomes its heading, and a short
 * line above that heading its kicker. Everything else gathers into text
 * sections, a new one at each `<h1>`/`<h2>`, as `BodySections` splits a body.
 *
 * `rows()` turns pieces into sections. Each must pass its section's rules
 * (`SectionRules::for()`); one that does not — a timeline of one milestone,
 * a form whose fields this site cannot hold — is kept as its markup in a
 * text section instead, so nothing is lost and nothing invalid is stored.
 * A form, a pricing block and a gallery are records of their own, made by
 * `Parts`; without one, they stay text.
 */
final class RenderedSections
{
    /** Kinds a heading just above them becomes the heading of. */
    private const TAKE_HEADING = ['pricing', 'gallery', 'form', 'features', 'figures', 'bars', 'faq', 'tabs', 'checklist', 'timeline', 'steps', 'testimonial', 'video'];

    /** Kinds whose section has a kicker over its heading. */
    private const TAKE_KICKER = ['features', 'figures', 'bars', 'tabs', 'checklist', 'timeline', 'steps', 'testimonial'];

    /** Wrapper elements: looked inside, never kept whole. */
    private const WRAPPERS = ['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'center'];

    /** Left out when nothing recognised them: a search box, a menu, a lone button. */
    private const DROP = ['form', 'nav', 'button', 'input', 'select', 'textarea', 'label'];

    /** @var list<Recogniser> */
    private array $recognisers;

    /** @var list<Piece> */
    private array $pieces = [];

    private string $pending = '';

    private ?string $sectionHeading = null;

    /** @var array{text: string, html: ?string}|null the last thing gathered, when it was a heading */
    private ?array $lastHeading = null;

    /** @var array{text: string, html: string}|null a short line above the current heading */
    private ?array $kicker = null;

    /**
     * @param  Closure(string): ?string  $body  markup → cleaned markup
     * @param  Closure(string): ?string  $media  a picture's address → library path
     */
    public function __construct(private Closure $body, private Closure $media, private ?Parts $parts = null)
    {
        $this->recognisers = self::recognisers();
    }

    /** @return list<Recogniser> in the order they are asked */
    public static function recognisers(): array
    {
        return [
            new R\FormRecogniser,
            new R\TabsRecogniser,
            new R\GalleryRecogniser,
            new R\PricingRecogniser,
            new R\HeroRecogniser,
            new R\VideoRecogniser,
            new R\DividerRecogniser,
            new R\CtaRecogniser,
            new R\TestimonialRecogniser,
            new R\FaqRecogniser,
            new R\CounterRecogniser,
            new R\ProgressRecogniser,
            new R\FeatureRecogniser,
            new R\ChecklistRecogniser,
            new R\TimelineRecogniser,
            new R\StepsRecogniser,
        ];
    }

    /**
     * The page as sections, as `{id, type, hidden, data}` rows (not yet normalised).
     *
     * @return list<array<string, mixed>>
     */
    public function toSections(string $html): array
    {
        return BodySections::cap(self::trimDividers($this->rows($this->pieces($html))));
    }

    /**
     * What the markup holds, in order.
     *
     * @param  bool  $mayOpen  whether this markup starts the page, so a cover may be its hero
     * @return list<Piece>
     */
    public function pieces(string $html, bool $mayOpen = true): array
    {
        $this->pieces = [];
        $this->pending = '';
        $this->sectionHeading = null;
        $this->lastHeading = null;
        $this->kicker = null;

        if (trim($html) !== '') {
            $this->walk(Dom::load($html), $mayOpen);
        }
        $this->flushText();

        return $this->pieces;
    }

    /**
     * The forms on a rendered page, in order — for a block-editor page whose
     * form block saved nothing but its id.
     *
     * @return list<Piece>
     */
    public static function forms(string $html): array
    {
        if (trim($html) === '' || ! str_contains($html, '<form')) {
            return [];
        }

        $found = [];
        $recogniser = new R\FormRecogniser;
        $visit = function (DOMElement $el) use (&$visit, &$found, $recogniser) {
            if ($piece = $recogniser->claim($el, false)) {
                $found[] = $piece;

                return;
            }
            foreach (Dom::children($el) as $child) {
                $visit($child);
            }
        };
        $visit(Dom::load($html));

        return $found;
    }

    /** Whether any piece is something other than text. */
    public static function recognised(array $pieces): bool
    {
        foreach ($pieces as $piece) {
            if ($piece->kind !== 'text') {
                return true;
            }
        }

        return false;
    }

    // ── the walk ───────────────────────────────────────────────────────

    private function walk(DOMElement $parent, bool $mayOpen): void
    {
        foreach (iterator_to_array($parent->childNodes) as $node) {
            if ($node instanceof DOMText) {
                if (trim($node->data) !== '') {
                    $this->append(e(trim($node->data)));
                }

                continue;
            }
            if (! $node instanceof DOMElement || Dom::hidden($node)) {
                continue;
            }

            $opening = $mayOpen && $this->pieces === [] && $this->sectionHeading === null && ! self::meaningful($this->pending);
            foreach ($this->recognisers as $recogniser) {
                if ($piece = $recogniser->claim($node, $opening)) {
                    $this->push($piece);

                    continue 2;
                }
            }

            $tag = strtolower($node->tagName);
            if (in_array($tag, self::DROP, true)) {
                continue;
            }
            if (preg_match('/^h([1-6])$/', $tag, $m)) {
                $this->heading($node, (int) $m[1]);

                continue;
            }

            if ((in_array($tag, self::WRAPPERS, true) && Dom::children($node) !== [] && ! self::ownText($node)) || $this->listOfWidgets($node)) {
                $this->walk($node, $mayOpen);

                continue;
            }

            $this->append(Dom::html($node));
        }
    }

    private function heading(DOMElement $el, int $level): void
    {
        $text = Dom::text($el);
        if ($text === '') {
            return;
        }

        if ($level > 2) {
            $this->append(Dom::html($el));
            $this->lastHeading = ['text' => $text, 'html' => Dom::html($el)];

            return;
        }

        // A short line straight above a heading is its kicker, not a section of its own.
        $kicker = null;
        if ($this->lastHeading !== null && $this->lastHeading['html'] !== null && trim($this->pending) === trim($this->lastHeading['html']) && mb_strlen($this->lastHeading['text']) <= 60) {
            $kicker = ['text' => $this->lastHeading['text'], 'html' => $this->lastHeading['html']];
            $this->pending = '';
        } elseif ($this->pending !== '' && preg_match('#^\s*<p\b[^>]*>(.*?)</p>\s*$#is', $this->pending, $m) && mb_strlen($line = trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES))) <= 40 && $line !== '') {
            $kicker = ['text' => $line, 'html' => $this->pending];
            $this->pending = '';
        }

        $this->flushText();
        $this->kicker = $kicker;
        $this->sectionHeading = $text;
        $this->lastHeading = ['text' => $text, 'html' => null];
    }

    private function append(string $html): void
    {
        $this->pending .= $html;
        $this->lastHeading = null;
    }

    private function push(Piece $piece): void
    {
        if ($piece->heading === null && $this->lastHeading !== null && in_array($piece->kind, self::TAKE_HEADING, true)) {
            $piece->heading = $this->lastHeading['text'];
            if ($this->lastHeading['html'] === null) {
                $this->sectionHeading = null;
                if ($this->kicker !== null && in_array($piece->kind, self::TAKE_KICKER, true)) {
                    $piece->data['kicker'] = mb_substr($this->kicker['text'], 0, 80);
                    $this->kicker = null;
                }
            } else {
                $this->pending = (string) substr($this->pending, 0, -strlen($this->lastHeading['html']));
            }
            $this->lastHeading = null;
        }

        $last = $this->pieces === [] ? null : $this->pieces[count($this->pieces) - 1];
        if ($last !== null && $this->sectionHeading === null && ! self::meaningful($this->pending) && $this->kicker === null && $last->joins($piece)) {
            $last->absorb($piece);
            $this->pending = '';

            return;
        }

        $this->flushText();
        $this->pieces[] = $piece;
    }

    private function flushText(): void
    {
        $html = ($this->kicker['html'] ?? '').$this->pending;

        if (self::meaningful($html)) {
            $this->pieces[] = new Piece('text', heading: $this->sectionHeading, html: $html);
        } elseif ($this->sectionHeading !== null) {
            $this->pieces[] = new Piece('text', heading: $this->sectionHeading);
        }

        $this->pending = '';
        $this->sectionHeading = null;
        $this->lastHeading = null;
        $this->kicker = null;
    }

    // ── pieces into sections ───────────────────────────────────────────

    /**
     * @param  list<Piece>  $pieces
     * @return list<array<string, mixed>>
     */
    public function rows(array $pieces): array
    {
        $rows = [];
        foreach ($pieces as $piece) {
            $made = $piece->kind === 'text' ? $this->text($piece->heading, $piece->html) : $this->sections($piece);
            if ($made === null) {
                // Not a section after all: kept as the markup it was.
                $made = $this->text($piece->heading, $piece->html);
            }
            array_push($rows, ...$made);
        }

        return $rows;
    }

    /** @return list<array<string, mixed>>|null */
    private function sections(Piece $piece): ?array
    {
        $heading = $piece->heading !== null ? Str::limit($piece->heading, 157, '…') : null;
        $kicker = $piece->data['kicker'] ?? null;
        $d = $piece->data;

        $rows = match ($piece->kind) {
            'hero' => [self::row('hero', array_filter([
                'heading' => $d['heading'],
                'lede' => $d['lede'] ?? null,
                ...(($path = isset($d['image']) ? ($this->media)((string) $d['image']) : null) !== null
                    ? ['layout' => 'cover', 'image_path' => $path]
                    : ['layout' => 'centered']),
                'primary' => $d['primary'] ?? null,
                'secondary' => $d['secondary'] ?? null,
            ]))],
            'video' => [self::row('video', array_filter(['heading' => $heading, 'source' => 'youtube', 'youtube' => $d['youtube'], 'caption' => $d['caption'] ?? null]))],
            'divider' => [self::row('divider', ['size' => 'medium', 'rule' => true])],
            'cta' => [self::row('cta', array_filter(['heading' => $d['heading'], 'lede' => $d['lede'] ?? null, 'tone' => 'brand', 'primary' => $d['primary'] ?? null, 'secondary' => $d['secondary'] ?? null]))],
            'testimonial' => $this->testimonials($piece->items, $heading, $kicker),
            'figures' => array_map(fn (array $items, int $i) => self::row('stats', array_filter([
                'kicker' => $i === 0 ? $kicker : null,
                'heading' => $i === 0 ? $heading : null,
                'display' => 'figures',
                'columns' => count($items) > 1 ? min(4, max(2, count($items) === 5 || count($items) === 6 ? 3 : count($items))) : null,
                'items' => $items,
            ])), $chunks = array_chunk($piece->items, 8), array_keys($chunks)),
            'bars' => array_map(fn (array $items, int $i) => self::row('stats', array_filter([
                'kicker' => $i === 0 ? $kicker : null,
                'heading' => $i === 0 ? $heading : null,
                'display' => 'bars',
                'items' => $items,
            ])), $chunks = array_chunk($piece->items, 8), array_keys($chunks)),
            'faq' => array_map(fn (array $items, int $i) => self::row('faq', array_filter(['heading' => $i === 0 ? $heading : null, 'source' => 'custom', 'items' => $items])), $chunks = array_chunk($piece->items, 30), array_keys($chunks)),
            'features' => array_map(fn (array $items, int $i) => self::row('features', array_filter([
                'kicker' => $i === 0 ? $kicker : null,
                'heading' => $i === 0 ? $heading : null,
                'columns' => count($items) > 1 ? self::columns(count($items)) : null,
                'items' => $items,
            ])), $chunks = array_chunk($piece->items, 12), array_keys($chunks)),
            'checklist' => array_map(fn (array $items, int $i) => self::row('checklist', array_filter([
                'kicker' => $i === 0 ? $kicker : null,
                'heading' => $i === 0 ? $heading : null,
                'columns' => count($items) >= 8 ? 2 : 1,
                'items' => $items,
            ])), $chunks = array_chunk($piece->items, 24), array_keys($chunks)),
            'timeline' => array_map(fn (array $items, int $i) => self::row('timeline', array_filter(['kicker' => $i === 0 ? $kicker : null, 'heading' => $i === 0 ? $heading : null, 'items' => $items])), $chunks = array_chunk($piece->items, 12), array_keys($chunks)),
            'steps' => array_map(fn (array $items, int $i) => self::row('steps', array_filter([
                'kicker' => $i === 0 ? $kicker : null,
                'heading' => $i === 0 ? $heading : null,
                'layout' => count($items) <= 4 ? 'horizontal' : 'vertical',
                'items' => $items,
            ])), $chunks = array_chunk($piece->items, 8), array_keys($chunks)),
            'tabs' => [self::row('tabs', array_filter([
                'kicker' => $kicker,
                'heading' => $heading,
                'items' => array_map(fn (array $tab) => array_filter([
                    'label' => $tab['label'],
                    'heading' => $tab['heading'] ?? null,
                    'body' => $tab['body'],
                    'image_path' => isset($tab['image']) ? ($this->media)((string) $tab['image']) : null,
                ]), $piece->items),
            ]))],
            'pricing' => $this->parts === null ? null : $this->pricing($piece->items, $heading),
            'gallery' => $this->parts === null ? null : (($id = $this->parts->gallery($piece->items, $heading, $this->media)) === null ? null : [self::row('gallery', array_filter(['heading' => $heading, 'gallery_id' => $id], fn ($v) => $v !== null))]),
            'form' => $this->parts === null ? null : [self::row('form', array_filter(['heading' => $heading, 'form_id' => $this->parts->form($piece->data, $heading)], fn ($v) => $v !== null))],
            default => null,
        };

        if ($rows === null || $rows === []) {
            return null;
        }
        foreach ($rows as $row) {
            if (! self::valid($row)) {
                return null;
            }
        }

        return $rows;
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<array<string, mixed>>
     */
    private function testimonials(array $items, ?string $heading, ?string $kicker): array
    {
        $photo = fn (array $item) => isset($item['photo']) ? ($this->media)((string) $item['photo']) : null;

        if (count($items) === 1) {
            $item = $items[0];
            $quote = self::row('testimonial', array_filter(['quote' => $item['quote'], 'name' => $item['name'], 'role' => $item['role'] ?? null, 'photo_path' => $photo($item)]));

            return $heading !== null ? [BodySections::section(null, '<h2>'.e($heading).'</h2>'), $quote] : [$quote];
        }

        return array_map(fn (array $chunk, int $i) => self::row('testimonials', array_filter([
            'kicker' => $i === 0 ? $kicker : null,
            'heading' => $i === 0 ? $heading : null,
            'items' => array_map(fn (array $item) => array_filter([
                'quote' => Str::limit((string) $item['quote'], 597, '…'),
                'name' => $item['name'],
                'role' => $item['role'] ?? null,
                'photo_path' => $photo($item),
            ]), $chunk),
        ])), $chunks = array_chunk($items, 9), array_keys($chunks));
    }

    /**
     * Plans four at a time, each four a pricing block.
     *
     * @param  list<array<string, mixed>>  $plans
     * @return list<array<string, mixed>>|null
     */
    private function pricing(array $plans, ?string $heading): ?array
    {
        $rows = [];
        foreach (array_chunk($plans, 4) as $i => $chunk) {
            $id = $this->parts?->pricing($chunk, $i === 0 ? $heading : null);
            if ($id === null) {
                return null;
            }
            $rows[] = self::row('content_block', ['block_id' => $id]);
        }

        return $rows;
    }

    /** @return list<array<string, mixed>> */
    private function text(?string $heading, string $html): array
    {
        $clean = self::meaningful($html) ? ($this->body)($html) : null;

        if ($clean !== null && self::meaningful($clean)) {
            return [BodySections::section($heading, $clean)];
        }

        return $heading !== null && $heading !== '' ? [BodySections::section(null, '<h2>'.e($heading).'</h2>')] : [];
    }

    /** @param  array<string, mixed>  $data */
    private static function row(string $type, array $data): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'data' => $data];
    }

    /** @param  array<string, mixed>  $row */
    private static function valid(array $row): bool
    {
        $type = PageSectionType::tryFrom((string) $row['type']);

        return $type !== null && ! Validator::make(['data' => $row['data']], self::prefixed(SectionRules::for($type)))->fails();
    }

    /**
     * @param  array<string, mixed>  $rules
     * @return array<string, mixed>
     */
    private static function prefixed(array $rules): array
    {
        $out = ['data' => ['required', 'array']];
        foreach ($rules as $key => $rule) {
            $out["data.{$key}"] = $rule;
        }

        return $out;
    }

    /** Columns that leave no short last row where the count allows it. */
    private static function columns(int $count): int
    {
        return match (true) {
            $count <= 4 => max(2, $count),
            $count % 3 === 0 => 3,
            $count % 4 === 0 => 4,
            default => 3,
        };
    }

    /**
     * A divider never opens, closes or doubles.
     *
     * @param  list<array<string, mixed>>  $rows
     * @return list<array<string, mixed>>
     */
    public static function trimDividers(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            if ($row['type'] === 'divider' && ($out === [] || $out[count($out) - 1]['type'] === 'divider')) {
                continue;
            }
            $out[] = $row;
        }
        while ($out !== [] && $out[count($out) - 1]['type'] === 'divider') {
            array_pop($out);
        }

        return $out;
    }

    private static function meaningful(string $html): bool
    {
        return trim(html_entity_decode(strip_tags($html, '<img><iframe><table><hr>'), ENT_QUOTES | ENT_HTML5, 'UTF-8'), " \t\n\r\0\x0B\u{A0}") !== '';
    }

    /** A list whose items are widgets — Divi's bar counters are `<li>`s — is walked into, not kept as a list. */
    private function listOfWidgets(DOMElement $el): bool
    {
        if (! in_array(strtolower($el->tagName), ['ul', 'ol'], true)) {
            return false;
        }
        foreach (Dom::children($el) as $item) {
            foreach ($this->recognisers as $recogniser) {
                if ($recogniser->claim($item, false) !== null) {
                    return true;
                }
            }
        }

        return false;
    }

    /** Whether an element holds words of its own, beside its child elements. */
    private static function ownText(DOMElement $el): bool
    {
        foreach ($el->childNodes as $child) {
            if ($child instanceof DOMText && trim($child->data) !== '') {
                return true;
            }
        }

        return false;
    }
}
