<?php

namespace App\Enums;

/**
 * The kinds of section a builder page is made of (2026-09-26,
 * `docs/page-builder.md`).
 *
 * A page whose `template` is `builder` renders a stack of these instead of
 * its body. Each type validates exactly what it draws
 * (`App\Support\PageSections\SectionRules`) and is presented for the public
 * site by `SectionPresenter`; the console draws its picker from `options()`,
 * sent as `meta.section_types`, never from a list in TypeScript.
 *
 * The value is stored in `pages.blocks[*].type`, so renaming a case is a data
 * migration: a stored section whose type no longer exists is dropped when the
 * page is presented rather than failing the page.
 */
enum PageSectionType: string
{
    case Hero = 'hero';
    case RichText = 'rich_text';
    case MediaText = 'media_text';
    case Features = 'features';
    case Cards = 'cards';
    case ContentBlock = 'content_block';
    case Slider = 'slider';
    case Gallery = 'gallery';
    case Form = 'form';
    case Faq = 'faq';
    case Logos = 'logos';
    case Testimonial = 'testimonial';
    case Video = 'video';
    case Divider = 'divider';
    /*
     * Five self-contained bands added on 2026-10-05 (0.107.0): figures,
     * a numbered process, tabs, a checklist and a call to action drawn in
     * the theme's own closing-band style.
     */
    case Stats = 'stats';
    case Steps = 'steps';
    case Tabs = 'tabs';
    case Checklist = 'checklist';
    case Cta = 'cta';
    /*
     * Four more on 2026-10-05 (0.109.0): plans compared feature by feature,
     * dated milestones, two pictures with a divider between them, and a set
     * of quotations.
     */
    case Comparison = 'comparison';
    case Timeline = 'timeline';
    case BeforeAfter = 'before_after';
    case Testimonials = 'testimonials';
    /**
     * A section from the library, placed linked (2026-10-05): it stores only
     * `saved_id`, and the presenter draws the library's section in its place,
     * so an edit to it reaches every page that places it.
     */
    case Saved = 'saved';

    public function label(): string
    {
        return match ($this) {
            self::Hero => 'Hero',
            self::RichText => 'Text',
            self::MediaText => 'Picture or video with text',
            self::Features => 'Features',
            self::Cards => 'Cards from the catalogue',
            self::ContentBlock => 'Content block',
            self::Slider => 'Slider',
            self::Gallery => 'Gallery',
            self::Form => 'Form',
            self::Faq => 'Questions',
            self::Logos => 'Logo strip',
            self::Testimonial => 'Testimonial',
            self::Video => 'Video',
            self::Divider => 'Divider',
            self::Stats => 'Figures',
            self::Steps => 'Steps',
            self::Tabs => 'Tabs',
            self::Checklist => 'Checklist',
            self::Cta => 'Call to action',
            self::Comparison => 'Comparison table',
            self::Timeline => 'Timeline',
            self::BeforeAfter => 'Before and after',
            self::Testimonials => 'Testimonials',
            self::Saved => 'Saved section',
        };
    }

    public function blurb(): string
    {
        return match ($this) {
            self::Hero => 'The opening band: a heading, a line under it, a picture and up to two buttons. '
                .'First on the page, its heading is the page\'s own title.',
            self::RichText => 'A heading and a body from the editor — lists, tables, links, pictures and '
                .'shortcodes, exactly as a page body.',
            self::MediaText => 'A picture or a video on one side and words on the other, with buttons.',
            self::Features => 'Up to twelve short points in two, three or four columns, each with an icon.',
            self::Cards => 'A live list — solutions, services, industries, case studies, posts, articles or '
                .'products — drawn as the theme draws its grids. It follows the catalogue as it changes.',
            self::ContentBlock => 'A published CTA banner, stat bar, pricing table or technology stack.',
            self::Slider => 'A published slider, in whatever layout it was built with.',
            self::Gallery => 'A published gallery with its tabs and lightbox.',
            self::Form => 'A published form, with a heading above it.',
            self::Faq => 'Questions that open, written here or taken from this page\'s own FAQs. '
                .'They join the page\'s one FAQ listing for search engines.',
            self::Logos => 'A strip of client logos or the brands you carry, moving the way the theme moves it.',
            self::Testimonial => 'One quotation, with who said it and a photo.',
            self::Video => 'A YouTube video, played only when somebody presses it, or a video from the library.',
            self::Divider => 'Space between two sections, with or without a rule.',
            self::Stats => 'Up to eight figures that count up as they arrive — as plain numbers, rings or bars.',
            self::Steps => 'A numbered process, down the page with a line joining the steps or across it.',
            self::Tabs => 'Two to eight panels behind tabs, each with words and an optional picture.',
            self::Checklist => 'A list of short points with a tick or an icon, in one to three columns.',
            self::Cta => 'A closing band — a heading, a line and buttons — drawn the way the theme draws its own.',
            self::Comparison => 'Two to four plans side by side, feature by feature, with a tick, a cross or a few words in each cell.',
            self::Timeline => 'Dated milestones joined by a line — a company history, a project, a roll-out.',
            self::BeforeAfter => 'Two pictures of one place with a divider somebody drags across — a rack before and after, a site before and after.',
            self::Testimonials => 'Two to nine quotations as cards, each with who said it and an optional photo.',
            self::Saved => 'A section from the library, kept in step with it: edit it once and every page that places it changes.',
        };
    }

    /**
     * The list, as the console's picker draws it.
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
