<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\LinkPattern;
use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;
use Illuminate\Support\Str;

/**
 * Three or more siblings of one shape — a picture or icon, a heading, a few
 * words, perhaps a link — which is what a grid of services, features or
 * steps is in every framework: a Bootstrap row of columns, a Tailwind grid, a
 * Webflow collection, a `<ul>` of list items. Becomes a features section.
 *
 * Careful to claim nothing else: the siblings must be at least 80% one shape
 * with a heading each, short (a card, not an article), and the block must hold
 * no form. A card's picture rides along as `photo`: a features item has an
 * icon and no photograph, so the importer draws a pictured set as a layout
 * section (a card per column) instead.
 */
final class RepeatedCards implements Recogniser
{
    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        $kids = Structure::kids($el);

        if (count($kids) < 3 || count($kids) > 36 || in_array(strtolower($el->tagName), ['body', 'html', 'nav', 'table', 'tbody', 'select', 'dl'], true)) {
            return null;
        }

        [$shape, $same] = Structure::dominant($kids);

        if ($same < 3 || $same < count($kids) * 0.8 || ! preg_match('/:[^:]*h/', $shape)) {
            return null;
        }

        if (Dom::firstTag($el, 'form', 'table') !== null) {
            return null;
        }

        $items = [];

        foreach ($kids as $kid) {
            if (Structure::shape($kid) !== $shape) {
                continue;
            }

            $item = $this->item($kid);

            if ($item === null) {
                return null;
            }

            $items[] = $item;
        }

        return count($items) >= 3 ? new Piece('features', $items, html: Dom::html($el)) : null;
    }

    /** @return ?array<string, string> */
    private function item(DOMElement $card): ?array
    {
        $heading = Structure::heading($card);
        $title = Dom::text($heading);
        $body = Structure::body($card, $title);

        if ($title === '' || mb_strlen($title) > 80 || mb_strlen($body) > 300 || mb_strlen(Dom::text($card)) > 420) {
            return null;
        }

        $item = ['title' => $title];

        // The picture comes along: the importer draws a pictured card as a layout column.
        if (($photo = Structure::image($card)) !== null) {
            $item['photo'] = $photo;
        }

        if ($body !== '' && $body !== $title) {
            $item['body'] = $body;
        }

        // A link on the heading, a button, or the card being one link.
        $link = $heading ? Dom::firstTag($heading, 'a') : null;
        $link ??= strtolower($card->tagName) === 'a' ? $card : Dom::firstTag($card, 'a');

        if ($link instanceof DOMElement) {
            $href = html_entity_decode($link->getAttribute('href'), ENT_QUOTES);

            if ($href !== '' && LinkPattern::allows($href)) {
                $item['href'] = $href;
                $words = Dom::text($link);

                if ($words !== '' && $words !== $title && mb_strlen($words) <= 40) {
                    $item['link_label'] = Str::limit($words, 39, '…');
                }
            }
        }

        return $item;
    }
}
