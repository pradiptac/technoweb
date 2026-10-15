<?php

namespace App\Support\SiteImport;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A product page's specification sheet: a two-column `<table>` of label and
 * value, or a `<dl>`, read as an ordered list of pairs for the catalogue's
 * `specifications` (which `SpecSheet` stores in the order given).
 *
 * `split()` also takes the sheet out of the markup, so the page's sections
 * do not repeat what the product's own spec table will show.
 */
final class Specs
{
    /** The fewest rows that make a table a spec sheet rather than a layout. */
    public const MIN = 3;

    private const MAX = 60;

    /**
     * @return array{html: string, specs: array<string, string>}
     */
    public static function split(string $html): array
    {
        $root = Dom::load($html);
        $specs = [];

        foreach (Dom::tags($root, 'table', 'dl') as $el) {
            $pairs = strtolower($el->tagName) === 'dl' ? self::definitions($el) : self::rows($el);

            if (count($pairs) >= self::MIN) {
                $specs = $pairs;
                $el->parentNode?->removeChild($el);

                break;
            }
        }

        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= (string) $root->ownerDocument?->saveHTML($child);
        }

        return ['html' => $specs === [] ? $html : $out, 'specs' => $specs];
    }

    /** The pairs a page holds, without changing it — for deciding what kind of page it is. */
    public static function read(DOMElement $content): array
    {
        foreach (Dom::tags($content, 'table', 'dl') as $el) {
            $pairs = strtolower($el->tagName) === 'dl' ? self::definitions($el) : self::rows($el);

            if (count($pairs) >= self::MIN) {
                return $pairs;
            }
        }

        return [];
    }

    /** @return array<string, string> */
    private static function rows(DOMElement $table): array
    {
        $pairs = [];

        foreach (Dom::tags($table, 'tr') as $tr) {
            $cells = array_values(array_filter(Dom::children($tr), fn (DOMElement $c) => in_array(strtolower($c->tagName), ['th', 'td'], true)));

            // Two cells a row: a layout table has more, or one.
            if (count($cells) !== 2) {
                continue;
            }

            self::add($pairs, Dom::text($cells[0]), Dom::text($cells[1]));
        }

        return $pairs;
    }

    /** @return array<string, string> */
    private static function definitions(DOMElement $dl): array
    {
        $pairs = [];
        $label = null;

        foreach (Dom::children($dl) as $child) {
            $tag = strtolower($child->tagName);

            if ($tag === 'dt') {
                $label = Dom::text($child);
            } elseif ($tag === 'dd' && $label !== null) {
                self::add($pairs, $label, Dom::text($child));
                $label = null;
            }
        }

        return $pairs;
    }

    /** @param  array<string, string>  $pairs */
    private static function add(array &$pairs, string $label, string $value): void
    {
        $label = rtrim(trim($label), ': ');

        if ($label !== '' && $value !== '' && mb_strlen($label) <= 80 && count($pairs) < self::MAX && ! isset($pairs[$label])) {
            $pairs[mb_substr($label, 0, 80)] = mb_substr($value, 0, 255);
        }
    }
}
