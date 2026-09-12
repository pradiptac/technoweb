<?php

namespace App\Enums;

/**
 * How a slide's words arrive — the heading, the caption and the button, in
 * that order, a beat apart.
 *
 * A separate setting from `SliderTransition`, which is how the *picture*
 * gives way to the next; the two are chosen independently, and a fade
 * between pictures with words rising over them is the ordinary combination.
 * Per slider rather than per slide: an editor setting a style is deciding
 * how the banner behaves, not re-deciding it on every row.
 *
 * `None` is the default, and that is the same argument the transition makes
 * for `Slide`: the words used to appear with the picture, and every existing
 * slider on every existing install must still do exactly that the moment the
 * column arrives.
 *
 * Sent by the API as `meta.caption_animations`, never listed in TypeScript —
 * the rule every option list here follows.
 */
enum SlideCaptionAnimation: string
{
    case None = 'none';
    case Fade = 'fade';
    case Rise = 'rise';
    case Slide = 'slide';
    case Zoom = 'zoom';

    public function label(): string
    {
        return match ($this) {
            self::None => 'None',
            self::Fade => 'Fade in',
            self::Rise => 'Rise',
            self::Slide => 'Slide in',
            self::Zoom => 'Zoom',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::None => 'The words appear with the picture. The default, and what every slider did before this setting existed.',
            self::Fade => 'The heading, then the caption, then the button fade in, a beat apart.',
            self::Rise => 'Each line fades in while rising a little into place — the quiet, usual choice.',
            self::Slide => 'Each line slides in from the left as it fades — livelier, best over a still picture.',
            self::Zoom => 'Each line settles into place from slightly larger, the same feel as the zoom transition.',
        };
    }

    /**
     * The list, as the console renders it.
     *
     * @return list<array{value: string, label: string, blurb: string}>
     */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value' => $c->value,
            'label' => $c->label(),
            'blurb' => $c->blurb(),
        ], self::cases());
    }
}
