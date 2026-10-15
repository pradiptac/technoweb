<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A row of at least four pictures with next to no words — client logos,
 * partner badges, a photo strip. It becomes a gallery (`Parts`): the `logos`
 * section draws this site's own clients or brands, which an imported strip is
 * not, so the pictures are kept as the strip they were.
 */
final class LogoStrip implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if ($el->getElementsByTagName('img')->length < 4 || in_array(strtolower($el->tagName), ['a', 'body', 'html'], true)) {
            return null;
        }

        // Words beside the pictures make it something else — cards, a team, a gallery with captions.
        if (mb_strlen(Dom::text($el)) > 60 || Dom::firstTag($el, 'form', 'table') !== null) {
            return null;
        }

        $items = [];

        foreach (Dom::tags($el, 'img') as $img) {
            $src = Dom::src($img);

            if ($src !== null) {
                $items[$src] = array_filter(['src' => $src, 'alt' => trim($img->getAttribute('alt'))]);
            }
        }

        return count($items) >= 4 ? new Piece('gallery', array_values($items), html: Dom::html($el)) : null;
    }
}
