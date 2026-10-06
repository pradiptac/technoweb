<?php

namespace App\Support\PageSections;

use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\ProductCategory;
use App\Models\SavedSection;
use App\Models\Slider;
use App\Models\StoreCategory;
use App\Support\Blocks\BlockRules;
use App\Support\ThemeOptions;
use App\Support\YouTube;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * What a builder page's sections may hold (2026-09-26, `docs/page-builder.md`).
 *
 * `pages.blocks` is a **list** of sections, each
 * `{id, type, hidden, background, reveal, data}`. The list is validated at the depth
 * submitted — `forPayload()` reads each row's `type` and adds that type's own
 * rules under `blocks.N.data.` — so an error comes back keyed where the
 * console's field is (`blocks.3.data.heading`) and every type validates
 * exactly what it draws: `BlockRules`' pattern, one level out.
 *
 * Three things no rule can express are `after()`'s: a picture that is really
 * in the media library, a reference (a content block, slider, gallery, form)
 * that exists **and is published** — a page pointing at a draft would draw
 * nothing and say nothing — and a background, checked by
 * `ThemeOptions::background()`, the rule a homepage section's background
 * already follows, so the two mean the same thing.
 *
 * **Rich text** (`rich_text` and `media_text`'s `body`) is cleaned before any
 * of this runs: the page requests name `blocks.*.data.body` in
 * `richTextFields()`, which the trait reads as a nested path. Every other
 * text field is plain and escaped by React at the sink.
 *
 * `normalise()` is what is stored: only the keys a type declares, the
 * background cleaned, a YouTube link reduced to its id, numbers as numbers.
 * `validated()` would otherwise hand back each `data` whole, because the
 * wildcard `blocks.*.data` itself carries a rule.
 */
final class SectionRules
{
    /** A page is a stack of sections, not a document of them. */
    public const MAX_SECTIONS = 40;

    /**
     * A section's style (2026-10-05, docs/page-builder.md "Style"): how it
     * sits on the page, beside what it says. Every key is optional and each
     * value is a choice from its list — never a number or a colour, so
     * whatever an editor picks still passes the audits. The first of each is
     * what the section does on its own and is never stored.
     */
    public const STYLE = [
        'pad_top' => ['default', 'none', 's', 'l', 'xl'],
        'pad_bottom' => ['default', 'none', 's', 'l', 'xl'],
        'width' => ['default', 'medium', 'narrow'],
        'align' => ['default', 'center'],
        'heading' => ['default', 's', 'l'],
    ];

    /** Where a section may be shown; all three is the default. */
    public const DEVICES = ['phone', 'tablet', 'desktop'];

    /** An in-page link target: `#pricing`. */
    public const ANCHOR = '/^[a-z][a-z0-9-]{0,47}$/';

    public const HERO_LAYOUTS = ['split', 'centered', 'cover'];

    /** The live lists a `cards` section can draw; `SectionPresenter::cards()` reads each. */
    public const CARD_SOURCES = [
        'solutions' => 'Solutions',
        'services' => 'Services',
        'industries' => 'Industries',
        'case_studies' => 'Case studies',
        'blog' => 'Blog posts',
        'knowledge' => 'Knowledge base articles',
        'products' => 'Products (catalogue)',
        'store_products' => 'Products (shop)',
    ];

    private const ICON = 'regex:/^[a-z0-9-]{1,40}$/';

    /** How a `stats` section draws its figures; rings and bars need a percentage. */
    public const STAT_DISPLAYS = ['figures', 'rings', 'bars'];

    /**
     * The rules for the whole list, generated per row from each row's type.
     *
     * @return array<string, mixed>
     */
    public static function forPayload(mixed $blocks, string $prefix = 'blocks'): array
    {
        $rules = [
            $prefix => ['nullable', 'array', 'max:'.self::MAX_SECTIONS],
            "{$prefix}.*" => ['array'],
            "{$prefix}.*.id" => ['required', 'string', 'uuid'],
            "{$prefix}.*.type" => ['required', 'string', Rule::enum(PageSectionType::class)],
            "{$prefix}.*.hidden" => ['sometimes', 'boolean'],
            "{$prefix}.*.background" => ['nullable', 'array'],
            // How the section arrives on scroll: an id from the frontend's
            // `SECTION_REVEALS`, checked for shape only — the rule every
            // `motion_*` id follows, since the list lives with the CSS.
            "{$prefix}.*.reveal" => ['nullable', 'string', 'regex:'.ThemeOptions::REVEAL],
            "{$prefix}.*.style" => ['nullable', 'array'],
            "{$prefix}.*.style.pad_top" => ['nullable', Rule::in(self::STYLE['pad_top'])],
            "{$prefix}.*.style.pad_bottom" => ['nullable', Rule::in(self::STYLE['pad_bottom'])],
            "{$prefix}.*.style.width" => ['nullable', Rule::in(self::STYLE['width'])],
            "{$prefix}.*.style.align" => ['nullable', Rule::in(self::STYLE['align'])],
            "{$prefix}.*.style.heading" => ['nullable', Rule::in(self::STYLE['heading'])],
            "{$prefix}.*.style.anchor" => ['nullable', 'string', 'regex:'.self::ANCHOR],
            "{$prefix}.*.style.show_on" => ['nullable', 'array', 'min:1'],
            "{$prefix}.*.style.show_on.*" => ['string', Rule::in(self::DEVICES)],
            "{$prefix}.*.data" => ['present', 'array'],
        ];

        if (! is_array($blocks)) {
            return $rules;
        }

        foreach ($blocks as $i => $block) {
            $type = is_array($block) ? PageSectionType::tryFrom((string) ($block['type'] ?? '')) : null;
            if (! $type) {
                continue;
            }
            foreach (self::for($type, "{$prefix}.{$i}.data") as $key => $rule) {
                $rules["{$prefix}.{$i}.data.{$key}"] = $rule;
            }
        }

        return $rules;
    }

    /**
     * One type's rules, keyed relative to its `data`. `$at` is the full path
     * of that `data`, for the rules that name a sibling (`required_if`).
     *
     * @return array<string, mixed>
     */
    public static function for(PageSectionType $type, string $at = 'data'): array
    {
        $heading = ['nullable', 'string', 'max:160'];
        $lede = ['nullable', 'string', 'max:400'];

        return match ($type) {
            PageSectionType::Hero => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => ['required', 'string', 'max:160'],
                'lede' => $lede,
                'layout' => ['required', Rule::in(self::HERO_LAYOUTS)],
                'image_path' => ['nullable', "required_if:{$at}.layout,split,cover", 'string', 'max:255'],
                ...self::button('primary', $at),
                ...self::button('secondary', $at),
            ],
            PageSectionType::RichText => [
                'heading' => $heading,
                'body' => ['required', 'string', 'max:200000'],
            ],
            PageSectionType::MediaText => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => ['required', 'string', 'max:160'],
                'body' => ['nullable', 'string', 'max:50000'],
                'media' => ['required', Rule::in(['image', 'youtube', 'mp4'])],
                'image_path' => ['nullable', "required_if:{$at}.media,image", 'string', 'max:255'],
                'youtube' => ['nullable', "required_if:{$at}.media,youtube", 'string', 'max:255'],
                'video_path' => ['nullable', "required_if:{$at}.media,mp4", 'string', 'max:255'],
                'side' => ['nullable', Rule::in(['left', 'right'])],
                ...self::button('primary', $at),
                ...self::button('secondary', $at),
            ],
            PageSectionType::Features => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'columns' => ['nullable', 'integer', Rule::in([2, 3, 4])],
                'items' => ['required', 'array', 'min:1', 'max:12'],
                'items.*.icon' => ['nullable', 'string', self::ICON],
                'items.*.title' => ['required', 'string', 'max:80'],
                'items.*.body' => ['nullable', 'string', 'max:300'],
                'items.*.href' => ['nullable', 'string', 'max:2048', BlockRules::LINK],
                'items.*.link_label' => ['nullable', 'string', 'max:40'],
            ],
            PageSectionType::Cards => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'source' => ['required', Rule::in(array_keys(self::CARD_SOURCES))],
                'category' => ['nullable', 'string', 'max:160'],
                'limit' => ['nullable', 'integer', 'min:1', 'max:12'],
                'columns' => ['nullable', 'integer', Rule::in([2, 3, 4])],
            ],
            PageSectionType::ContentBlock => [
                'block_id' => ['required', 'integer'],
            ],
            PageSectionType::Slider => [
                'heading' => $heading,
                'slider_id' => ['required', 'integer'],
            ],
            PageSectionType::Gallery => [
                'heading' => $heading,
                'gallery_id' => ['required', 'integer'],
            ],
            PageSectionType::Form => [
                'heading' => $heading,
                'lede' => $lede,
                'form_id' => ['required', 'integer'],
            ],
            PageSectionType::Faq => [
                'heading' => $heading,
                'source' => ['required', Rule::in(['page', 'custom'])],
                'items' => ['nullable', "required_if:{$at}.source,custom", 'array', 'max:30'],
                'items.*.question' => ['required', 'string', 'max:300'],
                'items.*.answer' => ['required', 'string', 'max:2000'],
            ],
            PageSectionType::Logos => [
                'heading' => ['nullable', 'string', 'max:120'],
                'source' => ['required', Rule::in(['clients', 'brands'])],
            ],
            PageSectionType::Testimonial => [
                'quote' => ['required', 'string', 'max:800'],
                'name' => ['required', 'string', 'max:120'],
                'role' => ['nullable', 'string', 'max:160'],
                'photo_path' => ['nullable', 'string', 'max:255'],
            ],
            PageSectionType::Video => [
                'heading' => $heading,
                'source' => ['required', Rule::in(['youtube', 'mp4'])],
                'youtube' => ['nullable', "required_if:{$at}.source,youtube", 'string', 'max:255'],
                'video_path' => ['nullable', "required_if:{$at}.source,mp4", 'string', 'max:255'],
                'caption' => ['nullable', 'string', 'max:300'],
            ],
            PageSectionType::Divider => [
                'size' => ['nullable', Rule::in(['small', 'medium', 'large'])],
                'rule' => ['nullable', 'boolean'],
            ],
            PageSectionType::Stats => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'display' => ['required', Rule::in(self::STAT_DISPLAYS)],
                'columns' => ['nullable', 'integer', Rule::in([2, 3, 4])],
                'items' => ['required', 'array', 'min:1', 'max:8'],
                'items.*.value' => ['required', 'string', 'max:24'],
                'items.*.label' => ['required', 'string', 'max:80'],
                'items.*.icon' => ['nullable', 'string', self::ICON],
                'items.*.percent' => ['nullable', "required_if:{$at}.display,rings,bars", 'integer', 'min:0', 'max:100'],
            ],
            PageSectionType::Steps => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'layout' => ['required', Rule::in(['vertical', 'horizontal'])],
                'items' => ['required', 'array', 'min:2', 'max:8'],
                'items.*.title' => ['required', 'string', 'max:80'],
                'items.*.body' => ['nullable', 'string', 'max:400'],
                'items.*.icon' => ['nullable', 'string', self::ICON],
            ],
            PageSectionType::Tabs => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'items' => ['required', 'array', 'min:2', 'max:8'],
                'items.*.label' => ['required', 'string', 'max:40'],
                'items.*.heading' => ['nullable', 'string', 'max:120'],
                'items.*.body' => ['required', 'string', 'max:2000'],
                'items.*.image_path' => ['nullable', 'string', 'max:255'],
            ],
            PageSectionType::Checklist => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'columns' => ['nullable', 'integer', Rule::in([1, 2, 3])],
                'items' => ['required', 'array', 'min:1', 'max:24'],
                'items.*.text' => ['required', 'string', 'max:200'],
                'items.*.icon' => ['nullable', 'string', self::ICON],
                ...self::button('primary', $at),
                ...self::button('secondary', $at),
            ],
            PageSectionType::Cta => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => ['required', 'string', 'max:160'],
                'lede' => $lede,
                'tone' => ['nullable', Rule::in(['brand', 'accent'])],
                'call' => ['nullable', 'boolean'],
                ...self::button('primary', $at),
                ...self::button('secondary', $at),
            ],
            // Plans across, features down. A cell is "yes", "no", a few words
            // or blank, by position under the plan it belongs to.
            PageSectionType::Comparison => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'plans' => ['required', 'array', 'min:2', 'max:4'],
                'plans.*.name' => ['required', 'string', 'max:40'],
                'plans.*.note' => ['nullable', 'string', 'max:60'],
                'highlight' => ['nullable', 'integer', 'min:0', 'max:3'],
                'rows' => ['required', 'array', 'min:1', 'max:20'],
                'rows.*.label' => ['required', 'string', 'max:120'],
                'rows.*.cells' => ['nullable', 'array', 'max:4'],
                'rows.*.cells.*' => ['nullable', 'string', 'max:60'],
                ...self::button('primary', $at),
            ],
            PageSectionType::Timeline => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'items' => ['required', 'array', 'min:2', 'max:12'],
                'items.*.date' => ['required', 'string', 'max:24'],
                'items.*.title' => ['required', 'string', 'max:120'],
                'items.*.body' => ['nullable', 'string', 'max:400'],
            ],
            PageSectionType::BeforeAfter => [
                'heading' => $heading,
                'lede' => $lede,
                'before_path' => ['required', 'string', 'max:255'],
                'after_path' => ['required', 'string', 'max:255'],
                'before_label' => ['nullable', 'string', 'max:24'],
                'after_label' => ['nullable', 'string', 'max:24'],
                'start' => ['nullable', 'integer', 'min:10', 'max:90'],
                'caption' => ['nullable', 'string', 'max:300'],
            ],
            PageSectionType::Testimonials => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'items' => ['required', 'array', 'min:2', 'max:9'],
                'items.*.quote' => ['required', 'string', 'max:600'],
                'items.*.name' => ['required', 'string', 'max:120'],
                'items.*.role' => ['nullable', 'string', 'max:160'],
                'items.*.photo_path' => ['nullable', 'string', 'max:255'],
            ],
            // The team as a live list: everybody, or one department.
            PageSectionType::Team => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'department' => ['nullable', 'string', 'max:80'],
                'limit' => ['nullable', 'integer', 'min:1', 'max:48'],
                'group' => ['nullable', 'boolean'],
            ],
            PageSectionType::Downloads => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'items' => ['required', 'array', 'min:1', 'max:20'],
                'items.*.title' => ['required', 'string', 'max:120'],
                'items.*.file_path' => ['required', 'string', 'max:255'],
                'items.*.note' => ['nullable', 'string', 'max:200'],
            ],
            // A wall-clock time, read in the site's timezone.
            PageSectionType::Countdown => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => ['required', 'string', 'max:160'],
                'lede' => $lede,
                'ends_at' => ['required', 'string', 'date_format:Y-m-d\TH:i'],
                'done_text' => ['nullable', 'string', 'max:160'],
                ...self::button('primary', $at),
                ...self::button('secondary', $at),
            ],
            // Each column's body is rich text, cleaned on write
            // (`blocks.*.data.columns.*.body` in the page requests).
            PageSectionType::Columns => [
                'kicker' => ['nullable', 'string', 'max:80'],
                'heading' => $heading,
                'lede' => $lede,
                'columns' => ['required', 'array', 'min:2', 'max:3'],
                'columns.*.heading' => ['nullable', 'string', 'max:120'],
                'columns.*.body' => ['required', 'string', 'max:20000'],
            ],
            PageSectionType::Map => [
                'heading' => $heading,
                'lede' => $lede,
                'url' => ['required', 'string', 'max:2048', 'starts_with:https://www.google.com/maps/embed'],
                'address' => ['nullable', 'string', 'max:300'],
            ],
            // One of the active theme's homepage sections, by id. Checked for
            // the shape of an id only, the rule `site_theme` and the section
            // order follow: the list is the frontend's (`HOME_SECTIONS`), and
            // an id the active theme does not draw renders nothing.
            PageSectionType::ThemeSection => [
                'section' => ['required', 'string', 'regex:/^[a-z][a-z0-9_-]{0,31}$/'],
            ],
            // A linked library section: only which one. That it exists and is
            // a section (not a template) is checked in `checkData`.
            PageSectionType::Saved => [
                'saved_id' => ['required', 'integer'],
            ],
        };
    }

    /** A button: a label and a link, both or neither. @return array<string, mixed> */
    private static function button(string $key, string $at): array
    {
        return [
            $key => ['nullable', 'array'],
            "{$key}.label" => ['nullable', "required_with:{$at}.{$key}.href", 'string', 'max:40'],
            "{$key}.href" => ['nullable', "required_with:{$at}.{$key}.label", 'string', 'max:2048', BlockRules::LINK],
        ];
    }

    /**
     * Messages a person can act on, for the keys every section shares.
     *
     * @return array<string, string>
     */
    public static function messages(string $prefix = 'blocks'): array
    {
        $d = "{$prefix}.*.data";

        return [
            "{$prefix}.max" => 'A page holds at most '.self::MAX_SECTIONS.' sections.',
            "{$prefix}.*.type.required" => 'Every section needs a type.',
            "{$prefix}.*.type.enum" => 'That is not a kind of section this site can draw.',
            "{$prefix}.*.id.uuid" => 'A section lost its id; remove it and add it again.',
            "{$d}.heading.required" => 'Give this section a heading.',
            "{$d}.body.required" => 'Write the text for this section.',
            "{$d}.image_path.required_if" => 'Choose a picture for this layout.',
            "{$d}.youtube.required_if" => 'Paste the YouTube link.',
            "{$d}.video_path.required_if" => 'Choose a video from the library.',
            "{$d}.items.required" => 'Add at least one item.',
            "{$d}.items.required_if" => 'Add at least one question, or use this page’s FAQs.',
            "{$d}.items.*.title.required" => 'Every item needs a title.',
            "{$d}.items.*.value.required" => 'Every figure needs its number.',
            "{$d}.items.*.label.required" => 'Every item needs a label.',
            "{$d}.items.*.percent.required_if" => 'Rings and bars need a percentage, 0 to 100.',
            "{$d}.items.*.text.required" => 'Every point needs its words.',
            "{$d}.items.*.body.required" => 'Every tab needs its words.',
            "{$d}.items.*.date.required" => 'Every milestone needs its date.',
            "{$d}.items.*.quote.required" => 'Every quotation needs its words.',
            "{$d}.items.*.name.required" => 'Say who said it.',
            "{$d}.plans.required" => 'Add the plans to compare.',
            "{$d}.plans.min" => 'Compare at least two plans.',
            "{$d}.plans.*.name.required" => 'Every plan needs a name.',
            "{$d}.rows.required" => 'Add at least one row.',
            "{$d}.rows.*.label.required" => 'Every row needs its feature.',
            "{$d}.before_path.required" => 'Choose the “before” picture.',
            "{$d}.after_path.required" => 'Choose the “after” picture.',
            "{$d}.items.min" => 'Add at least two.',
            "{$d}.display.required" => 'Choose how the figures are drawn.',
            "{$d}.layout.required" => 'Choose a layout.',
            "{$d}.items.*.question.required" => 'Every question needs its question.',
            "{$d}.items.*.answer.required" => 'Every question needs an answer.',
            "{$d}.quote.required" => 'Write the quotation.',
            "{$d}.name.required" => 'Say who said it.',
            "{$d}.primary.label.required_with" => 'A button needs a label.',
            "{$d}.primary.href.required_with" => 'A button needs a link.',
            "{$d}.secondary.label.required_with" => 'A button needs a label.',
            "{$d}.secondary.href.required_with" => 'A button needs a link.',
            "{$d}.primary.href.regex" => 'A link is a path, an https:// address, mailto: or tel:.',
            "{$d}.secondary.href.regex" => 'A link is a path, an https:// address, mailto: or tel:.',
            "{$d}.items.*.href.regex" => 'A link is a path, an https:// address, mailto: or tel:.',
            "{$d}.block_id.required" => 'Choose a content block.',
            "{$d}.slider_id.required" => 'Choose a slider.',
            "{$d}.gallery_id.required" => 'Choose a gallery.',
            "{$d}.form_id.required" => 'Choose a form.',
            "{$d}.source.required" => 'Choose what this section shows.',
            "{$d}.items.*.file_path.required" => 'Choose the file from the media library.',
            "{$d}.ends_at.required" => 'Say when the countdown ends.',
            "{$d}.ends_at.date_format" => 'Give the end as a date and a time.',
            "{$d}.columns.required" => 'Add the columns.',
            "{$d}.columns.min" => 'Two columns at least.',
            "{$d}.columns.*.body.required" => 'Write the text for this column.',
            "{$d}.url.required" => 'Paste the Google Maps embed address.',
            "{$d}.section.required" => 'Choose one of the theme’s sections.',
            "{$d}.section.regex" => 'Choose one of the theme’s sections.',
            "{$d}.url.starts_with" => 'Use a Google Maps embed address: Share, then "Embed a map", then the src from the iframe.',
        ];
    }

    /**
     * Checks no rule can express: files that exist, references that are
     * published, a background that means something, ids that are unique.
     */
    public static function after(Validator $validator, mixed $blocks, string $prefix = 'blocks'): void
    {
        if (! is_array($blocks)) {
            return;
        }

        $seen = [];
        $anchors = [];

        foreach ($blocks as $i => $block) {
            if (! is_array($block)) {
                continue;
            }
            $at = "{$prefix}.{$i}";

            // An anchor is a link target, so two sections cannot share one.
            $anchor = is_array($block['style'] ?? null) ? ($block['style']['anchor'] ?? null) : null;
            if (is_string($anchor) && $anchor !== '') {
                if (isset($anchors[$anchor])) {
                    $validator->errors()->add("{$at}.style.anchor", 'Another section already uses this link name.');
                }
                $anchors[$anchor] = true;
            }

            $id = $block['id'] ?? null;
            if (is_string($id)) {
                if (isset($seen[$id])) {
                    $validator->errors()->add("{$at}.id", 'Two sections share an id; duplicate one again rather than copying it by hand.');
                }
                $seen[$id] = true;
            }

            if (isset($block['background'])) {
                try {
                    $bg = ThemeOptions::background('this section', $block['background']);
                    if (($bg['kind'] ?? null) === 'image' && ! self::mediaExists($bg['image_path'] ?? null)) {
                        $validator->errors()->add("{$at}.background", 'Choose the background picture from the media library.');
                    }
                } catch (\InvalidArgumentException $e) {
                    $validator->errors()->add("{$at}.background", $e->getMessage());
                }
            }

            $type = PageSectionType::tryFrom((string) ($block['type'] ?? ''));
            $data = $block['data'] ?? null;
            if (! $type || ! is_array($data)) {
                continue;
            }

            self::checkData($validator, $type, $data, "{$at}.data");

            // The theme's hero carries the page's title (its h1), so it opens
            // the page and appears once — anywhere else it is a second title.
            if ($type === PageSectionType::ThemeSection && ($data['section'] ?? null) === self::THEME_HERO) {
                if ($i !== array_key_first($blocks)) {
                    $validator->errors()->add("{$at}.data.section", 'The theme’s hero opens the page: move it to the top.');
                }
            }
        }
    }

    /** The theme section that is the page's title: its hero. */
    public const THEME_HERO = 'hero';

    /** @param  array<string, mixed>  $data */
    private static function checkData(Validator $validator, PageSectionType $type, array $data, string $at): void
    {
        $media = function (string $key, ?string $mimePrefix = null, string $message = 'Choose a file from the media library.') use ($validator, $data, $at) {
            $path = $data[$key] ?? null;
            if (! is_string($path) || $path === '') {
                return;
            }
            $row = Media::query()->where('path', $path)->first();
            if (! $row) {
                $validator->errors()->add("{$at}.{$key}", $message);
            } elseif ($mimePrefix && ! str_starts_with((string) $row->mime, $mimePrefix)) {
                $validator->errors()->add("{$at}.{$key}", $mimePrefix === 'video/' ? 'That file is not a video.' : 'That file is not a picture.');
            }
        };

        $reference = function (string $key, string $model, string $noun) use ($validator, $data, $at) {
            $id = $data[$key] ?? null;
            if (! is_numeric($id)) {
                return;
            }
            /** @var class-string<Model> $model */
            $record = $model::query()->find((int) $id);
            if (! $record) {
                $validator->errors()->add("{$at}.{$key}", "That {$noun} no longer exists.");
            } elseif ($record->getAttribute('status') !== PublishStatus::Published) {
                $validator->errors()->add("{$at}.{$key}", "Publish the {$noun} first — a page cannot show a draft.");
            }
        };

        $youtube = function (string $key) use ($validator, $data, $at) {
            $raw = $data[$key] ?? null;
            if (is_string($raw) && $raw !== '' && YouTube::id($raw) === null) {
                $validator->errors()->add("{$at}.{$key}", 'That is not a YouTube link this site can play.');
            }
        };

        // A picture on each item of a list: a tab's, a quotation's photo.
        $itemPictures = function (string $key) use ($validator, $data, $at) {
            foreach ((array) ($data['items'] ?? []) as $n => $item) {
                $path = is_array($item) ? ($item[$key] ?? null) : null;
                if (! is_string($path) || $path === '') {
                    continue;
                }
                $row = Media::query()->where('path', $path)->first();
                if (! $row || ! str_starts_with((string) $row->mime, 'image/')) {
                    $validator->errors()->add("{$at}.items.{$n}.{$key}", 'Choose a picture from the media library.');
                }
            }
        };

        $mediaKind = $data['media'] ?? null;
        $source = $data['source'] ?? null;

        switch ($type) {
            case PageSectionType::Hero:
                $media('image_path', 'image/');
                break;
            case PageSectionType::MediaText:
                if ($mediaKind === 'image') {
                    $media('image_path', 'image/');
                } elseif ($mediaKind === 'mp4') {
                    $media('video_path', 'video/');
                } elseif ($mediaKind === 'youtube') {
                    $youtube('youtube');
                }
                break;
            case PageSectionType::Testimonial:
                $media('photo_path', 'image/');
                break;
            case PageSectionType::Tabs:
                $itemPictures('image_path');
                break;
            case PageSectionType::Testimonials:
                $itemPictures('photo_path');
                break;
            case PageSectionType::Downloads:
                foreach ((array) ($data['items'] ?? []) as $n => $item) {
                    $path = is_array($item) ? ($item['file_path'] ?? null) : null;
                    if (is_string($path) && $path !== '' && ! self::mediaExists($path)) {
                        $validator->errors()->add("{$at}.items.{$n}.file_path", 'Choose the file from the media library.');
                    }
                }
                break;
            case PageSectionType::BeforeAfter:
                $media('before_path', 'image/');
                $media('after_path', 'image/');
                break;
            case PageSectionType::Video:
                if ($source === 'mp4') {
                    $media('video_path', 'video/');
                } elseif ($source === 'youtube') {
                    $youtube('youtube');
                }
                break;
            case PageSectionType::ContentBlock:
                $reference('block_id', ContentBlock::class, 'content block');
                break;
            case PageSectionType::Slider:
                $reference('slider_id', Slider::class, 'slider');
                break;
            case PageSectionType::Gallery:
                $reference('gallery_id', Gallery::class, 'gallery');
                break;
            case PageSectionType::Form:
                $reference('form_id', Form::class, 'form');
                break;
            case PageSectionType::Cards:
                self::checkCategory($validator, $data, $at);
                break;
            case PageSectionType::Saved:
                $id = $data['saved_id'] ?? null;
                if (is_numeric($id) && ! SavedSection::query()->whereKey((int) $id)->where('kind', SavedSection::KIND_SECTION)->exists()) {
                    $validator->errors()->add("{$at}.saved_id", 'That saved section is no longer in the library.');
                }
                break;
            default:
                break;
        }
    }

    /** @param  array<string, mixed>  $data */
    private static function checkCategory(Validator $validator, array $data, string $at): void
    {
        $slug = $data['category'] ?? null;
        if (! is_string($slug) || $slug === '') {
            return;
        }

        $exists = match ($data['source'] ?? null) {
            'products' => ProductCategory::query()->where('slug', $slug)->exists(),
            'store_products' => StoreCategory::query()->where('slug', $slug)->exists(),
            default => true,
        };

        if (! in_array($data['source'] ?? null, ['products', 'store_products'], true)) {
            $validator->errors()->add("{$at}.category", 'Only a product list is narrowed by category.');
        } elseif (! $exists) {
            $validator->errors()->add("{$at}.category", 'That category does not exist.');
        }
    }

    private static function mediaExists(?string $path): bool
    {
        return is_string($path) && $path !== '' && Media::query()->where('path', $path)->exists();
    }

    /**
     * The list as it is stored: declared keys only, the background cleaned,
     * a YouTube link reduced to its id, ids and counts as integers, an empty
     * button dropped. Run on validated input, so nothing here refuses.
     *
     * @return list<array<string, mixed>>
     */
    public static function normalise(mixed $blocks): array
    {
        if (! is_array($blocks)) {
            return [];
        }

        $out = [];

        // Validated input comes back keyed by position but not in position
        // order: `validated()` rebuilds the list rule by rule, and a section
        // whose first validated key is under a wildcard (a features section
        // with only its points, a tabs section) is rebuilt after the ones
        // behind it. Sorting by key puts the page back the way it was sent.
        ksort($blocks, SORT_NUMERIC);

        foreach (array_values($blocks) as $block) {
            $type = is_array($block) ? PageSectionType::tryFrom((string) ($block['type'] ?? '')) : null;
            if (! $type) {
                continue;
            }

            $data = self::keep(is_array($block['data'] ?? null) ? $block['data'] : [], array_keys(self::for($type)));

            foreach (['block_id', 'slider_id', 'gallery_id', 'form_id', 'saved_id', 'limit', 'columns', 'highlight', 'start'] as $int) {
                if (isset($data[$int]) && is_numeric($data[$int])) {
                    $data[$int] = (int) $data[$int];
                }
            }
            foreach (['rule', 'call', 'group'] as $bool) {
                if (isset($data[$bool])) {
                    $data[$bool] = filter_var($data[$bool], FILTER_VALIDATE_BOOLEAN);
                }
            }
            // A percentage belongs to rings and bars, and is a number.
            if ($type === PageSectionType::Stats && is_array($data['items'] ?? null)) {
                $measured = in_array($data['display'] ?? null, ['rings', 'bars'], true);
                $data['items'] = array_map(function (array $item) use ($measured) {
                    if ($measured && isset($item['percent']) && is_numeric($item['percent'])) {
                        $item['percent'] = (int) $item['percent'];
                    } else {
                        unset($item['percent']);
                    }

                    return $item;
                }, $data['items']);
            }
            if (isset($data['youtube']) && is_string($data['youtube'])) {
                $data['youtube'] = YouTube::id($data['youtube']);
            }
            foreach (['primary', 'secondary'] as $button) {
                if (array_key_exists($button, $data) && ! filled($data[$button]['label'] ?? null)) {
                    unset($data[$button]);
                }
            }
            // A list of questions belongs to "custom" alone.
            if ($type === PageSectionType::Faq && ($data['source'] ?? null) === 'page') {
                unset($data['items']);
            }

            $background = null;
            if (is_array($block['background'] ?? null)) {
                $background = ThemeOptions::background('this section', $block['background']);
                unset($background['enabled']);
            }

            $out[] = [
                'id' => (string) $block['id'],
                'type' => $type->value,
                'hidden' => filter_var($block['hidden'] ?? false, FILTER_VALIDATE_BOOLEAN),
                'background' => $background ?: null,
                // `default` is what the section does on its own, so it is
                // never stored: absent and `default` are one answer.
                'reveal' => self::reveal($block['reveal'] ?? null),
                'style' => self::style($block['style'] ?? null),
                'data' => (object) $data,
            ];
        }

        return $out;
    }

    /**
     * The style as stored: only the keys that differ from what the section
     * does on its own, or null when nothing does — so a section nobody styled
     * stores and renders exactly as before.
     *
     * @return array<string, mixed>|null
     */
    public static function style(mixed $style): ?array
    {
        if (! is_array($style)) {
            return null;
        }
        $out = [];
        foreach (self::STYLE as $key => $choices) {
            $value = $style[$key] ?? null;
            if (is_string($value) && $value !== $choices[0] && in_array($value, $choices, true)) {
                $out[$key] = $value;
            }
        }
        if (is_string($style['anchor'] ?? null) && preg_match(self::ANCHOR, $style['anchor'])) {
            $out['anchor'] = $style['anchor'];
        }
        if (is_array($style['show_on'] ?? null)) {
            $devices = array_values(array_intersect(self::DEVICES, $style['show_on']));
            if ($devices !== [] && count($devices) < count(self::DEVICES)) {
                $out['show_on'] = $devices;
            }
        }

        return $out === [] ? null : $out;
    }

    /** A stored reveal id, or null for the section's own default. */
    public static function reveal(mixed $reveal): ?string
    {
        return is_string($reveal) && $reveal !== 'default' && preg_match(ThemeOptions::REVEAL, $reveal)
            ? $reveal
            : null;
    }

    /**
     * `$data` narrowed to the keys the rules declare — `heading`,
     * `primary.label`, `items.*.title` — recursively, so a key nothing
     * validates is never stored.
     *
     * @param  array<string, mixed>  $data
     * @param  list<string>  $keys
     * @return array<string, mixed>
     */
    private static function keep(array $data, array $keys): array
    {
        $tree = [];
        foreach ($keys as $key) {
            $parts = explode('.', $key, 2);
            $tree[$parts[0]] ??= [];
            if (isset($parts[1])) {
                $tree[$parts[0]][] = $parts[1];
            }
        }

        $out = [];
        foreach ($tree as $key => $children) {
            if (! array_key_exists($key, $data) || $data[$key] === null || $data[$key] === '') {
                continue;
            }
            $value = $data[$key];

            // A list of plain values — a comparison row's cells — kept by
            // position, a blank one as null, so each stays under its column.
            if ($children === ['*']) {
                if (is_array($value)) {
                    ksort($value, SORT_NUMERIC);
                    $out[$key] = array_map(
                        fn ($v) => is_string($v) ? (trim($v) === '' ? null : trim($v)) : (is_scalar($v) ? $v : null),
                        array_values($value),
                    );
                }

                continue;
            }

            if ($children === []) {
                // A leaf: scalars only. An object where a string belongs is dropped.
                if (is_scalar($value)) {
                    $out[$key] = is_string($value) ? trim($value) : $value;
                }

                continue;
            }

            if (! is_array($value)) {
                continue;
            }

            $wild = array_values(array_map(fn ($c) => substr($c, 2), array_filter($children, fn ($c) => str_starts_with($c, '*.'))));
            if ($wild !== []) {
                // The same reordering `normalise()` undoes for sections, one level in.
                ksort($value, SORT_NUMERIC);
                $out[$key] = array_map(
                    fn ($row) => is_array($row) ? self::keep($row, $wild) : [],
                    array_values($value),
                );
            } else {
                $out[$key] = self::keep($value, $children);
            }
        }

        return $out;
    }
}
