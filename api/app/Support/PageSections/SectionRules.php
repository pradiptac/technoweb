<?php

namespace App\Support\PageSections;

use App\Enums\PageSectionType;
use App\Enums\PublishStatus;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\ProductCategory;
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
 * `{id, type, hidden, background, data}`. The list is validated at the depth
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

        foreach ($blocks as $i => $block) {
            if (! is_array($block)) {
                continue;
            }
            $at = "{$prefix}.{$i}";

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
        }
    }

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

        foreach (array_values($blocks) as $block) {
            $type = is_array($block) ? PageSectionType::tryFrom((string) ($block['type'] ?? '')) : null;
            if (! $type) {
                continue;
            }

            $data = self::keep(is_array($block['data'] ?? null) ? $block['data'] : [], array_keys(self::for($type)));

            foreach (['block_id', 'slider_id', 'gallery_id', 'form_id', 'limit', 'columns'] as $int) {
                if (isset($data[$int]) && is_numeric($data[$int])) {
                    $data[$int] = (int) $data[$int];
                }
            }
            if (isset($data['rule'])) {
                $data['rule'] = filter_var($data['rule'], FILTER_VALIDATE_BOOLEAN);
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
                'data' => (object) $data,
            ];
        }

        return $out;
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
