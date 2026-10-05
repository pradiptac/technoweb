<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\PriceReader;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A pricing table: Elementor's price table, Divi's pricing tables,
 * Stackable's pricing box, a theme's `pricing-table` or `price-card` — and,
 * failing a class, a row of two to four cards that each hold a price, a list
 * and a button. Neighbouring plans are one pricing block.
 */
final class PricingRecogniser implements Recogniser
{
    private const PLAN = '/^(elementor-price-table|et_pb_pricing_table|stk-block-pricing-box|pricing-table|price-table|pricing-plan|price-plan|pricing-box|price-box|pricing-card|price-card|pricing-column|plan-card|pricing-item|pricing-package)$/';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        // Elementor draws the ribbon beside the table, inside the widget, so the widget is the plan.
        if (Dom::has($el, '/^elementor-widget-price-table$/') && ($table = Dom::first($el, '/^elementor-price-table$/'))) {
            $plan = PriceReader::plan($table, false, Dom::text(Dom::first($el, '/^elementor-ribbon-inner$/')));

            return $plan !== null ? new Piece('pricing', [$plan], html: Dom::html($el)) : null;
        }

        if (Dom::has($el, self::PLAN) && ! Dom::contains($el, self::PLAN)) {
            $plan = PriceReader::plan($el, Dom::has($el, '/^et_pb_featured_table$/'));

            return $plan !== null ? new Piece('pricing', [$plan], html: Dom::html($el)) : null;
        }

        return $this->cards($el);
    }

    /**
     * A row of cards that are plans by their content: each a price, a list of
     * at least two points and a link, and short enough to be a card.
     */
    private function cards(DOMElement $el): ?Piece
    {
        $tag = strtolower($el->tagName);
        if (! in_array($tag, ['div', 'section'], true) || Dom::contains($el, self::PLAN)) {
            return null;
        }

        $cards = array_map(fn (DOMElement $c) => self::unwrap($c), Dom::children($el));
        if (count($cards) < 2 || count($cards) > 4) {
            return null;
        }

        $plans = [];
        foreach ($cards as $card) {
            $text = Dom::text($card);
            if (mb_strlen($text) > 1200 || ! preg_match(PriceReader::CURRENCY, $text)
                || count(Dom::tags($card, 'li')) < 2 || Dom::tags($card, 'a') === [] || count(Dom::tags($card, 'ul', 'ol')) > 1) {
                return null;
            }
            $plan = PriceReader::plan($card);
            if ($plan === null) {
                return null;
            }
            $plans[] = $plan;
        }

        return new Piece('pricing', $plans, html: Dom::html($el));
    }

    /** A card wrapped in one column wrapper is the card. */
    private static function unwrap(DOMElement $el): DOMElement
    {
        while (count($children = Dom::children($el)) === 1 && trim((string) $el->textContent) === trim((string) $children[0]->textContent)) {
            $el = $children[0];
        }

        return $el;
    }
}
