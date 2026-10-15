<?php

namespace App\Support\SiteImport;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A menu out of the markup that draws it: the first top-level list of links
 * inside an element (`<nav><ul><li><a>…<ul>…`), with its nested lists as
 * children, or — when there is no list — its links in a row.
 *
 * An item whose link goes nowhere (`href="#"`, a button) and which holds a
 * nested list is a heading, as a dropdown's toggle is. The hrefs are read as
 * they stand, so the caller resolves them first.
 */
final class NavReader
{
    private const MAX_PER_LEVEL = 40;

    private const MAX_DEPTH = 3;

    /** @return list<array{label: string, href: ?string, children: list<array<string, mixed>>}> */
    public static function read(DOMElement $root): array
    {
        foreach (Dom::tags($root, 'ul', 'ol') as $list) {
            if (self::nested($list, $root)) {
                continue;
            }

            $items = self::items($list, 1);

            if (count($items) >= 2) {
                return $items;
            }
        }

        $flat = [];
        $seen = [];

        foreach (Dom::tags($root, 'a') as $a) {
            $item = self::link($a);

            if ($item !== null && $item['href'] !== null && ! isset($seen[$item['href']])) {
                $seen[$item['href']] = true;
                $flat[] = $item;
            }
        }

        return array_slice($flat, 0, self::MAX_PER_LEVEL);
    }

    /** @return list<array{label: string, href: ?string, children: list<array<string, mixed>>}> */
    private static function items(DOMElement $list, int $depth): array
    {
        $out = [];

        foreach (Dom::children($list) as $li) {
            if (strtolower($li->tagName) !== 'li' || count($out) >= self::MAX_PER_LEVEL) {
                continue;
            }

            $link = null;
            $children = [];

            foreach (Dom::descendants($li) as $node) {
                $tag = strtolower($node->tagName);

                if ($link === null && $tag === 'a' && ! self::nested($node, $li)) {
                    $link = self::link($node);
                }

                if ($children === [] && $depth < self::MAX_DEPTH && in_array($tag, ['ul', 'ol'], true) && ! self::nested($node, $li)) {
                    $children = self::items($node, $depth + 1);
                }
            }

            // A toggle with no address of its own: its words, if it has a list under it.
            if ($link === null || $link['label'] === '') {
                $label = Dom::text(Dom::firstTag($li, 'button', 'span', 'a'));

                if ($label !== '' && $children !== []) {
                    $link = ['label' => mb_substr($label, 0, 120), 'href' => null, 'children' => []];
                }
            }

            if ($link !== null && $link['label'] !== '') {
                $link['children'] = $children;
                $out[] = $link;
            }
        }

        return $out;
    }

    /** @return ?array{label: string, href: ?string, children: list<array<string, mixed>>} */
    private static function link(DOMElement $a): ?array
    {
        $label = Dom::text($a);

        if ($label === '' || mb_strlen($label) > 80) {
            return null;
        }

        $href = trim(html_entity_decode($a->getAttribute('href'), ENT_QUOTES));

        if ($href === '' || str_starts_with($href, '#') || preg_match('/^javascript:/i', $href)) {
            $href = null;
        }

        return ['label' => $label, 'href' => $href, 'children' => []];
    }

    /** Whether `$el` sits inside a list (or, for a list, inside another) below `$stop`. */
    private static function nested(DOMElement $el, DOMElement $stop): bool
    {
        for ($n = $el->parentNode; $n instanceof DOMElement && ! $n->isSameNode($stop); $n = $n->parentNode) {
            if (in_array(strtolower($n->tagName), ['ul', 'ol'], true)) {
                return true;
            }
        }

        return false;
    }
}
