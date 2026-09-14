<?php

namespace App\Enums;

/**
 * How a slider arranges its picture and its words.
 *
 * `Full` is the banner every slider on this site has always been: the picture
 * fills the whole container and the caption sits on top of it, anchored by the
 * slide's own `SlideCaptionPosition`. `Split` is the shop's two-column
 * treatment — words in one half, picture in the other — where the heading is
 * read at display size rather than laid over a photograph. `Cards` is the
 * stacked-cards carousel: the current slide fills the box the way `Full`
 * does, and the rest wait as a row of small cards a visitor presses to bring
 * forward — so it is a *layout*, an arrangement of the pictures, and not a
 * `SliderTransition`, which only says how one picture gives way to the next.
 * Under `Cards` that setting is ignored: the card growing into the box is
 * the transition, the same way `Split` ignores each slide's caption anchor.
 *
 * A slider-level setting rather than a per-slide one, unlike the caption
 * anchor: the layout is the shape of the box the carousel occupies, and a
 * carousel whose slides changed shape as they advanced would move everything
 * below it on every tick.
 *
 * `Full` is the default because it is what every existing row already renders.
 * The same rule `SliderTransition` follows: a migration must not change what a
 * live install looks like on the deploy that runs it.
 */
enum SliderLayout: string
{
    case Full = 'full';
    case Split = 'split';
    case Cards = 'cards';

    public function label(): string
    {
        return match ($this) {
            self::Full => 'Full width',
            self::Split => 'Split — words beside the picture',
            self::Cards => 'Stacked cards',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Full => 'The picture fills the whole width and the words sit on top of it, '
                .'anchored wherever each slide puts them. The default, and what a banner '
                .'across the top of a page usually wants.',
            self::Split => 'The words take one half and the picture the other, so the heading is '
                .'read at full size on the page background rather than over a photograph. '
                .'Each slide\'s caption position is ignored, since there is nothing to '
                .'position it against.',
            self::Cards => 'The current slide fills the box with its words, and the other slides '
                .'wait as a row of small cards over one corner; pressing a card brings it '
                .'forward and the previous picture joins the end of the row. The transition '
                .'setting is ignored — the card growing into the box is the transition. '
                .'Needs at least two slides, or it shows as a plain banner.',
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
