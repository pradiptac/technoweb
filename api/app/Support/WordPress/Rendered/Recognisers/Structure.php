<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\LinkPattern;
use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use DOMElement;
use Illuminate\Support\Str;

/**
 * What the generic recognisers (0.163.0, the site import) ask of a block of
 * markup, keyed on **structure** rather than on any framework's class names:
 * its element children, their shape, the pictures and links inside, the
 * words. A Bootstrap card, a Tailwind card and a hand-written `<div>` with a
 * heading and a paragraph are the same card.
 */
final class Structure
{
    /** @return list<DOMElement> the element children that are shown */
    public static function kids(DOMElement $el): array
    {
        return array_values(array_filter(Dom::children($el), fn (DOMElement $c) => ! Dom::hidden($c)));
    }

    /** The first heading, `h1`–`h6`, or null. */
    public static function heading(DOMElement $el, int $from = 1, int $to = 6): ?DOMElement
    {
        $tags = array_map(fn (int $n) => "h{$n}", range($from, $to));

        return Dom::firstTag($el, ...$tags);
    }

    /** The picture an element shows: its first real `<img>`, a logo or an icon excepted. */
    public static function image(DOMElement $el): ?string
    {
        $imgs = Dom::tags($el, 'img');

        if (strtolower($el->tagName) === 'img') {
            array_unshift($imgs, $el);
        }

        foreach ($imgs as $img) {
            $src = Dom::src($img);

            if ($src !== null && ! preg_match('/(^|[\/_-])(logo|icon|sprite|avatar|favicon|spacer|pixel)\b/i', $src.' '.$img->getAttribute('class'))) {
                return $src;
            }
        }

        return null;
    }

    /** The address in an inline `background-image:url(...)`, on the element or below it. */
    public static function background(DOMElement $el): ?string
    {
        foreach ([$el, ...Dom::descendants($el)] as $node) {
            if (preg_match('/background(?:-image)?\s*:[^;]*url\(\s*[\'"]?([^\'")]+)/i', $node->getAttribute('style'), $m)) {
                $src = html_entity_decode($m[1], ENT_QUOTES);

                if (preg_match('#^https?://#i', $src)) {
                    return $src;
                }
            }
        }

        return null;
    }

    /**
     * Whether a link is a button: drawn as one, or standing in a row beside
     * one ("See pricing" and a quieter "Why us" are the two buttons of a hero).
     */
    public static function isButton(DOMElement $a): bool
    {
        if (self::styledAsButton($a)) {
            return true;
        }

        if ($a->parentNode instanceof DOMElement) {
            foreach (Dom::children($a->parentNode) as $sibling) {
                if (! $sibling->isSameNode($a) && strtolower($sibling->tagName) === 'a' && self::styledAsButton($sibling)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** A `btn`/`button`/`cta` class, `role=button`, or a padded pill. */
    private static function styledAsButton(DOMElement $a): bool
    {
        if (strtolower($a->getAttribute('role')) === 'button') {
            return true;
        }

        $padX = false;
        $padY = false;

        foreach (Dom::classes($a) as $class) {
            if (preg_match('/^(btn|button|cta)([-_]|$)|^(wp-block-button__link)$/i', $class)) {
                return true;
            }
            $padX = $padX || (bool) preg_match('/^px-\d/', $class);
            $padY = $padY || (bool) preg_match('/^py-\d/', $class);
        }

        return $padX && $padY;
    }

    /**
     * Up to two buttons in an element, as a section's `primary` and `secondary`.
     *
     * @return array<string, array{label: string, href: string}>
     */
    public static function buttons(DOMElement $el): array
    {
        $out = [];
        $keys = ['primary', 'secondary'];

        foreach (Dom::tags($el, 'a') as $a) {
            if (! self::isButton($a)) {
                continue;
            }

            $label = Dom::text($a);
            $href = html_entity_decode($a->getAttribute('href'), ENT_QUOTES);

            if ($label === '' || $href === '' || ! LinkPattern::allows($href)) {
                continue;
            }

            $out[array_shift($keys)] = ['label' => Str::limit($label, 37, '…'), 'href' => $href];

            if ($keys === []) {
                break;
            }
        }

        return $out;
    }

    /** The number of links that are not drawn as buttons. */
    public static function plainLinks(DOMElement $el): int
    {
        return count(array_filter(Dom::tags($el, 'a'), fn (DOMElement $a) => ! self::isButton($a)));
    }

    /** A child's shape: its tag and which parts it has, so cards in a grid compare equal. */
    public static function shape(DOMElement $el): string
    {
        $parts = [];

        foreach (['img' => 'i', 'h1' => 'h', 'h2' => 'h', 'h3' => 'h', 'h4' => 'h', 'h5' => 'h', 'h6' => 'h', 'p' => 'p', 'a' => 'a', 'ul' => 'l', 'form' => 'f', 'blockquote' => 'q'] as $tag => $mark) {
            if ($el->getElementsByTagName($tag)->length > 0) {
                $parts[$mark] = $mark;
            }
        }

        ksort($parts);

        return strtolower($el->tagName).':'.implode('', $parts);
    }

    /**
     * The most common shape among `$kids`, and how many have it.
     *
     * @param  list<DOMElement>  $kids
     * @return array{0: string, 1: int}
     */
    public static function dominant(array $kids): array
    {
        $counts = array_count_values(array_map(fn (DOMElement $k) => self::shape($k), $kids));
        arsort($counts);

        return [(string) array_key_first($counts), (int) reset($counts)];
    }

    /** A paragraph's words, or the element's own when it has none. */
    public static function body(DOMElement $el, string $skip = ''): string
    {
        $p = Dom::firstTag($el, 'p');
        $text = Dom::text($p);

        if ($text === '' || $text === $skip) {
            $clone = $el->cloneNode(true);

            if ($clone instanceof DOMElement) {
                foreach (Dom::tags($clone, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'button') as $drop) {
                    $drop->parentNode?->removeChild($drop);
                }
                $text = Dom::text($clone);
            }
        }

        return $text;
    }

    /**
     * A hero from a block and the line that is its headline: the headline, one
     * line under it, perhaps a short line above, a picture (an `<img>` or a
     * background image) and up to two buttons — and **nothing else**. Every
     * word of the block must be one of those, or it is the start of a page and
     * its paragraphs are text. Shared by `GenericHero` (the `<h1>`) and
     * `HeroBlock` (a banner with no `<h1>`).
     */
    public static function hero(DOMElement $el, DOMElement $headline): ?Piece
    {
        $heading = Dom::text($headline);
        $total = Dom::text($el);

        if (mb_strlen($total) > 520
            || count(Dom::tags($el, 'h1', 'h2', 'h3')) > 3
            || Dom::firstTag($el, 'form', 'table', 'ul', 'ol') !== null
            || $el->getElementsByTagName('img')->length > 1
            || self::plainLinks($el) > 0) {
            return null;
        }

        $kicker = '';
        $lede = '';
        $seen = false;

        foreach (Dom::descendants($el) as $node) {
            if ($node->isSameNode($headline)) {
                $seen = true;

                continue;
            }

            $text = Dom::text($node);

            if ($text === '' || $text === $heading || self::kids($node) !== [] || self::inside($node, $headline, $el)
                || ! in_array(strtolower($node->tagName), ['p', 'div', 'span', 'small', 'h2', 'h3', 'h4', 'h5', 'h6'], true)) {
                continue;
            }

            if (! $seen && $kicker === '' && mb_strlen($text) <= 80) {
                $kicker = $text;
            } elseif ($seen && $lede === '') {
                $lede = $text;
            } else {
                // A second line of words has nowhere to go in a hero.
                return null;
            }
        }

        $buttons = self::buttons($el);
        $kept = mb_strlen($heading) + mb_strlen($kicker) + mb_strlen($lede)
            + array_sum(array_map(fn (array $b) => mb_strlen($b['label']), $buttons));

        if (mb_strlen($total) - $kept > 6 || mb_strlen($lede) > 400) {
            return null;
        }

        return new Piece('hero', data: array_filter([
            'kicker' => $kicker !== '' ? $kicker : null,
            'heading' => $heading,
            'lede' => $lede !== '' ? $lede : null,
            'image' => self::image($el) ?? self::background($el),
        ]) + $buttons, html: Dom::html($el));
    }

    /** Whether a node sits inside the headline or a link or button below `$stop`. */
    private static function inside(DOMElement $node, DOMElement $headline, DOMElement $stop): bool
    {
        for ($n = $node->parentNode; $n instanceof DOMElement && ! $n->isSameNode($stop); $n = $n->parentNode) {
            if ($n->isSameNode($headline) || in_array(strtolower($n->tagName), ['a', 'button'], true)) {
                return true;
            }
        }

        return false;
    }
}
