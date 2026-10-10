<?php

namespace App\Support\PageSections;

use App\Models\Media;
use App\Support\Blocks\BlockRules;
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
 * **No nesting**: a widget holds no widget and a layout has no layout widget.
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
        ]);
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
    private static function fieldRule(array $field): array
    {
        $presence = ($field['required'] ?? false) ? 'required' : 'nullable';

        return match ($field['kind']) {
            'text', 'html' => [$presence, 'string', 'max:'.$field['max']],
            'link' => [$presence, 'string', 'max:'.$field['max'], BlockRules::LINK],
            'path' => [$presence, 'string', 'max:'.$field['max']],
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
                    $rules = [...$rules, ...self::widgetRules($widget, "{$cp}.widgets.{$w}")];
                }
            }
        }

        return $rules;
    }

    /** @return array<string, mixed> */
    private static function widgetRules(mixed $widget, string $wp): array
    {
        $rules = [$wp => ['array']];
        if (! is_array($widget)) {
            return $rules;
        }

        $rules["{$wp}.id"] = ['required', 'string', 'regex:'.self::ID];
        $rules["{$wp}.type"] = ['required', 'string', Rule::in(array_keys(self::widgets()))];
        $rules["{$wp}.show_on"] = ['nullable', 'array', 'min:1', 'max:'.count(SectionRules::DEVICES)];
        foreach (array_keys(array_slice((array) ($widget['show_on'] ?? []), 0, count(SectionRules::DEVICES), true)) as $k) {
            if (is_int($k)) {
                $rules["{$wp}.show_on.{$k}"] = ['string', Rule::in(SectionRules::DEVICES)];
            }
        }

        $spec = self::widgets()[(string) ($widget['type'] ?? '')] ?? null;
        if (! $spec) {
            return $rules;
        }

        foreach ($spec['fields'] as $key => $field) {
            $rules["{$wp}.{$key}"] = self::fieldRule($field);
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

        $ids = [];
        $widgets = 0;
        $chars = 0;
        $pictures = [];
        $unique = function (mixed $id, string $key) use ($validator, &$ids) {
            if (! is_string($id) || $id === '') {
                return;
            }
            if (isset($ids[$id])) {
                $validator->errors()->add($key, 'Two rows or widgets share an id; duplicate one again rather than copying it by hand.');
            }
            $ids[$id] = true;
        };

        foreach (self::slice($rows, self::MAX_ROWS) as $r => $row) {
            if (! is_array($row)) {
                continue;
            }
            $rp = "{$at}.rows.{$r}";
            $unique($row['id'] ?? null, "{$rp}.id");

            $columns = $row['columns'] ?? null;
            if (is_array($columns) && ! array_is_list($columns)) {
                $validator->errors()->add("{$rp}.columns", 'The columns are not a list.');
            }
            $split = $row['split'] ?? 'equal';
            if (is_string($split) && $split !== 'equal' && is_array($columns) && count($columns) !== 2) {
                $validator->errors()->add("{$rp}.split", 'A split needs exactly two columns; choose “Equal”.');
            }

            foreach (self::slice($columns, self::MAX_COLUMNS) as $c => $column) {
                if (! is_array($column)) {
                    continue;
                }
                $cp = "{$rp}.columns.{$c}";
                $list = $column['widgets'] ?? null;
                if (is_array($list) && ! array_is_list($list)) {
                    $validator->errors()->add("{$cp}.widgets", 'The widgets are not a list.');
                }

                foreach (self::slice($list, self::MAX_WIDGETS_PER_COLUMN) as $w => $widget) {
                    if (! is_array($widget)) {
                        continue;
                    }
                    $wp = "{$cp}.widgets.{$w}";
                    $widgets++;
                    $unique($widget['id'] ?? null, "{$wp}.id");
                    $chars += self::characters(array_diff_key($widget, ['id' => 1, 'type' => 1]));

                    if (($widget['type'] ?? null) === 'image' && is_string($widget['image_path'] ?? null) && $widget['image_path'] !== '') {
                        $pictures[$widget['image_path']][] = "{$wp}.image_path";
                    }
                }
            }
        }

        if ($widgets > self::MAX_WIDGETS) {
            $validator->errors()->add("{$at}.rows", 'A layout holds at most '.self::MAX_WIDGETS.' widgets; use a second layout section for the rest.');
        }
        if ($chars > self::MAX_CHARS) {
            $validator->errors()->add("{$at}.rows", 'There is too much text in this layout ('.number_format(self::MAX_CHARS).' characters at most); use a second layout section for the rest.');
        }

        if ($pictures !== []) {
            $found = Media::query()->whereIn('path', array_keys($pictures))->pluck('mime', 'path');
            foreach ($pictures as $path => $keys) {
                if (! $found->has($path) || ! str_starts_with((string) $found->get($path), 'image/')) {
                    foreach ($keys as $key) {
                        $validator->errors()->add($key, 'Choose a picture from the media library.');
                    }
                }
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
                    if (is_array($widget) && ($kept = self::widget($widget)) !== null) {
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
    private static function widget(array $widget): ?array
    {
        $type = (string) ($widget['type'] ?? '');
        $spec = self::widgets()[$type] ?? null;
        if (! $spec) {
            return null;
        }

        $out = ['id' => (string) ($widget['id'] ?? ''), 'type' => $type, ...self::kept($widget, $spec['fields'])];

        if (is_array($widget['show_on'] ?? null)) {
            $devices = array_values(array_intersect(SectionRules::DEVICES, $widget['show_on']));
            if ($devices !== [] && count($devices) < count(SectionRules::DEVICES)) {
                $out['show_on'] = $devices;
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
