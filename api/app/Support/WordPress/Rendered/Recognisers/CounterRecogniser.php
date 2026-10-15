<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A figure that counts up: Elementor's counter, Divi's number counter,
 * Spectra's, Kadence's and Stackable's count-up, a theme's `counter`. The
 * rendered page usually shows 0 until a script runs, so the number is read
 * from the data attribute the script counts to.
 */
final class CounterRecogniser extends ItemRecogniser
{
    private const NUMBER_ATTRS = ['data-to-value', 'data-number-value', 'data-end-number', 'data-endnumber', 'data-end', 'data-to', 'data-count', 'data-target', 'data-value', 'data-number'];

    protected function kind(): string
    {
        return 'figures';
    }

    protected function pattern(): string
    {
        return '/^(elementor-widget-counter|et_pb_number_counter|wp-block-uagb-counter|kb-count-up|wp-block-kadence-countup|stk-block-count-up|counter|counter-(item|box|block)|count-up|number-counter|stat-item|stats-item|funfact|fun-fact)$/';
    }

    protected function item(DOMElement $el): ?array
    {
        $number = null;
        foreach ([$el, ...Dom::descendants($el)] as $node) {
            foreach (self::NUMBER_ATTRS as $attr) {
                $value = trim($node->getAttribute($attr));
                if ($value !== '' && is_numeric(str_replace(',', '', $value))) {
                    $number = $value;
                    break 2;
                }
            }
        }

        $numberEl = Dom::first($el, '/(counter-number$|counter-number-value|percent-value|counter__number|count-up__count|kb-count-up-number|stk-block-count-up__text|number$|count$|value$|digit)/');
        if ($number === null) {
            if (! preg_match('/[\d][\d,.]*/', Dom::text($numberEl ?? $el), $m)) {
                return null;
            }
            $number = $m[0];
        }

        $prefix = self::part($el, '/(prefix)$/');
        $suffix = self::part($el, '/(suffix|percent-sign)$/');
        $label = self::part($el, '/(counter-title|counter__title|count-up__title|kb-count-up-title|title|label|caption)$/');
        if ($label === '') {
            $label = self::heading($el) ?: self::paragraph($el);
        }
        // A title that is only the number again is no label.
        if ($label === '' || preg_match('/^[\d\s,.+%]*$/', $label)) {
            return null;
        }

        $value = trim($prefix.self::grouped($number).$suffix);

        return mb_strlen($value) > 24 ? null : ['value' => $value, 'label' => self::limit($label, 80)];
    }

    /** `12500` as `12,500`; a figure already written with separators is left as written. */
    private static function grouped(string $number): string
    {
        if (preg_match('/^\d{5,}$/', $number)) {
            return number_format((int) $number);
        }

        return $number;
    }
}
