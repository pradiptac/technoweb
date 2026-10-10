<?php

namespace App\Support\PageSections;

use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\Slider;
use App\Support\Blocks\BlockRules;
use App\Support\YouTube;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * The custom layout section (0.147.0, `docs/page-builder.md` "The layout
 * section"): rows of one to four columns, each column a short stack of
 * widgets. Kept out of `SectionRules` because its data is a tree, not a form —
 * the only section type whose rules are generated three levels deep.
 *
 * **One table says what each widget is.** `widgets()` describes every field of
 * every widget — its label, kind, limit and choices — and the validation
 * rules, `normalise()` and the console's editor (`options()` →
 * `GET /admin/pages/builder`) are all read from it, so a field added in one
 * place is validated, stored and drawn, and the console lists no widget type
 * of its own.
 *
 * **Rules are generated per index, never by wildcard, and the walk is
 * capped.** `forPayload` runs before validation, so a payload of 5,000 rows
 * must not be walked: only the first 8 rows, 4 columns, 8 widgets and 12 items
 * are given rules, and the `max:` on each list refuses the rest afterwards. A
 * 422 is keyed where the console's field is
 * (`blocks.2.data.rows.0.columns.1.widgets.3.html`).
 *
 * **What is stored is what each widget's own type declares** (`normalise()`):
 * a stray `href` on a heading is never kept, defaults are never stored, and
 * rows, columns and widgets are put back in position order — the reordering
 * `validated()` does to a list rebuilt rule by rule.
 *
 * **Containers nest exactly one level** (0.154.0): `box`, `tabs`, `panels` and
 * `inner_row` hold `slots` — `[{id, …slot fields, widgets: []}]` — and a slot
 * holds ordinary widgets, never another container and never a form, slider or
 * gallery (`childTypes()`). A column's widgets are depth 0, a slot's depth 1;
 * the rules, `check()`, `normalise()` and `LayoutPresenter` recurse once and
 * stop, each with the same caps. A child counts toward the section's widget
 * and character totals, and its id must be unique across the whole section.
 */
final class LayoutRules
{
    public const MAX_ROWS = 8;

    public const MAX_COLUMNS = 4;

    public const MAX_WIDGETS_PER_COLUMN = 8;

    /** Widgets in one section, and characters of stored text across them. */
    public const MAX_WIDGETS = 40;

    public const MAX_CHARS = 150000;

    public const MAX_HTML = 20000;

    public const MAX_ITEMS = 12;

    /** A row's or widget's id: minted by the console (8 base-36 characters), unique in the section. */
    public const ID = '/^[a-z0-9]{6,12}$/';

    /** The section head, validated and stored like every other section's. */
    public const HEAD = ['kicker', 'heading', 'lede'];

    /**
     * Row and column settings. Every value is a choice from a list and the
     * first `default` is never stored.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function rowFields(): array
    {
        return once(fn () => [
            'split' => self::choice('Split', 'equal', [
                'equal' => 'Equal', 'wide_first' => 'First wider', 'wide_last' => 'Second wider',
            ], 'Only for a row of two columns.'),
            'gap' => self::choice('Space between', 'm', ['s' => 'Small', 'm' => 'Medium', 'l' => 'Large']),
            'valign' => self::choice('Columns line up', 'stretch', ['stretch' => 'Equal height', 'top' => 'Top', 'center' => 'Middle', 'bottom' => 'Bottom'], 'Equal height makes boxes in a row the same height.'),
            'stack_from' => self::choice('Stack below', 'md', ['md' => 'Tablet width', 'lg' => 'Laptop width'], 'Below this width the columns sit one above the other.'),
            'reverse_stacked' => ['kind' => 'bool', 'label' => 'Second column first when stacked'],
        ]);
    }

    /** @return array<string, array<string, mixed>> */
    public static function columnFields(): array
    {
        return once(fn () => [
            'surface' => self::choice('Box', 'none', ['none' => 'None', 'card' => 'Card', 'raised' => 'Raised card'], 'A card has the theme’s ground, border and corners.'),
            'pad' => self::choice('Space inside', 'm', ['none' => 'None', 's' => 'Small', 'm' => 'Medium'], 'Only with a box.'),
            'align' => self::choice('Align text', 'inherit', ['inherit' => 'Same as the section', 'start' => 'Left', 'center' => 'Centre', 'end' => 'Right']),
            'valign' => self::choice('Content sits', 'top', ['top' => 'Top', 'center' => 'Middle', 'bottom' => 'Bottom']),
        ]);
    }

    /**
     * Every widget: `{label, blurb, fields, list?}`. A field is
     * `{kind, label, max?, required?, multiline?, choices?, default?}`; kinds
     * are `text`, `html` (rich), `choice`, `bool`, `link`, `path` (a library
     * picture) and `icon`. `list` is a widget's repeating rows (`items`).
     *
     * @return array<string, array<string, mixed>>
     */
    public static function widgets(): array
    {
        $align = self::choice('Align', 'inherit', ['inherit' => 'Same as the box', 'start' => 'Left', 'center' => 'Centre', 'end' => 'Right']);

        return once(fn () => [
            'heading' => [
                'label' => 'Heading',
                'blurb' => 'A title. The size is how big it looks; which level it is on the page is worked out for you.',
                'fields' => [
                    'text' => self::text('Heading', 160, true),
                    'size' => self::choice('Size', 'm', ['s' => 'Small', 'm' => 'Medium', 'l' => 'Large', 'xl' => 'Extra large']),
                    'align' => $align,
                ],
            ],
            'text' => [
                'label' => 'Text',
                'blurb' => 'Paragraphs, lists, links and tables from the editor, exactly as a page body.',
                'fields' => [
                    'html' => ['kind' => 'html', 'label' => 'Text', 'max' => self::MAX_HTML, 'required' => true],
                    'lead' => ['kind' => 'bool', 'label' => 'Larger, as an introduction'],
                ],
            ],
            'button' => [
                'label' => 'Button',
                'blurb' => 'One button that links to a page, an address, an email or a phone number.',
                'fields' => [
                    'label' => self::text('Label', 40, true),
                    'href' => ['kind' => 'link', 'label' => 'Link', 'max' => 2048, 'required' => true],
                    'variant' => self::choice('Look', 'primary', ['primary' => 'Solid', 'secondary' => 'Outlined', 'link' => 'Link']),
                    'align' => $align,
                ],
            ],
            'image' => [
                'label' => 'Picture',
                'blurb' => 'A picture from the media library in a fixed frame, with its alt text and focal point.',
                'fields' => [
                    'image_path' => ['kind' => 'path', 'label' => 'Picture', 'max' => 255, 'required' => true],
                    'ratio' => self::choice('Shape', '4:3', ['1:1' => 'Square', '4:3' => '4 : 3', '3:2' => '3 : 2', '16:9' => 'Wide, 16 : 9', '3:4' => 'Tall, 3 : 4']),
                    'rounded' => self::choice('Corners', 'none', ['none' => 'Square', 's' => 'Slightly rounded', 'm' => 'Rounded', 'l' => 'Very rounded', 'full' => 'Round']),
                    'href' => ['kind' => 'link', 'label' => 'Link (optional)', 'max' => 2048, 'required' => false],
                    'caption' => self::text('Caption (optional)', 200),
                ],
            ],
            'spacer' => [
                'label' => 'Space',
                'blurb' => 'Empty space between two widgets.',
                'fields' => [
                    'size' => self::choice('Height', 'm', ['s' => 'Small', 'm' => 'Medium', 'l' => 'Large', 'xl' => 'Extra large']),
                ],
            ],
            'divider' => [
                'label' => 'Rule',
                'blurb' => 'A thin line across the column.',
                'fields' => [
                    'short' => ['kind' => 'bool', 'label' => 'Short, not the full width'],
                ],
            ],
            'icon_box' => [
                'label' => 'Icon box',
                'blurb' => 'An icon, a title and a few words, drawn as a card, with an optional link.',
                'fields' => [
                    'icon' => ['kind' => 'icon', 'label' => 'Icon', 'required' => false],
                    'title' => self::text('Title', 80, true),
                    'body' => self::text('Words', 300, false, true),
                    'href' => ['kind' => 'link', 'label' => 'Link (optional)', 'max' => 2048, 'required' => false],
                    'link_label' => self::text('Link text (optional)', 40),
                    'layout' => self::choice('Layout', 'stacked', ['stacked' => 'Icon above', 'inline' => 'Icon beside']),
                ],
            ],
            'accordion' => [
                'label' => 'Questions that open',
                'blurb' => 'Up to twelve questions with their answers, opening one at a time. Not added to the page’s FAQ listing for search engines.',
                'fields' => [],
                'list' => [
                    'key' => 'items', 'label' => 'Question', 'min' => 1, 'max' => self::MAX_ITEMS,
                    'fields' => [
                        'question' => self::text('Question', 200, true),
                        'answer' => self::text('Answer', 2000, true, true),
                    ],
                ],
            ],
            'list' => [
                'label' => 'List',
                'blurb' => 'Up to twelve short points with a tick, a dot or numbers.',
                'fields' => [
                    'marker' => self::choice('Marker', 'tick', ['tick' => 'Tick', 'dot' => 'Dot', 'number' => 'Number']),
                ],
                'list' => [
                    'key' => 'items', 'label' => 'Point', 'min' => 1, 'max' => self::MAX_ITEMS,
                    'fields' => [
                        'text' => self::text('Words', 160, true),
                        'icon' => ['kind' => 'icon', 'label' => 'Icon (optional)', 'required' => false],
                    ],
                ],
            ],
            'video' => [
                'label' => 'Video',
                'blurb' => 'A YouTube link or a video file from the library. Nothing is loaded until somebody presses play.',
                'fields' => [
                    'source' => self::choice('Where it is', 'youtube', ['youtube' => 'A YouTube link', 'mp4' => 'A video file from the library']),
                    'youtube' => ['kind' => 'youtube', 'label' => 'YouTube link', 'max' => 255, 'required' => true, 'when' => ['source' => 'youtube']],
                    'video_path' => ['kind' => 'video', 'label' => 'Video file', 'max' => 255, 'required' => true, 'when' => ['source' => 'mp4']],
                    'poster_path' => ['kind' => 'path', 'label' => 'Cover picture (optional)', 'max' => 255, 'required' => false],
                    'ratio' => self::choice('Shape', '16:9', ['16:9' => 'Wide, 16 : 9', '4:3' => '4 : 3', '1:1' => 'Square', '9:16' => 'Tall, 9 : 16']),
                    'caption' => self::text('Caption (optional)', 200),
                ],
            ],
            'box' => [
                'label' => 'Box',
                'blurb' => 'A framed area holding other widgets: a card, a raised card or a tinted panel.',
                'fields' => [
                    'surface' => self::choice('Look', 'card', ['card' => 'Card', 'raised' => 'Raised card', 'tint' => 'Tinted panel']),
                    'pad' => self::choice('Space inside', 'm', ['s' => 'Small', 'm' => 'Medium', 'l' => 'Large']),
                    'align' => $align,
                ],
                'container' => ['key' => 'slots', 'label' => 'Contents', 'min' => 1, 'max' => 1, 'fields' => []],
            ],
            'tabs' => [
                'label' => 'Tabs',
                'blurb' => 'Two to six tabs, each holding its own widgets. Every tab is on the page for search engines; one shows at a time.',
                'fields' => [],
                'container' => ['key' => 'slots', 'label' => 'Tab', 'min' => 2, 'max' => 6, 'fields' => [
                    'label' => self::text('Tab name', 40, true),
                ]],
            ],
            'panels' => [
                'label' => 'Panels that open',
                'blurb' => 'Up to eight panels that open and close, each holding its own widgets.',
                'fields' => [],
                'container' => ['key' => 'slots', 'label' => 'Panel', 'min' => 1, 'max' => 8, 'fields' => [
                    'title' => self::text('Panel title', 120, true),
                    'open' => ['kind' => 'bool', 'label' => 'Open when the page loads'],
                ]],
            ],
            'inner_row' => [
                'label' => 'Columns inside',
                'blurb' => 'Two to four columns side by side inside this column, each holding its own widgets.',
                'fields' => array_intersect_key(self::rowFields(), array_flip(['split', 'gap', 'valign', 'stack_from'])),
                'container' => ['key' => 'slots', 'label' => 'Column', 'min' => 2, 'max' => 4, 'fields' => []],
            ],
            'form' => [
                'label' => 'Form',
                'blurb' => 'One of your published forms, drawn in the column.',
                'fields' => [
                    'form_id' => self::record('Form', 'form'),
                ],
            ],
            'slider' => [
                'label' => 'Slider',
                'blurb' => 'One of your published sliders. A layout section holds one slider.',
                'fields' => [
                    'slider_id' => self::record('Slider', 'slider', true),
                ],
            ],
            'gallery' => [
                'label' => 'Gallery',
                'blurb' => 'One of your published galleries. A layout section holds one gallery.',
                'fields' => [
                    'gallery_id' => self::record('Gallery', 'gallery', true),
                ],
            ],
        ]);
    }

    /** The widgets that carry their own autoplay or are a record embed: never inside a container. */
    private const NOT_NESTED = ['form', 'slider', 'gallery'];

    /**
     * The widgets a container's slot may hold: any but another container and
     * the three embeds.
     *
     * @return list<string>
     */
    public static function childTypes(): array
    {
        return once(fn () => array_values(array_filter(
            array_keys(self::widgets()),
            fn ($type) => ! isset(self::widgets()[$type]['container']) && ! in_array($type, self::NOT_NESTED, true),
        )));
    }

    /**
     * A published form, slider or gallery, by id. `single` is for the two that
     * carry their own autoplay and Pause control: one of each to a section.
     *
     * @return array<string, mixed>
     */
    private static function record(string $label, string $record, bool $single = false): array
    {
        return ['kind' => 'ref', 'label' => $label, 'record' => $record, 'required' => true, 'single' => $single];
    }

    /** The model behind each `ref` field. @return array<string, class-string<Model>> */
    private static function models(): array
    {
        return ['form' => Form::class, 'slider' => Slider::class, 'gallery' => Gallery::class];
    }

    /**
     * Whether a conditional field applies to this widget: every `when` entry
     * names a sibling field and the value it must hold, a sibling left at its
     * default counting as holding it.
     *
     * @param  array<string, mixed>  $field
     * @param  array<string, mixed>  $values  the widget as sent or stored
     * @param  array<string, array<string, mixed>>  $fields  the widget's field table
     */
    private static function applies(array $field, array $values, array $fields): bool
    {
        foreach ((array) ($field['when'] ?? []) as $sibling => $wanted) {
            $have = $values[$sibling] ?? ($fields[$sibling]['default'] ?? null);
            if (! is_string($have) || $have !== $wanted) {
                return false;
            }
        }

        return true;
    }

    /** @return array<string, mixed> */
    private static function text(string $label, int $max, bool $required = false, bool $multiline = false): array
    {
        return ['kind' => 'text', 'label' => $label, 'max' => $max, 'required' => $required, 'multiline' => $multiline];
    }

    /**
     * @param  array<string, string>  $choices  value => label
     * @return array<string, mixed>
     */
    private static function choice(string $label, string $default, array $choices, ?string $hint = null): array
    {
        return ['kind' => 'choice', 'label' => $label, 'default' => $default, 'choices' => $choices, 'hint' => $hint];
    }

    /**
     * What the console is sent (`GET /admin/pages/builder` → `layout`): the
     * widgets with their fields, the row and column settings, and the limits
     * — so TypeScript lists none of them.
     *
     * @return array<string, mixed>
     */
    public static function options(): array
    {
        $describe = function (array $fields): array {
            $out = [];
            foreach ($fields as $key => $field) {
                $field['key'] = $key;
                if (isset($field['choices'])) {
                    $field['choices'] = array_map(fn ($value, $label) => ['value' => (string) $value, 'label' => $label], array_keys($field['choices']), $field['choices']);
                }
                $out[] = $field;
            }

            return $out;
        };

        $widgets = [];
        foreach (self::widgets() as $type => $widget) {
            $entry = [
                'value' => $type,
                'label' => $widget['label'],
                'blurb' => $widget['blurb'],
                'fields' => $describe($widget['fields']),
            ];
            if (isset($widget['list'])) {
                $entry['list'] = [...$widget['list'], 'fields' => $describe($widget['list']['fields'])];
            }
            if (isset($widget['container'])) {
                $entry['container'] = [...$widget['container'], 'fields' => $describe($widget['container']['fields']), 'child_types' => self::childTypes()];
            }
            $widgets[] = $entry;
        }

        return [
            'widgets' => $widgets,
            'row' => $describe(self::rowFields()),
            'column' => $describe(self::columnFields()),
            'limits' => [
                'rows' => self::MAX_ROWS,
                'columns' => self::MAX_COLUMNS,
                'widgets_per_column' => self::MAX_WIDGETS_PER_COLUMN,
                'widgets' => self::MAX_WIDGETS,
                'characters' => self::MAX_CHARS,
                'html' => self::MAX_HTML,
                'items' => self::MAX_ITEMS,
            ],
        ];
    }

    // ---------------------------------------------------------------- rules

    /** The rules a field's kind implies. @param  array<string, mixed>  $field @return list<mixed> */
    private static function fieldRule(array $field, bool $applies = true): array
    {
        // A conditional field that does not apply (a file link on a YouTube
        // video) is not required, and is not stored either.
        $presence = ($field['required'] ?? false) && $applies ? 'required' : 'nullable';

        return match ($field['kind']) {
            'text', 'html' => [$presence, 'string', 'max:'.$field['max']],
            'link' => [$presence, 'string', 'max:'.$field['max'], BlockRules::LINK],
            'path', 'video', 'youtube' => [$presence, 'string', 'max:'.$field['max']],
            'ref' => [$presence, 'integer'],
            'icon' => ['nullable', 'string', 'regex:'.SectionRules::ICON_PATTERN],
            'choice' => ['nullable', Rule::in(array_map('strval', array_keys($field['choices'])))],
            'bool' => ['nullable', 'boolean'],
            default => throw new \LogicException("Unknown layout field kind [{$field['kind']}]."),
        };
    }

    /**
     * The rules for everything below a layout's head, keyed from `$at` (the
     * section's `data` path). Index by index over a capped walk — see the
     * class docblock — and only for integer keys, so a key such as `*` or
     * `a.b` in a hostile payload cannot become a wildcard.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function rules(array $data, string $at): array
    {
        $rules = [];

        foreach (self::slice($data['rows'] ?? null, self::MAX_ROWS) as $r => $row) {
            $rp = "{$at}.rows.{$r}";
            $rules[$rp] = ['array'];
            if (! is_array($row)) {
                continue;
            }
            $rules["{$rp}.id"] = ['required', 'string', 'regex:'.self::ID];
            foreach (self::rowFields() as $key => $field) {
                $rules["{$rp}.{$key}"] = self::fieldRule($field);
            }
            $rules["{$rp}.columns"] = ['required', 'array', 'min:1', 'max:'.self::MAX_COLUMNS];

            foreach (self::slice($row['columns'] ?? null, self::MAX_COLUMNS) as $c => $column) {
                $cp = "{$rp}.columns.{$c}";
                $rules[$cp] = ['array'];
                if (! is_array($column)) {
                    continue;
                }
                foreach (self::columnFields() as $key => $field) {
                    $rules["{$cp}.{$key}"] = self::fieldRule($field);
                }
                $rules["{$cp}.widgets"] = ['nullable', 'array', 'max:'.self::MAX_WIDGETS_PER_COLUMN];

                foreach (self::slice($column['widgets'] ?? null, self::MAX_WIDGETS_PER_COLUMN) as $w => $widget) {
                    $rules = [...$rules, ...self::widgetRules($widget, "{$cp}.widgets.{$w}", 0)];
                }
            }
        }

        return $rules;
    }

    /** @return array<string, mixed> */
    private static function widgetRules(mixed $widget, string $wp, int $depth): array
    {
        $rules = [$wp => ['array']];
        if (! is_array($widget)) {
            return $rules;
        }

        $types = $depth === 0 ? array_keys(self::widgets()) : self::childTypes();
        $rules["{$wp}.id"] = ['required', 'string', 'regex:'.self::ID];
        $rules["{$wp}.type"] = ['required', 'string', Rule::in($types)];
        $rules["{$wp}.show_on"] = ['nullable', 'array', 'min:1', 'max:'.count(SectionRules::DEVICES)];
        foreach (array_keys(array_slice((array) ($widget['show_on'] ?? []), 0, count(SectionRules::DEVICES), true)) as $k) {
            if (is_int($k)) {
                $rules["{$wp}.show_on.{$k}"] = ['string', Rule::in(SectionRules::DEVICES)];
            }
        }

        $type = (string) ($widget['type'] ?? '');
        $spec = self::widgets()[$type] ?? null;
        // A type this depth refuses gets no field rules: the `type` rule says so.
        if (! $spec || ! in_array($type, $types, true)) {
            return $rules;
        }

        foreach ($spec['fields'] as $key => $field) {
            $rules["{$wp}.{$key}"] = self::fieldRule($field, self::applies($field, $widget, $spec['fields']));
        }

        if (isset($spec['container'])) {
            $box = $spec['container'];
            $rules["{$wp}.{$box['key']}"] = ['required', 'array', 'min:'.$box['min'], 'max:'.$box['max']];
            foreach (self::slice($widget[$box['key']] ?? null, $box['max']) as $s => $slot) {
                $sp = "{$wp}.{$box['key']}.{$s}";
                $rules[$sp] = ['array'];
                if (! is_array($slot)) {
                    continue;
                }
                $rules["{$sp}.id"] = ['required', 'string', 'regex:'.self::ID];
                foreach ($box['fields'] as $key => $field) {
                    $rules["{$sp}.{$key}"] = self::fieldRule($field);
                }
                $rules["{$sp}.widgets"] = ['nullable', 'array', 'max:'.self::MAX_WIDGETS_PER_COLUMN];
                // The one level: a child's own rules, and its type may not be a container.
                foreach (self::slice($slot['widgets'] ?? null, self::MAX_WIDGETS_PER_COLUMN) as $w => $child) {
                    $rules = [...$rules, ...self::widgetRules($child, "{$sp}.widgets.{$w}", 1)];
                }
            }
        }

        if (isset($spec['list'])) {
            $list = $spec['list'];
            $rules["{$wp}.{$list['key']}"] = ['required', 'array', 'min:'.$list['min'], 'max:'.$list['max']];
            foreach (self::slice($widget[$list['key']] ?? null, $list['max']) as $n => $item) {
                $rules["{$wp}.{$list['key']}.{$n}"] = ['array'];
                if (! is_array($item)) {
                    continue;
                }
                foreach ($list['fields'] as $key => $field) {
                    $rules["{$wp}.{$list['key']}.{$n}.{$key}"] = self::fieldRule($field);
                }
            }
        }

        return $rules;
    }

    /**
     * The first `$limit` entries of a list, integer keys only.
     *
     * @return array<int, mixed>
     */
    private static function slice(mixed $list, int $limit): array
    {
        if (! is_array($list)) {
            return [];
        }

        $out = [];
        foreach ($list as $key => $value) {
            if (is_int($key)) {
                $out[$key] = $value;
                if (count($out) >= $limit) {
                    break;
                }
            }
        }

        return $out;
    }

    /**
     * Messages a person can act on, keyed from the section's `data` path.
     * `*` stands for an index, which Laravel's message lookup honours.
     *
     * @return array<string, string>
     */
    public static function messages(string $at): array
    {
        $w = "{$at}.rows.*.columns.*.widgets.*";
        $c = "{$w}.slots.*.widgets.*";

        return [
            "{$at}.rows.required" => 'Add at least one row.',
            "{$at}.rows.min" => 'Add at least one row.',
            "{$at}.rows.max" => 'A layout holds at most '.self::MAX_ROWS.' rows.',
            "{$at}.rows.*.columns.required" => 'A row needs at least one column.',
            "{$at}.rows.*.columns.min" => 'A row needs at least one column.',
            "{$at}.rows.*.columns.max" => 'A row holds at most '.self::MAX_COLUMNS.' columns.',
            "{$at}.rows.*.columns.*.widgets.max" => 'A column holds at most '.self::MAX_WIDGETS_PER_COLUMN.' widgets.',
            "{$at}.rows.*.id.required" => 'A row lost its id; remove it and add it again.',
            "{$at}.rows.*.id.regex" => 'A row lost its id; remove it and add it again.',
            ...self::widgetMessages($w),
            ...self::widgetMessages($c),
            "{$c}.type.in" => 'A box, tabs, panels or columns inside cannot hold another of those, a form, a slider or a gallery; put those in the column itself.',
            // A container's slots (tabs, panels, columns), one level.
            "{$w}.slots.required" => 'Add the tabs, panels or columns this holds.',
            "{$w}.slots.min" => 'This needs at least :min.',
            "{$w}.slots.max" => 'This holds at most :max.',
            "{$w}.slots.*.id.required" => 'A tab, panel or column lost its id; remove it and add it again.',
            "{$w}.slots.*.id.regex" => 'A tab, panel or column lost its id; remove it and add it again.',
            "{$w}.slots.*.label.required" => 'Give every tab a name.',
            "{$w}.slots.*.label.max" => 'Keep a tab name to 40 characters.',
            "{$w}.slots.*.title.required" => 'Give every panel a title.',
            "{$w}.slots.*.title.max" => 'Keep a panel title to 120 characters.',
            "{$w}.slots.*.widgets.max" => 'A tab, panel or column holds at most '.self::MAX_WIDGETS_PER_COLUMN.' widgets.',
        ];
    }

    /**
     * The messages for one widget's own fields, under `$w` (the wildcard path
     * of a widget: a column's, and again for a container's child).
     *
     * @return array<string, string>
     */
    private static function widgetMessages(string $w): array
    {
        return [
            "{$w}.id.required" => 'A widget lost its id; remove it and add it again.',
            "{$w}.id.regex" => 'A widget lost its id; remove it and add it again.',
            "{$w}.type.required" => 'Every widget needs a type.',
            "{$w}.type.in" => 'That is not a kind of widget this site can draw.',
            "{$w}.text.required" => 'Write the heading.',
            "{$w}.text.max" => 'Keep the heading to 160 characters.',
            "{$w}.html.required" => 'Write the text.',
            "{$w}.html.max" => 'Keep one text widget to '.number_format(self::MAX_HTML).' characters; split it in two.',
            "{$w}.label.required" => 'A button needs a label.',
            "{$w}.href.required" => 'A button needs a link.',
            "{$w}.href.regex" => 'A link is a path, an https:// address, mailto: or tel:.',
            "{$w}.image_path.required" => 'Choose a picture for this image.',
            "{$w}.title.required" => 'Give the box a title.',
            "{$w}.youtube.required" => 'Paste the YouTube link.',
            "{$w}.video_path.required" => 'Choose a video from the media library.',
            "{$w}.form_id.required" => 'Choose the form.',
            "{$w}.form_id.integer" => 'Choose the form.',
            "{$w}.slider_id.required" => 'Choose the slider.',
            "{$w}.slider_id.integer" => 'Choose the slider.',
            "{$w}.gallery_id.required" => 'Choose the gallery.',
            "{$w}.gallery_id.integer" => 'Choose the gallery.',
            "{$w}.items.required" => 'Add at least one item.',
            "{$w}.items.min" => 'Add at least one item.',
            "{$w}.items.max" => 'Keep to '.self::MAX_ITEMS.' items.',
            "{$w}.items.*.question.required" => 'Every question needs its question.',
            "{$w}.items.*.answer.required" => 'Every question needs an answer.',
            "{$w}.items.*.text.required" => 'Every point needs its words.',
            "{$w}.icon.regex" => 'That is not an icon this site has.',
            "{$w}.items.*.icon.regex" => 'That is not an icon this site has.',
        ];
    }

    // ----------------------------------------------------------------- check

    /**
     * What no rule can express: ids that are unique across the section, a
     * split only on two columns, lists that are lists, pictures that are in
     * the library (one query for the whole section) and the two totals. The
     * walk is capped the way `rules()` is — `after()` runs even when a rule
     * has failed.
     *
     * @param  array<string, mixed>  $data
     */
    public static function check(Validator $validator, array $data, string $at): void
    {
        $rows = $data['rows'] ?? null;
        if (! is_array($rows)) {
            return;
        }
        if (! array_is_list($rows)) {
            $validator->errors()->add("{$at}.rows", 'The rows are not a list.');
        }

        $st = ['ids' => [], 'widgets' => 0, 'chars' => 0, 'pictures' => [], 'records' => [], 'singles' => []];

        foreach (self::slice($rows, self::MAX_ROWS) as $r => $row) {
            if (! is_array($row)) {
                continue;
            }
            $rp = "{$at}.rows.{$r}";
            self::unique($validator, $st, $row['id'] ?? null, "{$rp}.id");

            $columns = $row['columns'] ?? null;
            if (is_array($columns) && ! array_is_list($columns)) {
                $validator->errors()->add("{$rp}.columns", 'The columns are not a list.');
            }
            $split = $row['split'] ?? 'equal';
            if (is_string($split) && $split !== 'equal' && is_array($columns) && count($columns) !== 2) {
                $validator->errors()->add("{$rp}.split", 'A split needs exactly two columns; choose “Equal”.');
            }

            foreach (self::slice($columns, self::MAX_COLUMNS) as $c => $column) {
                if (is_array($column)) {
                    self::checkList($validator, $column['widgets'] ?? null, "{$rp}.columns.{$c}.widgets", $st, 0);
                }
            }
        }

        ['widgets' => $widgets, 'chars' => $chars, 'pictures' => $pictures, 'records' => $records] = $st;
        if ($widgets > self::MAX_WIDGETS) {
            $validator->errors()->add("{$at}.rows", 'A layout holds at most '.self::MAX_WIDGETS.' widgets; use a second layout section for the rest.');
        }
        if ($chars > self::MAX_CHARS) {
            $validator->errors()->add("{$at}.rows", 'There is too much text in this layout ('.number_format(self::MAX_CHARS).' characters at most); use a second layout section for the rest.');
        }

        if ($pictures !== []) {
            $found = Media::query()->whereIn('path', array_keys($pictures))->pluck('mime', 'path');
            foreach ($pictures as $path => $wanted) {
                foreach ($wanted as [$key, $prefix]) {
                    if ($found->has($path) && str_starts_with((string) $found->get($path), $prefix)) {
                        continue;
                    }
                    $validator->errors()->add($key, $prefix === 'video/'
                        ? ($found->has($path) ? 'That file is not a video.' : 'Choose a video from the media library.')
                        : 'Choose a picture from the media library.');
                }
            }
        }

        // One query a kind for the whole section, judged by the builder's own
        // form, slider and gallery sections' rule.
        foreach ($records as $kind => $ids) {
            $found = self::models()[$kind]::query()->whereIn('id', array_keys($ids))->get()->keyBy('id');
            foreach ($ids as $id => $keys) {
                $problem = SectionRules::referenceProblem($found->get($id), $kind);
                if ($problem === null) {
                    continue;
                }
                foreach ($keys as $key) {
                    $validator->errors()->add($key, $problem);
                }
            }
        }
    }

    /**
     * Ids are unique across the whole section: rows, widgets, and a
     * container's slots and children alike.
     *
     * @param  array<string, mixed>  $st
     */
    private static function unique(Validator $validator, array &$st, mixed $id, string $key): void
    {
        if (! is_string($id) || $id === '') {
            return;
        }
        if (isset($st['ids'][$id])) {
            $validator->errors()->add($key, 'Two rows, widgets, tabs or panels share an id; duplicate one again rather than copying it by hand.');
        }
        $st['ids'][$id] = true;
    }

    /**
     * One list of widgets — a column's (depth 0) or a container slot's (depth 1,
     * the last: a container found there is refused by its `type` rule and not
     * walked into). Capped like `rules()`.
     *
     * @param  array<string, mixed>  $st  the section's running totals, by reference
     */
    private static function checkList(Validator $validator, mixed $list, string $lp, array &$st, int $depth): void
    {
        if (is_array($list) && ! array_is_list($list)) {
            $validator->errors()->add($lp, 'The widgets are not a list.');
        }

        foreach (self::slice($list, self::MAX_WIDGETS_PER_COLUMN) as $w => $widget) {
            if (! is_array($widget)) {
                continue;
            }
            $wp = "{$lp}.{$w}";
            $type = (string) ($widget['type'] ?? '');
            $spec = self::widgets()[$type] ?? null;
            $box = $spec['container'] ?? null;

            $st['widgets']++;
            self::unique($validator, $st, $widget['id'] ?? null, "{$wp}.id");
            // A container's children are counted when they are visited, not twice.
            $st['chars'] += self::characters(array_diff_key($widget, ['id' => 1, 'type' => 1, 'slots' => 1]));

            if ($depth > 0 && ($spec === null || ! in_array($type, self::childTypes(), true))) {
                continue;
            }

            foreach ($spec['fields'] ?? [] as $key => $field) {
                $value = $widget[$key] ?? null;
                if ($value === null || $value === '' || ! self::applies($field, $widget, $spec['fields'])) {
                    continue;
                }
                $at2 = "{$wp}.{$key}";

                switch ($field['kind']) {
                    case 'path':
                        if (is_string($value)) {
                            $st['pictures'][$value][] = [$at2, 'image/'];
                        }
                        break;
                    case 'video':
                        if (is_string($value)) {
                            $st['pictures'][$value][] = [$at2, 'video/'];
                        }
                        break;
                    case 'youtube':
                        if (is_string($value) && YouTube::id($value) === null) {
                            $validator->errors()->add($at2, 'That is not a YouTube link this site can play.');
                        }
                        break;
                    case 'ref':
                        if (! is_numeric($value)) {
                            break;
                        }
                        $kind = (string) $field['record'];
                        $st['singles'][$kind] = ($st['singles'][$kind] ?? 0) + ($field['single'] ?? false ? 1 : 0);
                        if (($field['single'] ?? false) && $st['singles'][$kind] > 1) {
                            $validator->errors()->add($at2, "A layout section holds one {$kind}; use a second layout section for another.");
                        }
                        $st['records'][$kind][(int) $value][] = $at2;
                        break;
                }
            }

            if ($box === null) {
                continue;
            }

            $slots = $widget[$box['key']] ?? null;
            if (is_array($slots) && ! array_is_list($slots)) {
                $validator->errors()->add("{$wp}.{$box['key']}", 'The tabs, panels or columns are not a list.');
            }
            $split = $widget['split'] ?? 'equal';
            if (is_string($split) && $split !== 'equal' && is_array($slots) && count($slots) !== 2) {
                $validator->errors()->add("{$wp}.split", 'A split needs exactly two columns; choose “Equal”.');
            }

            foreach (self::slice($slots, $box['max']) as $s => $slot) {
                if (! is_array($slot)) {
                    continue;
                }
                $sp = "{$wp}.{$box['key']}.{$s}";
                self::unique($validator, $st, $slot['id'] ?? null, "{$sp}.id");
                $st['chars'] += self::characters(array_diff_key($slot, ['id' => 1, 'widgets' => 1]));
                self::checkList($validator, $slot['widgets'] ?? null, "{$sp}.widgets", $st, 1);
            }
        }
    }

    /** Characters of text in a value, strings anywhere inside it. */
    private static function characters(mixed $value): int
    {
        if (is_string($value)) {
            return mb_strlen($value);
        }
        if (! is_array($value)) {
            return 0;
        }

        $n = 0;
        foreach ($value as $v) {
            $n += self::characters($v);
        }

        return $n;
    }

    // ------------------------------------------------------------- normalise

    /**
     * The rows as stored. Run on validated input, so nothing here refuses;
     * it keeps what each level declares and nothing else.
     *
     * @return list<array<string, mixed>>
     */
    public static function normalise(mixed $rows): array
    {
        $out = [];

        foreach (self::ordered($rows, self::MAX_ROWS) as $row) {
            if (! is_array($row)) {
                continue;
            }

            $columns = [];
            foreach (self::ordered($row['columns'] ?? null, self::MAX_COLUMNS) as $column) {
                if (! is_array($column)) {
                    continue;
                }
                $widgets = [];
                foreach (self::ordered($column['widgets'] ?? null, self::MAX_WIDGETS_PER_COLUMN) as $widget) {
                    if (is_array($widget) && ($kept = self::widget($widget, 0)) !== null) {
                        $widgets[] = $kept;
                    }
                }
                $stored = self::kept($column, self::columnFields());
                // Space inside a box means nothing without one.
                if (($stored['surface'] ?? null) === null) {
                    unset($stored['pad']);
                }
                $columns[] = [...$stored, 'widgets' => $widgets];
            }
            if ($columns === []) {
                continue;
            }

            $stored = self::kept($row, self::rowFields());
            // A split is for two columns; stacking order for two or more.
            if (count($columns) !== 2) {
                unset($stored['split']);
            }
            if (count($columns) < 2) {
                unset($stored['reverse_stacked']);
            }
            $out[] = ['id' => (string) ($row['id'] ?? ''), ...$stored, 'columns' => $columns];
        }

        return $out;
    }

    /**
     * A list in position order, capped. `validated()` rebuilds a list rule by
     * rule, so its keys can come back out of order.
     *
     * @return list<mixed>
     */
    private static function ordered(mixed $list, int $limit): array
    {
        if (! is_array($list)) {
            return [];
        }
        $ints = array_filter($list, fn ($k) => is_int($k), ARRAY_FILTER_USE_KEY);
        ksort($ints, SORT_NUMERIC);

        return array_slice(array_values($ints), 0, $limit);
    }

    /**
     * One widget as stored, or null for a type this code does not know.
     *
     * @param  array<string, mixed>  $widget
     * @return array<string, mixed>|null
     */
    private static function widget(array $widget, int $depth): ?array
    {
        $type = (string) ($widget['type'] ?? '');
        $spec = self::widgets()[$type] ?? null;
        if (! $spec || ($depth > 0 && ! in_array($type, self::childTypes(), true))) {
            return null;
        }

        $out = ['id' => (string) ($widget['id'] ?? ''), 'type' => $type, ...self::kept($widget, $spec['fields'])];

        // A field that only applies to one choice (a YouTube link on a file video) is not kept for another.
        foreach ($spec['fields'] as $key => $field) {
            if (isset($field['when']) && ! self::applies($field, $widget, $spec['fields'])) {
                unset($out[$key]);
            }
        }

        if (is_array($widget['show_on'] ?? null)) {
            $devices = array_values(array_intersect(SectionRules::DEVICES, $widget['show_on']));
            if ($devices !== [] && count($devices) < count(SectionRules::DEVICES)) {
                $out['show_on'] = $devices;
            }
        }

        if (isset($spec['container'])) {
            $box = $spec['container'];
            $slots = [];
            foreach (self::ordered($widget[$box['key']] ?? null, $box['max']) as $slot) {
                if (! is_array($slot)) {
                    continue;
                }
                $children = [];
                foreach (self::ordered($slot['widgets'] ?? null, self::MAX_WIDGETS_PER_COLUMN) as $child) {
                    if (is_array($child) && ($kept = self::widget($child, 1)) !== null) {
                        $children[] = $kept;
                    }
                }
                $slots[] = ['id' => (string) ($slot['id'] ?? ''), ...self::kept($slot, $box['fields']), 'widgets' => $children];
            }
            $out[$box['key']] = $slots;
            // A split is for two columns, as on a row.
            if (count($slots) !== 2) {
                unset($out['split']);
            }
        }
        if (isset($spec['list'])) {
            $list = $spec['list'];
            $items = [];
            foreach (self::ordered($widget[$list['key']] ?? null, $list['max']) as $item) {
                if (is_array($item)) {
                    $items[] = self::kept($item, $list['fields']);
                }
            }
            $out[$list['key']] = $items;
        }

        return $out;
    }

    /**
     * The declared fields of `$source`, a default and a blank left out.
     *
     * @param  array<string, mixed>  $source
     * @param  array<string, array<string, mixed>>  $fields
     * @return array<string, mixed>
     */
    private static function kept(array $source, array $fields): array
    {
        $out = [];

        foreach ($fields as $key => $field) {
            $value = $source[$key] ?? null;

            switch ($field['kind']) {
                case 'bool':
                    if (filter_var($value, FILTER_VALIDATE_BOOLEAN)) {
                        $out[$key] = true;
                    }
                    break;
                case 'ref':
                    if (is_numeric($value) && (int) $value > 0) {
                        $out[$key] = (int) $value;
                    }
                    break;
                case 'youtube':
                    // The id, never the pasted address.
                    if (is_string($value) && ($id = YouTube::id($value)) !== null) {
                        $out[$key] = $id;
                    }
                    break;
                case 'choice':
                    if (is_string($value) && $value !== $field['default'] && array_key_exists($value, $field['choices'])) {
                        $out[$key] = $value;
                    }
                    break;
                default:
                    if (is_string($value) && trim($value) !== '') {
                        $out[$key] = trim($value);
                    }
            }
        }

        return $out;
    }
}
