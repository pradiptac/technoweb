<?php

namespace App\Support\WordPress\Rendered\Recognisers;

use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\Recogniser;
use App\Support\YouTube;
use DOMElement;

/**
 * A YouTube video: Elementor's video widget (its address is in
 * `data-settings`, the player is drawn by a script), an embed block or a
 * Divi video holding the iframe, or the iframe on its own.
 */
final class VideoRecogniser implements Recogniser
{
    private const WRAPPER = '/^(elementor-widget-video|wp-block-embed|wp-block-embed-youtube|et_pb_video|wp-block-uagb-video|video-wrapper|video-container|embed-container)$/';

    public function claim(DOMElement $el, bool $opening): ?Piece
    {
        $tag = strtolower($el->tagName);

        if ($tag === 'iframe') {
            $id = self::id($el);

            return $id !== null ? new Piece('video', data: ['youtube' => $id], html: Dom::html($el)) : null;
        }

        if (! Dom::has($el, self::WRAPPER)) {
            return null;
        }

        $id = null;
        $settings = json_decode(html_entity_decode($el->getAttribute('data-settings'), ENT_QUOTES), true);
        if (is_array($settings) && is_string($settings['youtube_url'] ?? null)) {
            $id = YouTube::id($settings['youtube_url']);
        }
        if ($id === null && ($iframe = Dom::firstTag($el, 'iframe'))) {
            $id = self::id($iframe);
        }
        if ($id === null) {
            return null;
        }

        $caption = Dom::text(Dom::firstTag($el, 'figcaption'));

        return new Piece('video', data: array_filter(['youtube' => $id, 'caption' => $caption !== '' ? mb_substr($caption, 0, 300) : null]), html: Dom::html($el));
    }

    private static function id(DOMElement $iframe): ?string
    {
        foreach (['data-src', 'data-lazy-src', 'src'] as $attr) {
            $src = trim(html_entity_decode($iframe->getAttribute($attr), ENT_QUOTES));
            if ($src !== '' && ($id = YouTube::id(str_starts_with($src, '//') ? 'https:'.$src : $src)) !== null) {
                return $id;
            }
        }

        return null;
    }
}
