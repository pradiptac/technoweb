<?php

namespace App\Enums;

/**
 * How one slide gives way to the next in a content slider.
 *
 * A separate enum from `GalleryTransition` rather than a shared one, even
 * though the four values are the same word for word: a slider is a full-width
 * banner reached by loading the page, a gallery's transition is a lightbox
 * reached by clicking a thumbnail, and the two screens describing one shared
 * list would eventually want to say something true of one and not the other.
 * Two short enums that happen to agree today is cheaper than a shared one
 * that has to be generic enough for both forever.
 *
 * The options are **sent by the API** and never listed in TypeScript, the
 * rule `GalleryTransition`, `schema_type_options` and `meta.locations` all
 * follow: two hand-written copies of one list of strings is exactly the
 * drift nothing type-checks across the wire.
 *
 * `Slide` is the default, and that is not the same reasoning
 * `GalleryTransition` uses for defaulting to `Fade`. A gallery with no
 * transition set previously had none at all — replaced outright — so
 * defaulting new and existing rows to `Fade` was a genuine upgrade nobody
 * had to ask for. A slider's existing behaviour, before this column existed,
 * already **was** a slide: a real horizontally-scrollable strip a visitor
 * can swipe, drag or move through with a keyboard, with every slide reachable
 * with no JavaScript at all. Defaulting to anything else would silently
 * change what every slider on every existing install does and looks like,
 * including the homepage hero, the moment this migration ran.
 */
enum SliderTransition: string
{
    case Slide = 'slide';
    case Fade = 'fade';
    case Zoom = 'zoom';
    case None = 'none';

    public function label(): string
    {
        return match ($this) {
            self::Slide => 'Slide',
            self::Fade => 'Fade',
            self::Zoom => 'Zoom',
            self::None => 'None',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Slide => 'The next slide scrolls in from whichever side it is coming from — the '
                .'default, and the one a visitor can also swipe, drag or reach with a keyboard.',
            self::Fade => 'One slide dissolves into the next. Swiping between slides no longer works; '
                .'the arrows and the dots still do.',
            self::Zoom => 'The next slide settles into place from slightly smaller, the same effect '
                .'the gallery lightbox uses.',
            self::None => 'The slide is replaced outright, with no transition. Choose this for a '
                .'banner where the change itself should not draw the eye.',
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
