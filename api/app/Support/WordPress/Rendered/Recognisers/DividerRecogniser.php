<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/** A rule across the page: `<hr>`, Elementor's divider, Divi's. */
final class DividerRecogniser implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (strtolower($el->tagName) === 'hr' || (Dom::has($el, '/^(elementor-widget-divider|et_pb_divider)$/') && Dom::text($el) === '')) {
            return new Piece('divider', html: Dom::html($el));
        }

        return null;
    }
}
