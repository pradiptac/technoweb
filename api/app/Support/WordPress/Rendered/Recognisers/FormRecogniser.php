<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\FormReader;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A form people fill in — the plugin's whole wrapper where there is one, so
 * its response message and spinner do not fall into the text around it.
 * Becomes a form here (`FormReader`) placed as a form section.
 */
final class FormRecogniser implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! FormReader::is($el)) {
            return null;
        }

        $reader = new FormReader;
        $spec = $reader->read($el);

        return $spec === null ? null : new Piece('form', data: $spec + ['dropped' => $reader->dropped], html: Dom::html($el));
    }
}
