<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A call to action — a heading, a line and a button: Elementor's call to
 * action, Divi's promo, Spectra's, a theme's `cta-box`.
 */
final class CtaRecogniser implements Recogniser
{
    private const CTA = '/^(elementor-widget-call-to-action|et_pb_promo|wp-block-uagb-call-to-action|stk-block-call-to-action|call-to-action|cta-box|cta-block)$/';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! Dom::has($el, self::CTA) || Dom::contains($el, self::CTA)) {
            return null;
        }

        $heading = Dom::text(Dom::first($el, '/(cta__title|uagb-cta__title|cta-title|promo-title)$/') ?? Dom::firstTag($el, 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'));
        $lede = Dom::text(Dom::first($el, '/(cta__description|uagb-cta__desc|cta-description|cta-text)$/') ?? Dom::firstTag($el, 'p'));
        $buttons = Buttons::in($el);

        if ($heading === '' || mb_strlen($heading) > 160 || $buttons === []) {
            return null;
        }

        return new Piece('cta', data: array_filter([
            'heading' => $heading,
            'lede' => $lede !== '' && $lede !== $heading ? mb_substr($lede, 0, 400) : null,
            'tone' => 'brand',
        ]) + $buttons, html: Dom::html($el));
    }
}
