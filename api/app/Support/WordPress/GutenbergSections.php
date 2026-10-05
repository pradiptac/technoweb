<?php

namespace App\Support\WordPress;

use App\Support\LinkPattern;
use App\Support\PageSections\BodySections;
use App\Support\YouTube;
use Closure;
use Illuminate\Support\Str;

/**
 * A WordPress page's block editor content as builder sections (0.109.0,
 * `docs/wordpress-import.md`, "Pages as builder sections").
 *
 * `content.raw` from `wp/v2/pages?context=edit` is the page's blocks as
 * comments around their saved markup — `<!-- wp:heading {"level":2} -->` …
 * `<!-- /wp:heading -->`, nested for columns, covers and groups. `parse()`
 * reads that into a tree; `toSections()` turns the tree into sections:
 *
 *  - the page's first `core/cover`, or a level-1/2 heading with a picture
 *    straight after it, opening the page → **hero**
 *  - `core/media-text` → **media_text** (picture beside words)
 *  - `core/columns` of two to four short columns → **features**
 *  - `core/quote`/`core/pullquote` with a citation → **testimonial**
 *  - `core/embed` of a YouTube video → **video**
 *  - `core/separator` → **divider**
 *  - consecutive `core/details` → **faq** (questions written here)
 *  - `core/buttons` → the buttons of the hero or picture-with-text before it
 *  - everything else — paragraphs, lists, tables, pictures, galleries,
 *    groups — gathers into **rich_text** sections, a new one at each
 *    level-2 heading.
 *
 * **Nothing is dropped for not fitting.** A block that does not satisfy its
 * section's rules (a quote with nobody named, a column too long to be a
 * feature, a cover with no heading) falls back to its markup in a text
 * section. A dynamic block whose saved markup is empty — latest posts, a
 * shortcode block — has nothing to bring and is counted in `$skipped`.
 *
 * Markup goes through the caller's `$body` (the import's `Step::body()`:
 * uploads re-homed in the media library, then the sanitiser), and a picture
 * field through `$media`, which answers a library path or null.
 */
final class GutenbergSections
{
    /** A feature's words, past which a column is an article rather than a point. */
    private const FEATURE_TEXT = 300;

    /**
     * Blocks that had nothing to bring — a dynamic block WordPress draws when
     * the page is requested (latest posts, a shortcode block), by name.
     *
     * @var list<string>
     */
    public array $skipped = [];

    /** @var list<array<string, mixed>> the sections so far, while `toSections()` runs */
    private array $out = [];

    /** @var array{heading: ?string, html: string} the text section being gathered */
    private array $pending = ['heading' => null, 'html' => ''];

    /** @var list<array{question: string, answer: string}> consecutive questions being gathered */
    private array $questions = [];

    /** Empty blocks that are layout rather than content, and are not worth naming. */
    private const QUIET = ['core/spacer', 'core/more', 'core/nextpage', 'core/paragraph', 'core/heading', 'core/freeform', 'core/separator'];

    /**
     * @param  Closure(string): ?string  $body  markup → cleaned markup
     * @param  Closure(int|string): ?string  $media  attachment id or URL → library path
     */
    public function __construct(private Closure $body, private Closure $media) {}

    /** Whether the content was written in the block editor at all. */
    public static function isBlocks(string $raw): bool
    {
        return str_contains($raw, '<!-- wp:');
    }

    /**
     * The block tree. Each block carries `html` — its own markup, without its
     * children's — and `seq`, its own markup and its children in the order
     * WordPress saved them, which `markup()` reads back.
     *
     * @return list<array<string, mixed>>
     */
    public static function parse(string $raw): array
    {
        preg_match_all('/<!--\s+\/?wp:[a-z][a-z0-9_\/-]*.*?-->/s', $raw, $matches, PREG_OFFSET_CAPTURE);

        /** The open blocks, the page itself first. */
        $stack = [new BlockFrame('root')];
        $cursor = 0;

        foreach ($matches[0] as [$token, $offset]) {
            self::text($stack, substr($raw, $cursor, $offset - $cursor));
            $cursor = $offset + strlen($token);

            $tag = self::token($token);
            if ($tag === null) {
                continue;
            }

            $top = $stack[count($stack) - 1];

            if ($tag['closing']) {
                if (count($stack) > 1 && $top->name === $tag['name']) {
                    array_pop($stack);
                    $stack[count($stack) - 1]->add($top->block());
                }

                continue;
            }

            if ($tag['void']) {
                $top->add((new BlockFrame($tag['name'], $tag['attrs']))->block());

                continue;
            }

            $stack[] = new BlockFrame($tag['name'], $tag['attrs']);
        }

        self::text($stack, substr($raw, $cursor));

        // A block left open by malformed content still keeps what it held.
        while (count($stack) > 1) {
            $done = array_pop($stack);
            $stack[count($stack) - 1]->add($done->block());
        }

        return $stack[0]->children;
    }

    /**
     * A block comment read: closing or not, self-closing or not, its name and
     * its attributes. Null for a comment that only looks like one.
     *
     * @return array{closing: bool, void: bool, name: string, attrs: array<string, mixed>}|null
     */
    private static function token(string $token): ?array
    {
        if (! preg_match('/^<!--\s+(\/?)wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s*(.*?)\s*(\/?)-->$/s', $token, $m)) {
            return null;
        }

        $attrs = [];
        if (str_starts_with($m[3], '{')) {
            $decoded = json_decode($m[3], true);
            $attrs = is_array($decoded) ? $decoded : [];
        }

        return ['closing' => $m[1] === '/', 'void' => $m[4] === '/', 'name' => self::fullName($m[2]), 'attrs' => $attrs];
    }

    /**
     * Markup between two comments: the open block's own, or — at the top
     * level, outside any block — a classic-editor run of its own.
     *
     * @param  list<BlockFrame>  $stack
     */
    private static function text(array $stack, string $between): void
    {
        if (trim($between) === '') {
            return;
        }
        if (count($stack) === 1) {
            $stack[0]->add(['name' => 'core/freeform', 'attrs' => [], 'html' => $between, 'children' => [], 'seq' => [$between]]);
        } else {
            $stack[count($stack) - 1]->own($between);
        }
    }

    /**
     * The sections, as `{id, type, hidden, data}` rows (not yet normalised).
     *
     * @param  list<array<string, mixed>>  $blocks
     * @return list<array<string, mixed>>
     */
    public function toSections(array $blocks): array
    {
        $this->out = [];
        $this->pending = ['heading' => null, 'html' => ''];
        $this->questions = [];

        $kept = [];
        foreach ($blocks as $block) {
            if (! self::blank($block)) {
                $kept[] = $block;
            } elseif (! in_array($block['name'], self::QUIET, true)) {
                $this->skipped[] = $block['name'];
            }
        }
        $blocks = $kept;
        $consumed = [];

        foreach ($blocks as $i => $block) {
            $name = $block['name'];
            if (isset($consumed[$i])) {
                continue;
            }

            if ($name !== 'core/details') {
                $this->flushQuestions();
            }

            // The page's opening: a cover, or a big heading with a picture right after it.
            if ($this->out === [] && trim($this->pending['html']) === '' && $this->pending['heading'] === null) {
                if ($name === 'core/cover' && ($hero = $this->cover($block))) {
                    $this->out[] = $hero;

                    continue;
                }
                if ($name === 'core/heading' && in_array((int) ($block['attrs']['level'] ?? 2), [1, 2], true)
                    && ($blocks[$i + 1]['name'] ?? null) === 'core/image' && ($hero = $this->headingHero($block, $blocks[$i + 1]))) {
                    $this->out[] = $hero;
                    $consumed[$i + 1] = true;

                    continue;
                }
            }

            $section = match ($name) {
                'core/media-text' => $this->mediaText($block),
                'core/columns' => $this->columns($block),
                'core/quote', 'core/pullquote' => $this->quote($block),
                'core/embed' => $this->embed($block),
                'core/separator' => $this->row('divider', ['size' => 'medium', 'rule' => true]),
                default => null,
            };

            if ($name === 'core/details' && ($item = $this->detail($block))) {
                $this->flushText();
                $this->questions[] = $item;

                continue;
            }

            if ($name === 'core/buttons' && $this->out !== [] && trim($this->pending['html']) === '') {
                $last = &$this->out[count($this->out) - 1];
                if (in_array($last['type'], ['hero', 'media_text'], true) && ! isset($last['data']['primary'])) {
                    $last['data'] += $this->buttons($block);
                    unset($last);

                    continue;
                }
                unset($last);
            }

            if ($section !== null) {
                $this->flushText();
                // A divider never opens, closes or doubles.
                if ($section['type'] === 'divider' && ($this->out === [] || end($this->out)['type'] === 'divider')) {
                    continue;
                }
                $this->out[] = $section;

                continue;
            }

            if ($name === 'core/heading' && (int) ($block['attrs']['level'] ?? 2) === 2) {
                $this->flushText();
                $this->pending['heading'] = self::plain($block['html']);

                continue;
            }

            $this->pending['html'] .= self::markup($block);
        }

        $this->flushText();
        $this->flushQuestions();

        while ($this->out !== [] && end($this->out)['type'] === 'divider') {
            array_pop($this->out);
        }

        return BodySections::cap($this->out);
    }

    /** The text gathered so far as a section — or its heading alone, kept as words. */
    private function flushText(): void
    {
        $html = $this->pending['html'];
        $heading = $this->pending['heading'];
        $clean = trim($html) !== '' ? ($this->body)($html) : null;

        if ($clean !== null && trim(strip_tags($clean, '<img><iframe><table><hr>')) !== '') {
            $this->out[] = BodySections::section($heading, $clean);
        } elseif ($heading !== null && $heading !== '') {
            $this->out[] = BodySections::section(null, '<h2>'.e($heading).'</h2>');
        }

        $this->pending = ['heading' => null, 'html' => ''];
    }

    /** Consecutive questions as one questions section. */
    private function flushQuestions(): void
    {
        if ($this->questions !== []) {
            $this->out[] = $this->row('faq', ['source' => 'custom', 'items' => array_slice($this->questions, 0, 30)]);
        }
        $this->questions = [];
    }

    /** @return array<string, mixed>|null */
    private function cover(array $block): ?array
    {
        $heading = $this->firstHeading($block);
        if ($heading === null) {
            return null;
        }
        $image = $this->picture($block['attrs']['id'] ?? null, $block['attrs']['url'] ?? self::src($block['html']));
        $lede = $this->firstParagraph($block);

        return $this->row('hero', array_filter([
            'heading' => Str::limit($heading, 157, '…'),
            'lede' => $lede !== null ? Str::limit($lede, 397, '…') : null,
            'layout' => $image ? 'cover' : 'centered',
            'image_path' => $image,
        ]) + $this->buttons($block));
    }

    /** @return array<string, mixed>|null */
    private function headingHero(array $heading, array $image): ?array
    {
        $text = self::plain($heading['html']);
        $path = $this->picture($image['attrs']['id'] ?? null, self::src($image['html']));
        if ($text === '' || $path === null) {
            return null;
        }

        return $this->row('hero', ['heading' => Str::limit($text, 157, '…'), 'layout' => 'split', 'image_path' => $path]);
    }

    /** @return array<string, mixed>|null */
    private function mediaText(array $block): ?array
    {
        $attrs = $block['attrs'];
        $heading = $this->firstHeading($block);
        $isVideo = ($attrs['mediaType'] ?? 'image') === 'video';
        $image = $isVideo ? null : $this->picture($attrs['mediaId'] ?? null, $attrs['mediaUrl'] ?? self::src($block['html']));
        if ($heading === null || $image === null) {
            return null;
        }

        $words = '';
        $skippedHeading = false;
        foreach ($block['children'] as $child) {
            if ($child['name'] === 'core/buttons') {
                continue;
            }
            if (! $skippedHeading && $child['name'] === 'core/heading') {
                $skippedHeading = true;

                continue;
            }
            $words .= self::markup($child);
        }
        $body = trim($words) !== '' ? ($this->body)($words) : null;

        return $this->row('media_text', array_filter([
            'heading' => Str::limit($heading, 157, '…'),
            'body' => $body,
            'media' => 'image',
            'image_path' => $image,
            'side' => ($attrs['mediaPosition'] ?? 'left') === 'right' ? 'right' : 'left',
        ]) + $this->buttons($block));
    }

    /** @return array<string, mixed>|null */
    private function columns(array $block): ?array
    {
        $columns = array_values(array_filter($block['children'], fn ($c) => $c['name'] === 'core/column'));
        if (count($columns) < 2 || count($columns) > 4) {
            return null;
        }

        $items = [];
        foreach ($columns as $column) {
            $title = $this->firstHeading($column);
            $words = [];
            foreach ($column['children'] as $child) {
                if ($child['name'] === 'core/heading' && $title !== null && $words === [] && self::plain($child['html']) === $title) {
                    continue;
                }
                if (in_array($child['name'], ['core/image', 'core/buttons', 'core/spacer'], true)) {
                    continue;
                }
                $words[] = self::plain(self::markup($child));
            }
            $words = array_values(array_filter($words));
            if ($title === null) {
                $title = array_shift($words);
            }
            $body = trim(implode(' ', $words));
            if ($title === null || $title === '' || mb_strlen($title) > 80 || mb_strlen($body) > self::FEATURE_TEXT) {
                return null;
            }
            $items[] = array_filter(['title' => $title, 'body' => $body]);
        }

        return $this->row('features', ['columns' => count($items), 'items' => $items]);
    }

    /** @return array<string, mixed>|null */
    private function quote(array $block): ?array
    {
        if (! preg_match('#<cite[^>]*>(.*?)</cite>#is', $block['html'].implode('', array_map(fn ($c) => self::markup($c), $block['children'])), $cite)) {
            return null;
        }
        $name = self::plain($cite[1]);
        $all = $block['html'].implode('', array_map(fn ($c) => self::markup($c), $block['children']));
        $quote = self::plain((string) preg_replace('#<cite[^>]*>.*?</cite>#is', '', $all));
        if ($name === '' || $quote === '' || mb_strlen($quote) > 800) {
            return null;
        }

        return $this->row('testimonial', ['quote' => $quote, 'name' => Str::limit($name, 117, '…')]);
    }

    /** @return array<string, mixed>|null */
    private function embed(array $block): ?array
    {
        $url = (string) ($block['attrs']['url'] ?? '');
        if ($url === '' || YouTube::id($url) === null) {
            return null;
        }
        $caption = preg_match('#<figcaption[^>]*>(.*?)</figcaption>#is', $block['html'], $m) ? self::plain($m[1]) : '';

        return $this->row('video', array_filter(['source' => 'youtube', 'youtube' => $url, 'caption' => $caption !== '' ? Str::limit($caption, 297, '…') : null]));
    }

    /** @return array{question: string, answer: string}|null */
    private function detail(array $block): ?array
    {
        $html = self::markup($block);
        if (! preg_match('#<summary[^>]*>(.*?)</summary>#is', $html, $m)) {
            return null;
        }
        $question = self::plain($m[1]);
        $answer = self::plain((string) preg_replace('#<summary[^>]*>.*?</summary>#is', '', $html));
        if ($question === '' || $answer === '') {
            return null;
        }

        return ['question' => Str::limit($question, 297, '…'), 'answer' => Str::limit($answer, 1997, '…')];
    }

    /**
     * Up to two buttons from a `core/buttons` block inside (or as) `$block`.
     *
     * @return array<string, array{label: string, href: string}>
     */
    private function buttons(array $block): array
    {
        $html = self::markup($block);
        preg_match_all('#<a\b[^>]*\bhref="([^"]+)"[^>]*>(.*?)</a>#is', $html, $links, PREG_SET_ORDER);

        $out = [];
        foreach (['primary', 'secondary'] as $n => $key) {
            if (! isset($links[$n]) || ! str_contains($html, 'wp-block-button')) {
                break;
            }
            $label = self::plain($links[$n][2]);
            $href = html_entity_decode($links[$n][1], ENT_QUOTES);
            if ($label === '' || ! LinkPattern::allows($href)) {
                continue;
            }
            $out[$key] = ['label' => Str::limit($label, 37, '…'), 'href' => $href];
        }

        return $out;
    }

    private function picture(mixed $id, mixed $url): ?string
    {
        $path = is_numeric($id) && (int) $id > 0 ? ($this->media)((int) $id) : null;
        if ($path === null && is_string($url) && $url !== '') {
            $path = ($this->media)($url);
        }

        return $path;
    }

    private function firstHeading(array $block): ?string
    {
        foreach ($block['children'] as $child) {
            if ($child['name'] === 'core/heading') {
                $text = self::plain($child['html']);

                return $text !== '' ? $text : null;
            }
            if ($child['children'] !== [] && ($found = $this->firstHeading($child)) !== null) {
                return $found;
            }
        }

        return null;
    }

    private function firstParagraph(array $block): ?string
    {
        foreach ($block['children'] as $child) {
            if ($child['name'] === 'core/paragraph') {
                $text = self::plain($child['html']);

                return $text !== '' ? $text : null;
            }
        }

        return null;
    }

    /** @return array<string, mixed> */
    private function row(string $type, array $data): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'data' => $data];
    }

    /** A block's whole saved markup, its children's in their places, the comments gone. */
    public static function markup(array $block): string
    {
        if (empty($block['seq'])) {
            return (string) $block['html'];
        }

        $out = '';
        foreach ($block['seq'] as $part) {
            $out .= is_string($part) ? $part : self::markup($block['children'][$part]);
        }

        return $out;
    }

    private static function plain(string $html): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags((string) preg_replace('#<br\s*/?>#i', ' ', $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    private static function src(string $html): ?string
    {
        return preg_match('/<img\b[^>]*\bsrc="([^"]+)"/i', $html, $m) ? html_entity_decode($m[1], ENT_QUOTES) : null;
    }

    /** A block with nothing to bring: a spacer, an empty paragraph, an empty dynamic block. */
    private static function blank(array $block): bool
    {
        if (in_array($block['name'], ['core/spacer', 'core/more', 'core/nextpage'], true)) {
            return true;
        }
        // A separator is its line; an embed is its URL, whatever its saved markup holds.
        if ($block['name'] === 'core/separator' || $block['children'] !== [] || ! empty($block['attrs']['url'])) {
            return false;
        }

        return trim(strip_tags($block['html'], '<img><iframe><hr><table>')) === '';
    }

    private static function fullName(string $name): string
    {
        return str_contains($name, '/') ? $name : 'core/'.$name;
    }
}
