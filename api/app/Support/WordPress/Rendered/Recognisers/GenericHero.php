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

        return Structure::hero($el, $h1);
    }
}
