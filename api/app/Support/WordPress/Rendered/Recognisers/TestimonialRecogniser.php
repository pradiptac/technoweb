<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A quotation with somebody named: Elementor's testimonial and its carousel
 * slides, Divi's, Spectra's, Kadence's, Stackable's, a theme's
 * `testimonial-item`, or a quote with a `<cite>`. One becomes `testimonial`,
 * neighbours `testimonials`.
 */
final class TestimonialRecogniser extends ItemRecogniser
{
    protected function kind(): string
    {
        return 'testimonial';
    }

    protected function pattern(): string
    {
        return '/^(elementor-testimonial-wrapper|elementor-testimonial|et_pb_testimonial|uagb-testimonial__wrap|kt-testimonial-item-wrap|stk-block-testimonial|testimonial|testimonial-(item|box|card|block|single|slide)|single-testimonial)$/';
    }

    protected function matches(DOMElement $el): bool
    {
        if (strtolower($el->tagName) === 'blockquote') {
            return Dom::firstTag($el, 'cite') !== null;
        }

        return parent::matches($el);
    }

    protected function item(DOMElement $el): ?array
    {
        if (strtolower($el->tagName) === 'blockquote') {
            $cite = Dom::firstTag($el, 'cite');
            $name = Dom::text($cite);
            $cite?->parentNode?->removeChild($cite);
            $quote = Dom::text($el);
            $role = '';
        } else {
            $quote = self::part($el, '/(testimonial(-|__)(content|text)|testimonial_description_inner|tm__desc|testimonial__content|kt-testimonial-content|stk-block-testimonial__text|testimonial-quote)$/');
            if ($quote === '') {
                $quote = Dom::text(Dom::firstTag($el, 'blockquote', 'q')) ?: self::paragraph($el);
            }
            $name = self::part($el, '/(testimonial(-|__)name|testimonial_author|tm__author-name|testimonial-author|kt-testimonial-name|author-name|client-name)$/')
                ?: Dom::text(Dom::firstTag($el, 'cite', 'strong'));
            $role = trim(implode(', ', array_filter([
                self::part($el, '/(testimonial(-|__)(job|title|position|role)|testimonial_position|kt-testimonial-occupation|author-(position|role|title)|designation)$/'),
                self::part($el, '/(testimonial_company|tm__company|testimonial-company|author-company)$/'),
            ])));
        }

        $quote = trim($quote, " \t\n\"“”'");
        $name = trim(ltrim($name, '—–- '));
        if ($quote === '' || $name === '' || $quote === $name) {
            return null;
        }

        $img = Dom::firstTag($el, 'img');

        return array_filter([
            'quote' => self::limit($quote, 800),
            'name' => self::limit($name, 120),
            'role' => $role !== '' ? self::limit($role, 160) : null,
            'photo' => $img ? Dom::src($img) : null,
        ]);
    }
}
