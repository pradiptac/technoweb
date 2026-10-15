<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * Tabs: Elementor's tabs and nested tabs, Divi's, Spectra's and Kadence's.
 * The titles and the panels are read separately and paired by position; a
 * tab's words are plain text here, and its first picture comes with it.
 */
final class TabsRecogniser implements Recogniser
{
    /** widget token => [title pattern, panel pattern] */
    private const KINDS = [
        '/^elementor-widget-tabs$/' => ['/^elementor-tab-desktop-title$/', '/^elementor-tab-content$/'],
        '/^(e-n-tabs|elementor-widget-n-tabs)$/' => ['/^e-n-tab-title$/', '/^e-n-tabs-content$/'],
        '/^et_pb_tabs$/' => ['/^et_pb_tabs_controls$/', '/^et_pb_tab_content$/'],
        '/^wp-block-uagb-tabs$/' => ['/^uagb-tab$/', '/^uagb-tabs__body-container$/'],
        '/^wp-block-kadence-tabs$/' => ['/^kt-title-text$/', '/^kt-tab-inner-content$/'],
    ];

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        foreach (self::KINDS as $widget => [$titlePattern, $panelPattern]) {
            if (! Dom::has($el, $widget) || Dom::contains($el, $widget)) {
                continue;
            }

            $titles = Dom::all($el, $titlePattern);
            // Divi's controls are one list; each `<li>` is a title.
            if (count($titles) === 1 && strtolower($titles[0]->tagName) === 'ul') {
                $titles = Dom::tags($titles[0], 'li');
            }
            $panels = Dom::all($el, $panelPattern);
            // Nested tabs keep each panel as a child of one container.
            if (count($panels) === 1 && count($titles) > 1) {
                $panels = Dom::children($panels[0]);
            }

            $items = [];
            foreach ($titles as $i => $title) {
                $panel = $panels[$i] ?? null;
                $label = Dom::text($title);
                $body = Dom::text($panel);
                if ($panel === null || $label === '' || $body === '') {
                    return null;
                }
                $heading = Dom::text(Dom::firstTag($panel, 'h2', 'h3', 'h4', 'h5'));
                $img = Dom::firstTag($panel, 'img');
                $items[] = array_filter([
                    'label' => mb_substr($label, 0, 40),
                    'heading' => $heading !== '' && mb_strlen($heading) <= 120 ? $heading : null,
                    'body' => mb_substr(trim(str_replace($heading, '', $body)) ?: $body, 0, 2000),
                    'image' => $img ? Dom::src($img) : null,
                ]);
            }

            return count($items) >= 2 && count($items) <= 8 ? new Piece('tabs', $items, html: Dom::html($el)) : null;
        }

        return null;
    }
}
