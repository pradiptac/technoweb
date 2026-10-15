<?php

namespace App\Support\WordPress\Rendered;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;

/**
 * The few things the recognisers ask of a rendered page's markup: its class
 * tokens, the first or every descendant whose class matches a pattern, its
 * text, its markup.
 *
 * A pattern is matched against each class **token**, anchored by the caller
 * (`/^elementor-counter-title$/`), never against the whole attribute — a
 * section classed `testimonials-section` is not a testimonial, and
 * `elementor-testimonial-content` is not `elementor-testimonial`.
 */
final class Dom
{
    /** Elements that are never content. */
    private const NEVER = ['script', 'style', 'noscript', 'template', 'link', 'meta', 'svg', 'canvas', 'object', 'embed'];

    /** Classes that mean "not shown", or shown only as a copy of something else. */
    private const HIDDEN = '/^(screen-reader-text|sr-only|visually-hidden|swiper-slide-duplicate|slick-cloned|elementor-hidden-desktop|elementor-widget-spacer|wp-block-spacer|et_pb_space|vc_empty_space|elementor-screen-only)$/';

    /** The markup as a document, its content under one wrapper element. */
    public static function load(string $html): DOMElement
    {
        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?><!DOCTYPE html><html><body><div id="__rendered">'.$html.'</div></body></html>', LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('__rendered');
        if (! $root instanceof DOMElement) {
            $root = $doc->createElement('div');
        }

        return $root;
    }

    /** @return list<string> */
    public static function classes(DOMElement $el): array
    {
        $class = trim($el->getAttribute('class'));

        return $class === '' ? [] : array_values(array_filter(preg_split('/\s+/', $class) ?: []));
    }

    /** Whether a class token matches `$pattern`. */
    public static function has(DOMElement $el, string $pattern): bool
    {
        foreach (self::classes($el) as $token) {
            if (preg_match($pattern, $token)) {
                return true;
            }
        }

        return false;
    }

    /** Elementor's widget name, from `data-widget_type="price-table.default"`. */
    public static function widget(DOMElement $el): ?string
    {
        $type = $el->getAttribute('data-widget_type');

        return $type !== '' ? strtolower(explode('.', $type)[0]) : null;
    }

    /** @return list<DOMElement> every descendant element, in document order */
    public static function descendants(DOMElement $el): array
    {
        $out = [];
        foreach ($el->getElementsByTagName('*') as $node) {
            if (! self::cloned($node, $el)) {
                $out[] = $node;
            }
        }

        return $out;
    }

    /** @return list<DOMElement> descendants with a class token matching `$pattern` */
    public static function all(DOMElement $el, string $pattern): array
    {
        return array_values(array_filter(self::descendants($el), fn (DOMElement $d) => self::has($d, $pattern)));
    }

    public static function first(DOMElement $el, string $pattern): ?DOMElement
    {
        foreach (self::descendants($el) as $d) {
            if (self::has($d, $pattern)) {
                return $d;
            }
        }

        return null;
    }

    /** @return list<DOMElement> descendants by tag name */
    public static function tags(DOMElement $el, string ...$names): array
    {
        return array_values(array_filter(self::descendants($el), fn (DOMElement $d) => in_array(strtolower($d->tagName), $names, true)));
    }

    public static function firstTag(DOMElement $el, string ...$names): ?DOMElement
    {
        return self::tags($el, ...$names)[0] ?? null;
    }

    /** @return list<DOMElement> the element children */
    public static function children(DOMElement $el): array
    {
        $out = [];
        foreach ($el->childNodes as $node) {
            if ($node instanceof DOMElement) {
                $out[] = $node;
            }
        }

        return $out;
    }

    /** Whether any descendant has a class token matching `$pattern`. */
    public static function contains(DOMElement $el, string $pattern): bool
    {
        return self::first($el, $pattern) !== null;
    }

    /** The words, one line, entities decoded, hidden copies left out. */
    public static function text(?DOMNode $node): string
    {
        if ($node === null) {
            return '';
        }

        return trim((string) preg_replace('/\s+/u', ' ', self::rawText($node)));
    }

    private static function rawText(DOMNode $node): string
    {
        if ($node instanceof DOMText) {
            return $node->data;
        }
        if ($node instanceof DOMElement) {
            $tag = strtolower($node->tagName);
            if (in_array($tag, self::NEVER, true) || self::hidden($node)) {
                return '';
            }
            if ($tag === 'br') {
                return ' ';
            }
        }

        $out = '';
        foreach ($node->childNodes as $child) {
            $out .= self::rawText($child);
        }

        // Block-level elements are separated by a space, so "Title" and "Body" do not run together.
        if ($node instanceof DOMElement && in_array(strtolower($node->tagName), ['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'dt', 'dd', 'figcaption', 'blockquote', 'cite', 'button'], true)) {
            $out = ' '.$out.' ';
        }

        return $out;
    }

    /** The element's own markup, as it stands. */
    public static function html(DOMElement $el): string
    {
        return (string) $el->ownerDocument?->saveHTML($el);
    }

    /** Whether the element is never shown, or is a copy of something shown. */
    public static function hidden(DOMElement $el): bool
    {
        if (in_array(strtolower($el->tagName), self::NEVER, true)) {
            return true;
        }
        if (preg_match('/display\s*:\s*none|visibility\s*:\s*hidden/i', $el->getAttribute('style'))) {
            return true;
        }
        if ($el->hasAttribute('hidden') && strtolower($el->tagName) !== 'details') {
            return true;
        }

        return self::has($el, self::HIDDEN);
    }

    /** Whether `$el` sits inside a carousel's copy of a slide, below `$within`. */
    private static function cloned(DOMElement $el, DOMElement $within): bool
    {
        for ($node = $el; $node instanceof DOMElement && ! $node->isSameNode($within); $node = $node->parentNode) {
            if (self::has($node, '/^(swiper-slide-duplicate|slick-cloned)$/')) {
                return true;
            }
        }

        return false;
    }

    /**
     * A picture's address: the lazy-loader's real one before the placeholder
     * `src`, and never a `data:` URI.
     */
    public static function src(DOMElement $img): ?string
    {
        foreach (['data-src', 'data-lazy-src', 'data-orig-file', 'data-large_image', 'data-thumbnail', 'src'] as $attr) {
            $value = trim(html_entity_decode($img->getAttribute($attr), ENT_QUOTES));
            if ($value !== '' && ! str_starts_with($value, 'data:') && preg_match('#^(https?:)?//#i', $value)) {
                return str_starts_with($value, '//') ? 'https:'.$value : $value;
            }
        }

        return null;
    }

    /** The nearest ancestor (or the element itself) with a class token matching `$pattern`. */
    public static function closest(DOMElement $el, string $pattern, ?DOMElement $stop = null): ?DOMElement
    {
        for ($node = $el; $node instanceof DOMElement; $node = $node->parentNode) {
            if (self::has($node, $pattern)) {
                return $node;
            }
            if ($stop !== null && $node->isSameNode($stop)) {
                break;
            }
        }

        return null;
    }
}
