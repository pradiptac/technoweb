<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\LinkPattern;
use App\Support\WordPress\Rendered\Dom;
use DOMElement;
use Illuminate\Support\Str;

/** Up to two buttons inside an element, as a section's `primary` and `secondary`. */
final class Buttons
{
    private const BUTTON = '/(button|btn|wp-block-button__link|et_pb_promo_button|uagb-cta__button|cta__button|elementor-button)/';

    /** @return array<string, array{label: string, href: string}> */
    public static function in(DOMElement $el): array
    {
        $out = [];
        $keys = ['primary', 'secondary'];

        foreach (Dom::tags($el, 'a') as $link) {
            if (! Dom::has($link, self::BUTTON) && ! Dom::closest($link, self::BUTTON, $el)) {
                continue;
            }
            $label = Dom::text($link);
            $href = html_entity_decode($link->getAttribute('href'), ENT_QUOTES);
            if ($label === '' || $href === '' || ! LinkPattern::allows($href)) {
                continue;
            }
            $out[array_shift($keys)] = ['label' => Str::limit($label, 37, '…'), 'href' => $href];
            if ($keys === []) {
                break;
            }
        }

        return $out;
    }
}
