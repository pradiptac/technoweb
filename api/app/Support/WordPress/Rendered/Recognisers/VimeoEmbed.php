<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A Vimeo player (0.164.0). The `video` section plays YouTube or an MP4 and
 * nothing else, so a Vimeo video stays in a text section — as the one markup
 * the editor's sanitiser lets a body carry besides YouTube's: an `<iframe>` to
 * `player.vimeo.com/video/{id}`. The address is rebuilt from the numeric id, so
 * nothing a page put in its `src` (a query, a hash, an `autoplay`) comes along.
 */
final class VimeoEmbed implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (strtolower($el->tagName) !== 'iframe') {
            return null;
        }

        foreach (['data-src', 'data-lazy-src', 'src'] as $attr) {
            $src = trim(html_entity_decode($el->getAttribute($attr), ENT_QUOTES));

            if (preg_match('#^(?:https?:)?//(?:player\.)?vimeo\.com/(?:video/)?(\d{5,12})(?:[/?\#]|$)#i', $src, $m)) {
                return new Piece('text', html: '<iframe src="https://player.vimeo.com/video/'.$m[1].'" width="640" height="360"></iframe>');
            }
        }

        return null;
    }
}
