<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A short block that is a heading, a line or two and one or two buttons — the
 * band that closes a landing page. Everything it holds is the call: no other
 * links, no picture, no list, no form. Becomes a call-to-action section.
 */
final class CtaBand implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! in_array(strtolower($el->tagName), ['div', 'section', 'aside', 'article'], true)) {
            return null;
        }

        $heading = Structure::heading($el, 1, 4);
        $title = Dom::text($heading);

        if ($heading === null || $title === '' || mb_strlen($title) > 160 || mb_strlen(Dom::text($el)) > 320) {
            return null;
        }

        if (Dom::firstTag($el, 'form', 'ul', 'ol', 'table', 'img', 'iframe') !== null
            || count(Dom::tags($el, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6')) > 1
            || count(Dom::tags($el, 'p')) > 2
            || Structure::plainLinks($el) > 0) {
            return null;
        }

        $buttons = Structure::buttons($el);

        if ($buttons === []) {
            return null;
        }

        $lede = '';

        foreach (Dom::tags($el, 'p') as $p) {
            $text = Dom::text($p);

            if ($text !== '' && $text !== $title) {
                $lede = $text;
                break;
            }
        }

        return new Piece('cta', data: array_filter([
            'heading' => $title,
            'lede' => $lede !== '' ? mb_substr($lede, 0, 400) : null,
            'tone' => 'brand',
        ]) + $buttons, html: Dom::html($el));
    }
}
