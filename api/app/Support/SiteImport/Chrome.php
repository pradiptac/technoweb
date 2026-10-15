<?php

namespace App\Support\SiteImport;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;
use DOMNode;

/**
 * Telling a site's furniture from its content (`docs/site-import.md`).
 *
 * A header, a menu and a footer are on every page of a site, and importing
 * them into every page's sections would repeat them down the whole site and
 * fight the theme's own. So the scan tallies, for every page, a signature of
 * each block that could be furniture — a hash of its tag, its tag skeleton
 * and its words — and a block repeated on at least 60% of the pages (three at
 * the least) is the site's chrome. `<nav>`, a top-level `<footer>` and a
 * `<header>` that holds a menu are chrome by what they are, whatever else is
 * said: a site of one page still has a menu.
 *
 * What a header that holds the page's `<h1>` is: content. A masthead with the
 * headline in it is the page's hero, and is removed only if it repeats
 * word for word on most pages — which a headline does not.
 *
 * `menus()` reads the primary and footer menus out of a page's chrome before
 * it is taken away.
 */
final class Chrome
{
    /** The share of pages a block must be on to be furniture. */
    private const SHARE = 0.6;

    private const MIN_PAGES = 3;

    private const SECTIONING = ['article', 'section', 'main', 'aside'];

    /** The blocks that can be furniture without being a `<nav>` or a `<footer>`: never a link, a paragraph or a heading. */
    private const CONTAINERS = ['div', 'section', 'aside', 'ul', 'ol', 'form', 'table', 'article'];

    /**
     * The signatures of the blocks on one page that could be furniture.
     *
     * @return array<string, DOMElement> signature => the element
     */
    public static function candidates(DOMElement $body): array
    {
        $found = [];

        foreach (self::elements($body) as $el) {
            $text = self::words($el);

            if (mb_strlen($text) < (self::semantic($el, strict: false) ? 3 : 12)) {
                continue;
            }

            $found[self::signature($el, $text)] ??= $el;
        }

        return $found;
    }

    /**
     * The signatures a tally calls repeated.
     *
     * @param  array<string, int>  $counts  signature => pages it is on
     * @return list<string>
     */
    public static function repeated(array $counts, int $pages): array
    {
        if ($pages < self::MIN_PAGES) {
            return [];
        }

        $least = max(self::MIN_PAGES, (int) ceil($pages * self::SHARE));

        return array_map('strval', array_keys(array_filter($counts, fn (int $n) => $n >= $least)));
    }

    /**
     * Take the chrome out of a page's body. Returns the elements removed, so
     * the caller can read a menu out of them.
     *
     * @param  list<string>  $repeated
     * @return list<DOMElement>
     */
    public static function strip(DOMElement $body, array $repeated): array
    {
        $removed = [];
        $repeated = array_flip($repeated);

        foreach (self::elements($body) as $el) {
            if ($el->parentNode === null || self::inside($el, $removed)) {
                continue;
            }

            $text = self::words($el);
            $is = self::semantic($el)
                || (mb_strlen($text) >= 12 && isset($repeated[self::signature($el, $text)]) && ! self::holdsContent($el));

            if ($is) {
                $removed[] = $el;
            }
        }

        foreach ($removed as $el) {
            $el->parentNode?->removeChild($el);
        }

        return $removed;
    }

    /**
     * The menus a page's chrome holds: `primary` from the first `<nav>` that
     * is not in the footer (else the header's first list of links), `footer`
     * from the first one that is.
     *
     * @param  list<string>  $repeated  signatures of blocks repeated across pages: furniture a site built from `<div>`s still has
     * @return array{primary: list<array<string, mixed>>, footer: list<array<string, mixed>>}
     */
    public static function menus(DOMElement $body, array $repeated = []): array
    {
        $primary = [];
        $footer = [];

        foreach (self::navs($body) as $nav) {
            $items = NavReader::read($nav);

            if (count($items) < 2) {
                continue;
            }

            if (self::inFooter($nav)) {
                $footer = $footer === [] ? $items : $footer;
            } else {
                $primary = $primary === [] ? $items : $primary;
            }
        }

        if ($primary === []) {
            foreach ($body->getElementsByTagName('header') as $header) {
                $items = NavReader::read($header);

                if (count($items) >= 3) {
                    $primary = $items;
                    break;
                }
            }
        }

        if ($footer === []) {
            foreach ($body->getElementsByTagName('footer') as $foot) {
                $items = NavReader::read($foot);

                if (count($items) >= 2) {
                    $footer = $items;
                    break;
                }
            }
        }

        if (($primary === [] || $footer === []) && $repeated !== []) {
            $blocks = array_values(array_filter(
                self::candidates($body),
                fn (string $signature) => in_array($signature, $repeated, true),
                ARRAY_FILTER_USE_KEY,
            ));

            foreach ($blocks as $block) {
                $items = NavReader::read($block);

                if ($primary === [] && count($items) >= 3 && ! self::inFooter($block)) {
                    $primary = $items;
                } elseif ($footer === [] && count($items) >= 2 && $items !== $primary) {
                    $footer = $items;
                }
            }
        }

        return ['primary' => $primary, 'footer' => $footer];
    }

    /** @return list<DOMElement> every `<nav>` and `role=navigation`, in document order */
    private static function navs(DOMElement $body): array
    {
        $out = [];

        foreach ($body->getElementsByTagName('*') as $el) {
            if (strtolower($el->tagName) === 'nav' || strtolower($el->getAttribute('role')) === 'navigation') {
                $out[] = $el;
            }
        }

        return $out;
    }

    /**
     * Candidate elements, in document order: the semantic ones anywhere, and
     * every element up to three levels below the body (a `<div class="topbar">`
     * has no better name than where it sits).
     *
     * @return list<DOMElement>
     */
    private static function elements(DOMElement $body): array
    {
        $out = [];

        foreach ($body->getElementsByTagName('*') as $el) {
            $tag = strtolower($el->tagName);

            if (in_array($tag, ['script', 'style', 'link', 'meta', 'noscript', 'template'], true)) {
                continue;
            }

            if (self::semantic($el, strict: false) || (in_array($tag, self::CONTAINERS, true) && self::depth($el, $body) <= 3)) {
                $out[] = $el;
            }
        }

        return $out;
    }

    /** Chrome by what the element is. */
    private static function semantic(DOMElement $el, bool $strict = true): bool
    {
        $tag = strtolower($el->tagName);
        $role = strtolower($el->getAttribute('role'));

        if ($tag === 'nav' || $role === 'navigation') {
            return true;
        }

        $loose = ! $strict;

        if ($tag === 'footer' || $role === 'contentinfo') {
            return $loose || ! self::inSectioning($el);
        }

        if ($tag === 'header' || $role === 'banner') {
            if ($loose) {
                return true;
            }

            return ! self::inSectioning($el) && ! self::holdsContent($el)
                && ($role === 'banner' || $el->getElementsByTagName('nav')->length > 0 || self::linkCount($el) >= 3);
        }

        return false;
    }

    /** An `<h1>` or a `<main>` inside: the page's own words, not furniture. */
    private static function holdsContent(DOMElement $el): bool
    {
        return $el->getElementsByTagName('h1')->length > 0 || $el->getElementsByTagName('main')->length > 0;
    }

    private static function inSectioning(DOMElement $el): bool
    {
        for ($n = $el->parentNode; $n instanceof DOMElement; $n = $n->parentNode) {
            if (in_array(strtolower($n->tagName), self::SECTIONING, true)) {
                return true;
            }
        }

        return false;
    }

    private static function inFooter(DOMElement $el): bool
    {
        for ($n = $el; $n instanceof DOMElement; $n = $n->parentNode) {
            if (strtolower($n->tagName) === 'footer' || strtolower($n->getAttribute('role')) === 'contentinfo') {
                return true;
            }
        }

        return false;
    }

    private static function linkCount(DOMElement $el): int
    {
        return $el->getElementsByTagName('a')->length;
    }

    private static function depth(DOMElement $el, DOMElement $body): int
    {
        $depth = 0;

        for ($n = $el->parentNode; $n instanceof DOMElement && ! $n->isSameNode($body); $n = $n->parentNode) {
            $depth++;
        }

        return $depth;
    }

    /** @param  list<DOMElement>  $removed */
    private static function inside(DOMElement $el, array $removed): bool
    {
        foreach ($removed as $gone) {
            for ($n = $el->parentNode; $n instanceof DOMNode; $n = $n->parentNode) {
                if ($n->isSameNode($gone)) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function signature(DOMElement $el, string $text): string
    {
        return sha1(strtolower($el->tagName).'|'.self::skeleton($el).'|'.mb_strtolower($text));
    }

    /** The element's tag names in order, no classes, no text: the shape of it. */
    private static function skeleton(DOMElement $el): string
    {
        $tags = '';

        foreach ($el->getElementsByTagName('*') as $child) {
            $tags .= strtolower($child->tagName)[0];
        }

        return $tags;
    }

    private static function words(DOMElement $el): string
    {
        return Dom::text($el);
    }
}
