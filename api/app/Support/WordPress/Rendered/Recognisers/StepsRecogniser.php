<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A how-to step: Yoast's and Spectra's how-to blocks, a theme's
 * `process-step`. Neighbours are one steps section.
 */
final class StepsRecogniser extends ItemRecogniser
{
    protected function kind(): string
    {
        return 'steps';
    }

    protected function pattern(): string
    {
        return '/^(schema-how-to-step|uagb-how-to-step|step-item|process-step|process-item|how-it-works-item|work-process-item)$/';
    }

    protected function item(DOMElement $el): ?array
    {
        $title = self::part($el, '/(schema-how-to-step-name|uagb-how-to-step-name|step-title|title)$/')
            ?: self::heading($el)
            ?: Dom::text(Dom::firstTag($el, 'strong'));
        $body = self::part($el, '/(schema-how-to-step-text|uagb-how-to-step-text|step-text|step-description|description|text)$/');
        if ($body === '') {
            $body = trim(str_replace($title, '', Dom::text($el)));
        }

        if ($title === '' || mb_strlen($title) > 80) {
            return null;
        }

        return array_filter(['title' => $title, 'body' => $body !== '' ? self::limit($body, 400) : null]);
    }
}
