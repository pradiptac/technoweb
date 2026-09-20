<?php

namespace App\Enums;

/**
 * How one picture gives way to the next in a gallery's lightbox.
 *
 * The enum owns the list the way `MailTransport` and `SignInChannel` do —
 * value, label and the sentence the console shows beside it — so adding one is
 * a case here rather than a change in four files that then have to agree. The
 * options are **sent by the API** and never listed in TypeScript, the rule
 * `schema_type_options` and `meta.locations` already follow: two hand-written
 * copies of one list of strings is exactly the drift nothing type-checks
 * across the wire.
 *
 * `Fade` is the default because it is the one transition that says nothing
 * about direction. A slide implies the pictures are in a row and that you are
 * moving along it, which is true here — but it is also the one that reads
 * worst when a viewer jumps by pressing a thumbnail, and fade is never wrong.
 */
enum GalleryTransition: string
{
    case Fade = 'fade';
    case Slide = 'slide';
    case Zoom = 'zoom';
    case None = 'none';

    public function label(): string
    {
        return match ($this) {
            self::Fade => 'Fade',
            self::Slide => 'Slide',
            self::Zoom => 'Zoom',
            self::None => 'None',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Fade => 'One picture dissolves into the next. The default, and the one that never looks wrong.',
            self::Slide => 'The next picture moves in from the side it is coming from.',
            self::Zoom => 'The picture settles into place from slightly smaller.',
            self::None => 'The picture is replaced outright. Choose this for photographs somebody is comparing.',
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
