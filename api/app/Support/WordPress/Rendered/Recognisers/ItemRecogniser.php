<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;
use Illuminate\Support\Str;

/**
 * A recogniser for one item at a time — a counter, a question, an icon box —
 * known by a class token. The walker groups neighbouring items of one kind
 * into one section (`Piece::MERGES`), so a widget holding several items is
 * simply walked into and each is claimed in turn.
 *
 * An element is claimed only when nothing inside it also matches: a theme's
 * `pricing-table` wrapping three `pricing-table` columns is a wrapper, and
 * the columns are the plans.
 */
abstract class ItemRecogniser implements Recogniser
{
    abstract protected function kind(): string;

    /** The class tokens an item carries, anchored. */
    abstract protected function pattern(): string;

    /** @return array<string, mixed>|null the item, or null when it is not one after all */
    abstract protected function item(DOMElement $el): ?array;

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! $this->matches($el) || Dom::contains($el, $this->pattern())) {
            return null;
        }

        $html = Dom::html($el);
        // A copy, so a recogniser that takes a part out to read the rest leaves the page as it was.
        $copy = $el->cloneNode(true);
        $item = $copy instanceof DOMElement ? $this->item($copy) : null;

        return $item === null ? null : new Piece($this->kind(), [$item], html: $html);
    }

    protected function matches(DOMElement $el): bool
    {
        return Dom::has($el, $this->pattern());
    }

    /** The words of the first descendant matching `$pattern`. */
    protected static function part(DOMElement $el, string $pattern): string
    {
        return Dom::text(Dom::first($el, $pattern));
    }

    /** The first heading's words. */
    protected static function heading(DOMElement $el): string
    {
        return Dom::text(Dom::firstTag($el, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'));
    }

    /** The first paragraph's words. */
    protected static function paragraph(DOMElement $el): string
    {
        return Dom::text(Dom::firstTag($el, 'p'));
    }

    protected static function limit(string $text, int $max): string
    {
        return mb_strlen($text) <= $max ? $text : Str::limit($text, $max - 1, '…');
    }

    /** `Name *` and `Name (required)` as `Name`. */
    protected static function bare(string $text): string
    {
        return trim((string) preg_replace('/\s*(\*|\(required\))\s*$/i', '', $text));
    }
}
