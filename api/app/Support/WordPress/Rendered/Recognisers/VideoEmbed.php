<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A `<video>` that plays an MP4 file: becomes a video section playing the
 * file from the media library. (YouTube is `VideoRecogniser`'s.) The address
 * is the file's; the media step brings it across.
 */
final class VideoEmbed implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (strtolower($el->tagName) !== 'video') {
            return null;
        }

        $sources = [trim($el->getAttribute('src')), ...array_map(fn (DOMElement $s) => trim($s->getAttribute('src')), Dom::tags($el, 'source'))];

        foreach ($sources as $src) {
            if (preg_match('#^https?://[^?\#]+\.mp4(\?.*)?$#i', $src)) {
                return new Piece('video', data: ['mp4' => $src], html: Dom::html($el));
            }
        }

        return null;
    }
}
