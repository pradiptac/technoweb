<?php

namespace App\Enums;

use App\Enums\Concerns\BlockLayoutOptions;

/**
 * The CTA banner layouts (the client, 2026-09-24, from vibeprompts.dev/cta).
 *
 * `band` is the closing band every theme already draws; chosen as the site
 * default it is drawn *by the theme*, with the block's words and buttons.
 * Every other layout is drawn by the block's own component.
 */
enum CtaLayout: string
{
    use BlockLayoutOptions;
    case Band = 'band';
    case Split = 'split';
    case TwoPath = 'two_path';
    case Reassurance = 'reassurance';
    case Newsletter = 'newsletter';
    case GatedDownload = 'gated_download';
    case Countdown = 'countdown';
    case Webinar = 'webinar';
    case Hiring = 'hiring';
    case AppQr = 'app_qr';

    public function label(): string
    {
        return match ($this) {
            self::Band => 'Full-width band',
            self::Split => 'Split with image',
            self::TwoPath => 'Two paths',
            self::Reassurance => 'Button with reassurance',
            self::Newsletter => 'Inline newsletter',
            self::GatedDownload => 'Gated download',
            self::Countdown => 'Countdown',
            self::Webinar => 'Webinar strip',
            self::Hiring => 'Hiring',
            self::AppQr => 'App download with QR',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Band => 'The closing band every page already ends on: a heading, a line of text and two buttons on the brand colour. As the site default it keeps each theme’s own styling.',
            self::Split => 'The words on one side and a picture on the other. The picture can sit on either side.',
            self::TwoPath => 'Two cards side by side for two kinds of visitor — for example "Book an audit" and "Talk to sales" — each with its own heading, line and button.',
            self::Reassurance => 'One strong button with up to four short promises under it, each with a tick: no obligation, a written report, and so on.',
            self::Newsletter => 'Words on the left, an email box and a button on the right. Addresses join the newsletter list; shown only while newsletter signup is switched on.',
            self::GatedDownload => 'A PDF from the media library offered for an email address. Each request lands in Leads, and the link is revealed only after the form is sent.',
            self::Countdown => 'A timer counting down to a date — a launch or the end of an offer — beside the button. When it runs out it hides, or shows a message of your choosing.',
            self::Webinar => 'An event’s date, time and place with a short sign-up form. Each registration lands in Leads.',
            self::Hiring => 'A line about working here with the open vacancies listed under it automatically, newest first.',
            self::AppQr => 'A QR code on a desktop and store buttons on a phone. The QR is an image you upload from the media library.',
        };
    }
}
