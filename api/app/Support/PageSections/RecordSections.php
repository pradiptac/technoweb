<?php

namespace App\Support\PageSections;

use App\Enums\PageSectionType;
use App\Models\SavedSection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Builder sections on a record that is not a page (0.129.0): a solution, a
 * service, an industry, a case study.
 *
 * **The sections take the body area and nothing else** — the client's
 * decision. The record's page keeps its theme heading, its related lists,
 * its FAQs and its closing band; what the sections replace is the written
 * body. So this is the page builder's own list, rules and presenter
 * (`SectionRules`, `SectionPresenter`) with three things a body area cannot
 * hold taken out:
 *
 * - a **hero**, and the **theme's own homepage sections**: the page already
 *   opens on its heading, which is its one `h1`;
 * - an FAQ section reading **"this page's FAQs"**: the record's FAQs are
 *   drawn under the sections already, and the same questions twice is a
 *   page repeating itself. Questions typed into the section are fine, and
 *   join the record's one `FAQPage`.
 *
 * Both are refused on write and dropped again on read, because a linked
 * library section can be edited into one of them after it was placed.
 *
 * `body_layout` chooses which of the two the page draws; neither is cleared
 * by choosing the other.
 */
final class RecordSections
{
    public const LAYOUT_BODY = 'body';

    public const LAYOUT_SECTIONS = 'sections';

    public const LAYOUTS = [self::LAYOUT_BODY, self::LAYOUT_SECTIONS];

    /** Section types a record's body area cannot hold. */
    public const EXCLUDED = [PageSectionType::Hero, PageSectionType::ThemeSection];

    private const EXCLUDED_MESSAGES = [
        'hero' => 'This page already opens with its own heading, so a hero cannot be used here. Use “Media and text” for a picture beside words.',
        'theme_section' => 'The theme’s homepage sections belong on a builder page, not inside a record.',
    ];

    /** @return list<string> */
    public static function excluded(): array
    {
        return array_map(fn (PageSectionType $t) => $t->value, self::EXCLUDED);
    }

    /**
     * What the console's builder is told about records, beside the page
     * builder's own options (`GET /admin/pages/builder`).
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        return [
            'excluded_types' => self::excluded(),
            'layouts' => [
                ['value' => self::LAYOUT_BODY, 'label' => 'Written body', 'blurb' => 'The page shows the text written on this form.'],
                ['value' => self::LAYOUT_SECTIONS, 'label' => 'Sections', 'blurb' => 'The page shows the sections laid out below instead. The written text is kept.'],
            ],
        ];
    }

    /**
     * The rules for `body_layout` and `blocks` — the page's own, row by row.
     *
     * @return array<string, mixed>
     */
    public static function rules(mixed $blocks): array
    {
        return [
            'body_layout' => ['sometimes', 'nullable', 'string', Rule::in(self::LAYOUTS)],
            ...SectionRules::forPayload($blocks),
        ];
    }

    /** @return array<string, string> */
    public static function messages(mixed $blocks): array
    {
        return [
            'body_layout.in' => 'Choose the written body or sections.',
            ...SectionRules::messages('blocks', $blocks),
        ];
    }

    /** The page builder's checks, then what a body area cannot hold. */
    public static function after(Validator $validator, mixed $blocks): void
    {
        SectionRules::after($validator, $blocks);
        CustomCodeGuard::check($validator, $blocks);

        if (! is_array($blocks)) {
            return;
        }

        $excluded = self::excluded();
        $linked = self::linkedTypes($blocks);

        foreach ($blocks as $i => $block) {
            if (! is_array($block)) {
                continue;
            }
            $type = (string) ($block['type'] ?? '');
            $data = is_array($block['data'] ?? null) ? $block['data'] : [];

            if (in_array($type, $excluded, true)) {
                $validator->errors()->add("blocks.{$i}.type", self::EXCLUDED_MESSAGES[$type]);

                continue;
            }

            if ($type === PageSectionType::Saved->value) {
                $inner = $linked[(int) ($data['saved_id'] ?? 0)] ?? null;
                if (is_array($inner) && in_array($inner['type'] ?? null, $excluded, true)) {
                    $validator->errors()->add("blocks.{$i}.data.saved_id", self::EXCLUDED_MESSAGES[$inner['type']]);
                } elseif (is_array($inner) && self::readsPageFaqs($inner)) {
                    $validator->errors()->add("blocks.{$i}.data.saved_id", self::FAQ_MESSAGE);
                }

                continue;
            }

            if (self::readsPageFaqs(['type' => $type, 'data' => $data])) {
                $validator->errors()->add("blocks.{$i}.data.source", self::FAQ_MESSAGE);
            }
        }
    }

    private const FAQ_MESSAGE = 'This page already lists its own FAQs under the sections. Choose “Questions typed here”, or leave the section out.';

    /** @param  array<string, mixed>  $block */
    private static function readsPageFaqs(array $block): bool
    {
        return ($block['type'] ?? null) === PageSectionType::Faq->value
            && is_array($block['data'] ?? null)
            && ($block['data']['source'] ?? null) === 'page';
    }

    /**
     * The library section behind each linked row, by id — one query.
     *
     * @param  array<int|string, mixed>  $blocks
     * @return array<int, array<string, mixed>>
     */
    private static function linkedTypes(array $blocks): array
    {
        $ids = collect($blocks)
            ->filter(fn ($b) => is_array($b) && ($b['type'] ?? null) === PageSectionType::Saved->value)
            ->map(fn (array $b) => (int) (is_array($b['data'] ?? null) ? ($b['data']['saved_id'] ?? 0) : 0))
            ->filter()->unique()->values();

        if ($ids->isEmpty()) {
            return [];
        }

        return SavedSection::query()->whereIn('id', $ids)->where('kind', SavedSection::KIND_SECTION)->get()
            ->mapWithKeys(fn (SavedSection $s) => [$s->id => is_array($s->blocks[0] ?? null) ? $s->blocks[0] : []])
            ->all();
    }

    /**
     * The two columns as stored: the list through `SectionRules::normalise()`
     * (declared keys only), a blank layout as `body`. A key that was not
     * sent is left alone; `blocks: null` clears the list.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function store(array $attributes): array
    {
        if (array_key_exists('blocks', $attributes)) {
            $attributes['blocks'] = $attributes['blocks'] === null
                ? null
                : json_decode((string) json_encode(SectionRules::normalise($attributes['blocks'])), true);
        }

        if (array_key_exists('body_layout', $attributes) && blank($attributes['body_layout'])) {
            $attributes['body_layout'] = self::LAYOUT_BODY;
        }

        return $attributes;
    }

    /** Whether the record's page draws its sections in place of its body. */
    public static function inUse(Model $record): bool
    {
        $blocks = $record->getAttribute('blocks');

        return $record->getAttribute('body_layout') === self::LAYOUT_SECTIONS && is_array($blocks) && $blocks !== [];
    }

    /**
     * The sections as the public page reads them — the presenter's, less
     * anything a body area cannot hold (a linked library section edited into
     * a hero since it was placed) and with no page to read FAQs from, so a
     * "this page's FAQs" section is dropped as empty.
     *
     * @return list<array<string, mixed>>
     */
    public static function present(Model $record): array
    {
        $blocks = $record->getAttribute('blocks');

        return SectionPresenter::present(is_array($blocks) ? $blocks : null, null, self::excluded());
    }

    /**
     * The questions typed into the record's `faq` sections, for its one
     * `FAQPage` — nothing while the page draws its written body.
     *
     * @return list<object>
     */
    public static function faqEntries(Model $record): array
    {
        if (! self::inUse($record)) {
            return [];
        }

        $blocks = $record->getAttribute('blocks');

        return SectionPresenter::faqEntries(is_array($blocks) ? $blocks : null);
    }

    /**
     * Every `*_path` value anywhere in the sections, mapped to its URL, so a
     * picture field in the console can show what it holds.
     *
     * @param  array<mixed>  $blocks
     * @return array<string, string>
     */
    public static function mediaUrls(array $blocks): array
    {
        $urls = [];
        array_walk_recursive($blocks, function ($value, $key) use (&$urls) {
            if (is_string($key) && str_ends_with($key, '_path') && is_string($value) && $value !== '') {
                $urls[$value] = asset('storage/'.$value);
            }
        });

        return $urls;
    }
}
