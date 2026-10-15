<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A picture beside a heading and some words, in two columns — the most common
 * block on a landing page. Found by structure: a block whose children (after
 * any single wrappers such as a container and a row) are exactly two, one
 * with a picture and almost no words, the other with a heading and a few
 * sentences and no picture. The side the picture is on is kept.
 *
 * The text column's buttons become the section's, and its remaining markup
 * (paragraphs, lists) the section's body, cleaned by the importer.
 */
final class MediaTextBlock implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! in_array(strtolower($el->tagName), ['div', 'section', 'article', 'header', 'li'], true)) {
            return null;
        }

        $kids = Structure::kids($el);

        for ($depth = 0; count($kids) === 1 && $depth < 3; $depth++) {
            $kids = Structure::kids($kids[0]);
        }

        if (count($kids) !== 2) {
            return null;
        }

        [$first, $second] = $kids;
        $firstMedia = $this->isMedia($first);
        $secondMedia = $this->isMedia($second);

        if ($firstMedia === $secondMedia) {
            return null;
        }

        $media = $firstMedia ? $first : $second;
        $text = $firstMedia ? $second : $first;
        $src = Structure::image($media);
        $heading = Structure::heading($text, 1, 4);
        $title = Dom::text($heading);

        if ($src === null || $heading === null || $title === '' || mb_strlen($title) > 160
            || mb_strlen(Dom::text($text)) < 40 || Dom::firstTag($text, 'img', 'form', 'table') !== null) {
            return null;
        }

        $clone = $text->cloneNode(true);

        if (! $clone instanceof DOMElement) {
            return null;
        }

        $buttons = Structure::buttons($clone);

        // The heading and the buttons are the section's own; the rest is its body.
        foreach (Dom::tags($clone, 'h1', 'h2', 'h3', 'h4') as $h) {
            if (Dom::text($h) === $title) {
                $h->parentNode?->removeChild($h);
                break;
            }
        }
        foreach (Dom::tags($clone, 'a') as $a) {
            if (Structure::isButton($a)) {
                $a->parentNode?->removeChild($a);
            }
        }

        $body = '';

        foreach (Dom::tags($clone, 'p', 'ul', 'ol', 'h5', 'h6', 'blockquote') as $node) {
            if (! self::nestedIn($node, $clone)) {
                $body .= Dom::html($node);
            }
        }

        return new Piece('media_text', data: [
            'heading' => $title,
            'body' => $body,
            'image' => $src,
            'side' => $firstMedia ? 'left' : 'right',
        ] + $buttons, html: Dom::html($el));
    }

    /** Whether a list, quote or paragraph sits inside another below `$stop`: it is already in its markup. */
    private static function nestedIn(DOMElement $node, DOMElement $stop): bool
    {
        for ($n = $node->parentNode; $n instanceof DOMElement && ! $n->isSameNode($stop); $n = $n->parentNode) {
            if (in_array(strtolower($n->tagName), ['p', 'ul', 'ol', 'blockquote'], true)) {
                return true;
            }
        }

        return false;
    }

    /** A picture and hardly a word. */
    private function isMedia(DOMElement $el): bool
    {
        return (strtolower($el->tagName) === 'img' || Dom::firstTag($el, 'img', 'picture') !== null)
            && mb_strlen(Dom::text($el)) <= 40
            && Structure::heading($el, 1, 4) === null;
    }
}
