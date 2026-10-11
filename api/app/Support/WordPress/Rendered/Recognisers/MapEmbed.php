<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A Google map embed — the one kind of map the `map` section accepts
 * (`https://www.google.com/maps/embed…`). Any other map iframe stays what it
 * was: markup the sanitiser removes, named by nothing.
 */
final class MapEmbed implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (strtolower($el->tagName) !== 'iframe') {
            return null;
        }

        foreach (['src', 'data-src'] as $attr) {
            $src = trim(html_entity_decode($el->getAttribute($attr), ENT_QUOTES));

            if (str_starts_with($src, 'https://www.google.com/maps/embed')) {
                return new Piece('map', data: ['url' => $src], html: Dom::html($el));
            }
        }

        return null;
    }
}
