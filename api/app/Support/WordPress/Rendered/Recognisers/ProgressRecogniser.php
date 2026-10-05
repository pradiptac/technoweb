<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A skill or progress bar: Elementor's progress widget, a Divi bar counter,
 * a theme's `progress-bar` or `skill-bar`. Becomes a figure drawn as a bar,
 * with its percentage.
 */
final class ProgressRecogniser extends ItemRecogniser
{
    protected function kind(): string
    {
        return 'bars';
    }

    protected function pattern(): string
    {
        return '/^(elementor-widget-progress|et_pb_counter_\d+|skill-bar|skillbar|skill-item|progress-item|progress-bar-item|uagb-progress-bar)$/';
    }

    protected function item(DOMElement $el): ?array
    {
        $percent = null;
        foreach ([$el, ...Dom::descendants($el)] as $node) {
            foreach (['data-max', 'data-width', 'data-percent', 'data-percentage', 'data-value', 'aria-valuenow'] as $attr) {
                if (preg_match('/^(\d{1,3})(\.\d+)?%?$/', trim($node->getAttribute($attr)), $m)) {
                    $percent = (int) $m[1];
                    break 2;
                }
            }
            if (Dom::has($node, '/(bar|fill|amount)$/') && preg_match('/width\s*:\s*(\d{1,3})(\.\d+)?%/', $node->getAttribute('style'), $m)) {
                $percent = (int) $m[1];
                break;
            }
        }
        if ($percent === null && preg_match('/(\d{1,3})\s*%/', Dom::text($el), $m)) {
            $percent = (int) $m[1];
        }

        $label = self::part($el, '/(^elementor-title|counter_title|skill-title|skill-name|progress-title|progress-label|title|label)$/');
        if ($label === '') {
            $label = trim((string) preg_replace('/\d{1,3}\s*%/', '', self::heading($el) ?: Dom::text($el)));
        }

        if ($percent === null || $percent > 100 || $label === '') {
            return null;
        }

        return ['value' => $percent.'%', 'label' => self::limit($label, 80), 'percent' => $percent];
    }
}
