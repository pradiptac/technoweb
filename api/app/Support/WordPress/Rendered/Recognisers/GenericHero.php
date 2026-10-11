<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * The page's opening block when it holds the `<h1>`: a short block with the
 * headline, a line under it (and perhaps a short line above), a picture (an
 * `<img>` or a background image) and up to two buttons. Only at the very top,
 * and only when the block is small *and nothing in it would be lost* — the
 * headline, the one line, the line above and the buttons must account for all
 * its words, or it is just the start of a page with an `<h1>` in it, and its
 * paragraphs are text. A wrapper around the whole page holds an `<h1>` too,
 * and is not a hero.
 */
final class GenericHero implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! $opening || ! in_array(strtolower($el->tagName), ['div', 'section', 'header', 'article', 'main'], true)) {
            return null;
        }

        $h1 = Structure::heading($el, 1, 1);
        $heading = Dom::text($h1);

        if ($h1 === null || $heading === '' || mb_strlen($heading) > 160) {
            return null;
        }

        $total = Dom::text($el);

        if (mb_strlen($total) > 520
            || count(Dom::tags($el, 'h1', 'h2', 'h3')) > 3
            || Dom::firstTag($el, 'form', 'table', 'ul', 'ol') !== null
            || $el->getElementsByTagName('img')->length > 1
            || Structure::plainLinks($el) > 0) {
            return null;
        }

        $kicker = '';
        $lede = '';
        $seen = false;

        foreach (Dom::descendants($el) as $node) {
            if ($node->isSameNode($h1)) {
                $seen = true;

                continue;
            }

            $text = Dom::text($node);

            if ($text === '' || $text === $heading || Structure::kids($node) !== [] || self::inside($node, $h1, $el)
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

        $buttons = Structure::buttons($el);
        $kept = mb_strlen($heading) + mb_strlen($kicker) + mb_strlen($lede)
            + array_sum(array_map(fn (array $b) => mb_strlen($b['label']), $buttons));

        if (mb_strlen($total) - $kept > 6 || mb_strlen($lede) > 400) {
            return null;
        }

        return new Piece('hero', data: array_filter([
            'kicker' => $kicker !== '' ? $kicker : null,
            'heading' => $heading,
            'lede' => $lede !== '' ? $lede : null,
            'image' => Structure::image($el) ?? Structure::background($el),
        ]) + $buttons, html: Dom::html($el));
    }

    /** Whether a node sits inside the headline or a link or button below `$stop`. */
    private static function inside(DOMElement $node, DOMElement $h1, DOMElement $stop): bool
    {
        for ($n = $node->parentNode; $n instanceof DOMElement && ! $n->isSameNode($stop); $n = $n->parentNode) {
            if ($n->isSameNode($h1) || in_array(strtolower($n->tagName), ['a', 'button'], true)) {
                return true;
            }
        }

        return false;
    }
}
