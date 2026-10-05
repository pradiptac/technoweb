<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A question and its answer: Elementor's accordion, toggle and nested
 * accordion, Divi's toggle and accordion, Yoast's and Rank Math's FAQ
 * blocks, Spectra's FAQ, Kadence's accordion, and any `<details>`.
 * Neighbours are one questions section.
 */
final class FaqRecogniser extends ItemRecogniser
{
    private const QUESTION = '/(elementor-tab-title|elementor-accordion-title|e-n-accordion-item-title-text|et_pb_toggle_title|schema-faq-question|rank-math-question|uagb-question|kt-blocks-accordion-title|faq-question|accordion-title|accordion-header|question)$/';

    private const ANSWER = '/(elementor-tab-content|et_pb_toggle_content|schema-faq-answer|rank-math-answer|uagb-faq-content|kt-accordion-panel-inner|faq-answer|accordion-content|accordion-body|accordion-panel|answer)$/';

    protected function kind(): string
    {
        return 'faq';
    }

    protected function pattern(): string
    {
        return '/^(elementor-accordion-item|elementor-toggle-item|e-n-accordion-item|et_pb_toggle|et_pb_accordion_item|schema-faq-section|rank-math-list-item|uagb-faq-item|kt-accordion-pane|faq-item|accordion-item)$/';
    }

    protected function matches(DOMElement $el): bool
    {
        return strtolower($el->tagName) === 'details' || parent::matches($el);
    }

    protected function item(DOMElement $el): ?array
    {
        $summary = Dom::firstTag($el, 'summary');
        $question = self::part($el, self::QUESTION) ?: Dom::text($summary);
        $answerEl = Dom::first($el, self::ANSWER);

        if ($answerEl !== null) {
            $answer = Dom::text($answerEl);
        } elseif ($summary !== null) {
            $summary->parentNode?->removeChild($summary);
            $answer = Dom::text($el);
        } else {
            return null;
        }

        if ($question === '' || $answer === '' || $question === $answer) {
            return null;
        }

        return ['question' => self::limit($question, 300), 'answer' => self::limit($answer, 2000)];
    }
}
