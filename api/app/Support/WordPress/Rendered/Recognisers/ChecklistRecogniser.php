<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * An icon list — a list whose bullets are ticks: Elementor's icon list,
 * Spectra's, Kadence's and Stackable's. A plain `<ul>` stays text.
 */
final class ChecklistRecogniser implements Recogniser
{
    private const LIST = '/^(elementor-widget-icon-list|wp-block-uagb-icon-list|wp-block-kadence-iconlist|stk-block-icon-list|check-list|checklist|icon-list)$/';

    private const TEXT = '/(elementor-icon-list-text|uagb-icon-list__label|kt-svg-icon-list-text|stk-block-icon-list__text|list-text)$/';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! Dom::has($el, self::LIST) || Dom::contains($el, self::LIST)) {
            return null;
        }

        $nodes = Dom::all($el, self::TEXT);
        if ($nodes === []) {
            $nodes = Dom::tags($el, 'li');
        }

        $items = [];
        foreach ($nodes as $node) {
            $text = Dom::text($node);
            if ($text !== '' && mb_strlen($text) <= 200) {
                $items[] = ['text' => $text];
            }
        }

        return $items === [] ? null : new Piece('checklist', $items, html: Dom::html($el));
    }
}
