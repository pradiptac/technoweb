<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A dated milestone: Spectra's content timeline, a theme's `timeline-item`.
 * Neighbours are one timeline.
 */
final class TimelineRecogniser extends ItemRecogniser
{
    protected function kind(): string
    {
        return 'timeline';
    }

    protected function pattern(): string
    {
        return '/^(uagb-timeline__field|timeline-item|timeline-entry|timeline-event|timeline-block|cd-timeline-block|tl-item)$/';
    }

    protected function item(DOMElement $el): ?array
    {
        $date = self::part($el, '/(uagb-timeline__date-new|uagb-timeline__date-hide|timeline-date|timeline-year|date|year)$/');
        if ($date === '' && ($time = Dom::firstTag($el, 'time'))) {
            $date = Dom::text($time);
        }
        $title = self::part($el, '/(uagb-timeline__heading|timeline-title|title)$/') ?: self::heading($el);
        $body = self::part($el, '/(uagb-timeline-desc-content|timeline-content|timeline-text|description|desc)$/') ?: self::paragraph($el);

        if ($date === '' || mb_strlen($date) > 24 || $title === '' || $title === $date) {
            return null;
        }

        return array_filter([
            'date' => $date,
            'title' => self::limit($title, 120),
            'body' => $body !== '' && $body !== $title ? self::limit($body, 400) : null,
        ]);
    }
}
