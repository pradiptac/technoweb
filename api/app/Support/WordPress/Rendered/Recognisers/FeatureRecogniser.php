<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\LinkPattern;
use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * An icon box, image box, blurb or info box — a short title and a line
 * under it: Elementor's icon and image boxes, Divi's blurb, Spectra's and
 * Kadence's info box, Stackable's icon box, a theme's `feature-box`.
 * Neighbours are one features section.
 */
final class FeatureRecogniser extends ItemRecogniser
{
    protected function kind(): string
    {
        return 'features';
    }

    protected function pattern(): string
    {
        return '/^(elementor-widget-icon-box|elementor-widget-image-box|et_pb_blurb|wp-block-uagb-info-box|uagb-infobox__content-wrap|wp-block-kadence-infobox|stk-block-icon-box|stk-block-feature|icon-box|info-box|feature-box|feature-item|image-box|service-box)$/';
    }

    protected function item(DOMElement $el): ?array
    {
        $titleEl = Dom::first($el, '/(icon-box-title|image-box-title|module_header|ifb-title|info-box-title|kt-blocks-info-box-title|feature-title|box-title)$/')
            ?? Dom::firstTag($el, 'h2', 'h3', 'h4', 'h5', 'h6');
        $title = Dom::text($titleEl);
        $body = self::part($el, '/(icon-box-description|image-box-description|blurb_description|ifb-desc|kt-blocks-info-box-text|feature-description|box-description|description)$/');
        if ($body === '') {
            $body = self::paragraph($el);
        }

        if ($title === '' || mb_strlen($title) > 80 || mb_strlen($body) > 300 || $body === $title) {
            return null;
        }

        $item = ['title' => $title];
        if ($body !== '') {
            $item['body'] = $body;
        }

        // A link on the title, or a "Read more" below it, becomes the item's link.
        $link = $titleEl ? (Dom::firstTag($titleEl, 'a') ?? self::ancestorLink($titleEl, $el)) : null;
        $link ??= Dom::first($el, '/(read-more|more-link|button|btn|ifb-cta-link)/');
        if ($link instanceof DOMElement && strtolower($link->tagName) === 'a') {
            $href = html_entity_decode($link->getAttribute('href'), ENT_QUOTES);
            if ($href !== '' && LinkPattern::allows($href)) {
                $item['href'] = $href;
                $words = Dom::text($link);
                if ($words !== '' && $words !== $title && mb_strlen($words) <= 40) {
                    $item['link_label'] = $words;
                }
            }
        }

        return $item;
    }

    private static function ancestorLink(DOMElement $node, DOMElement $stop): ?DOMElement
    {
        for ($n = $node->parentNode; $n instanceof DOMElement && ! $n->isSameNode($stop); $n = $n->parentNode) {
            if (strtolower($n->tagName) === 'a') {
                return $n;
            }
        }

        return null;
    }
}
