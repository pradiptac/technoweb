<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * A set of pictures: the block editor's gallery, a classic `[gallery]`,
 * Elementor's gallery and carousels, Divi's gallery, Spectra's, Kadence's
 * and Stackable's. Two pictures at least; each is the full-size file where
 * the gallery links to one, with its alt text and caption.
 */
final class GalleryRecogniser implements Recogniser
{
    private const GALLERY = '/^(wp-block-gallery|gallery|elementor-widget-image-gallery|elementor-widget-gallery|elementor-widget-image-carousel|elementor-widget-media-carousel|et_pb_gallery|wp-block-uagb-image-gallery|wp-block-kadence-advancedgallery|stk-block-image-gallery|image-gallery|photo-gallery|image-carousel)$/';

    private const CAPTION = '/(wp-element-caption|blocks-gallery-item__caption|gallery-caption|wp-caption-text|elementor-image-carousel-caption|et_pb_gallery_caption|caption)$/';

    public const MAX = 60;

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! Dom::has($el, self::GALLERY) || Dom::contains($el, self::GALLERY)) {
            return null;
        }

        $items = [];
        $seen = [];

        foreach (Dom::descendants($el) as $node) {
            $tag = strtolower($node->tagName);
            $src = match (true) {
                $tag === 'img' => Dom::src($node),
                $node->hasAttribute('data-thumbnail') => Dom::src($node),
                default => null,
            };
            if ($src === null) {
                continue;
            }

            // The gallery's link to the full-size file, where it has one.
            $link = $node->parentNode instanceof DOMElement && strtolower($node->parentNode->tagName) === 'a' ? $node->parentNode : null;
            $href = $link ? html_entity_decode($link->getAttribute('href'), ENT_QUOTES) : '';
            if ($href !== '' && preg_match('/\.(jpe?g|png|gif|webp|avif)(\?.*)?$/i', $href)) {
                $src = $href;
            }

            $key = (string) preg_replace('/-\d+x\d+(\.[a-z0-9]+)$/i', '$1', (string) strtok($src, '?'));
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            $figure = Dom::closest($node, '/^(wp-block-image|blocks-gallery-item|gallery-item|swiper-slide|et_pb_gallery_item|e-gallery-item)$/', $el);
            $caption = $figure ? Dom::text(Dom::first($figure, self::CAPTION) ?? Dom::firstTag($figure, 'figcaption')) : '';

            $items[] = array_filter([
                'src' => $src,
                'alt' => trim($node->getAttribute('alt')) ?: null,
                'caption' => $caption !== '' ? mb_substr($caption, 0, 200) : null,
            ]);

            if (count($items) >= self::MAX) {
                break;
            }
        }

        return count($items) >= 2 ? new Piece('gallery', $items, html: Dom::html($el)) : null;
    }
}
