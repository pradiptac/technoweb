<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use DOMElement;

/**
 * The page's opening, when it is a picture with a heading over it: the block
 * editor's cover, Divi's full-width header. Only at the very top — a cover
 * further down is a picture in the text.
 */
final class HeroRecogniser implements Recogniser
{
    private const HERO = '/^(wp-block-cover|et_pb_fullwidth_header|wp-block-uagb-container-hero)$/';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        if (! $opening || ! Dom::has($el, self::HERO)) {
            return null;
        }

        $headingEl = Dom::firstTag($el, 'h1', 'h2');
        $heading = Dom::text($headingEl);
        if ($heading === '' || mb_strlen($heading) > 160) {
            return null;
        }

        $img = Dom::first($el, '/(wp-block-cover__image-background|header-image|et_pb_fullwidth_header_image)$/');
        $src = $img !== null && strtolower($img->tagName) !== 'img' ? (($i = Dom::firstTag($img, 'img')) ? Dom::src($i) : null) : ($img ? Dom::src($img) : null);
        if ($src === null && preg_match('/background-image\s*:\s*url\(\s*[\'"]?([^\'")]+)/i', $el->getAttribute('style'), $m)) {
            $src = html_entity_decode($m[1], ENT_QUOTES);
        }
        $lede = Dom::text(Dom::first($el, '/^et_pb_header_content_wrapper$/') ?? Dom::firstTag($el, 'p'));

        return new Piece('hero', data: array_filter([
            'heading' => $heading,
            'lede' => $lede !== '' && $lede !== $heading ? mb_substr($lede, 0, 400) : null,
            'image' => $src,
            'layout' => $src !== null ? 'cover' : 'centered',
        ]) + Buttons::in($el), html: Dom::html($el));
    }
}
