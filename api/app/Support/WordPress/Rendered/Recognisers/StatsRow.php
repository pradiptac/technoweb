<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;
use Illuminate\Support\Str;

/**
 * Two to six short number-and-label pairs side by side — "500+ projects",
 * "24/7 support", "98% retention". Every child must be a number (a figure
 * with its unit) and a label of a few words; anything wordier is not a
 * statistic. Becomes a figures section.
 */
final class StatsRow implements Recogniser
{
    /** A figure with a short unit after it: 340+, 99.9%, 4h, 24/7, ₹2cr. */
    private const NUMBER = '/^[^\d\w]{0,2}\d[\d,.]*\s?[%+\w×\/]{0,5}$/u';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        $kids = Structure::kids($el);

        if (count($kids) < 2 || count($kids) > 6 || in_array(strtolower($el->tagName), ['body', 'html', 'p', 'a'], true)) {
            return null;
        }

        $items = [];

        foreach ($kids as $kid) {
            if (mb_strlen(Dom::text($kid)) > 90 || Dom::firstTag($kid, 'img', 'form', 'ul', 'ol') !== null) {
                return null;
            }

            $item = $this->item($kid);

            if ($item === null) {
                return null;
            }

            $items[] = $item;
        }

        return new Piece('figures', $items, html: Dom::html($el));
    }

    /** @return ?array{value: string, label: string} */
    private function item(DOMElement $kid): ?array
    {
        $parts = [];

        // The leaves: the elements that hold text and no element child holding text.
        foreach (Dom::descendants($kid) as $node) {
            if (Structure::kids($node) === [] && Dom::text($node) !== '') {
                $parts[] = Dom::text($node);
            }
        }

        if ($parts === []) {
            $parts = array_values(array_filter(preg_split('/\s{2,}|\R/', Dom::text($kid)) ?: []));
        }

        if (count($parts) < 2 || count($parts) > 3) {
            return null;
        }

        $number = array_shift($parts);

        // "500" "+" "projects": a unit on its own line joins the number.
        if (count($parts) > 1 && mb_strlen($parts[0]) <= 2) {
            $number .= array_shift($parts);
        }

        $label = implode(' ', $parts);

        if (! preg_match(self::NUMBER, $number) || mb_strlen($number) > 12 || mb_strlen($label) > 60 || preg_match(self::NUMBER, $label)) {
            return null;
        }

        return ['value' => trim($number), 'label' => Str::limit($label, 79, '…')];
    }
}
