<?php

namespace App\Support\CustomFields;

use App\Enums\CustomFieldKind;
use App\Models\CustomField;
use App\Models\CustomFieldGroup;
use App\Models\CustomFieldValue;
use App\Models\Media;
use App\Support\HtmlSanitiser;
use App\Support\MediaMeta;
use App\Support\MediaUrl;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;
use NumberFormatter;
use Throwable;

/**
 * Custom fields on a record: the rules, the write and both read shapes.
 *
 * **The definition is the contract, not the payload** — the `FormValidator`
 * rule. A request's `custom_fields` is an object keyed by field key; a key no
 * group declares for that record is dropped rather than refused (a stale tab
 * should not get a 422 it cannot act on, and its value must not be stored
 * either), a dropdown's value is checked against its own options, a linked
 * record against the table, and a media path against the library.
 *
 * **Absent means "leave alone".** A request that does not carry
 * `custom_fields` touches nothing; one that carries it touches only the keys
 * it names, and a key sent blank clears that field. That is what lets a
 * `PATCH` from anywhere else — the SEO overview, a script — leave the values
 * where they were.
 *
 * Every entity's admin controller calls `save()`, its request spreads
 * `rules()`, and its resources call `adminValues()`/`definitions()` or
 * `publicFields()`. There is no second implementation anywhere.
 */
final class CustomFields
{
    /**
     * Keys a field may not take.
     *
     * A custom field's value travels beside the record's own columns — the
     * console draws them on one form and the page on one screen — so a field
     * called `title` or `slug` is a second answer to a question the record
     * already answers, and the one a template reads would depend on which it
     * looked at first. `website` is the honeypot's name everywhere on this
     * site.
     */
    public const RESERVED_KEYS = [
        'id', 'title', 'name', 'slug', 'status', 'summary', 'body', 'type',
        'seo', 'faqs', 'answer_blocks', 'custom_fields', 'custom_data',
        'created_at', 'updated_at', 'published_at', 'website',
    ];

    /** What a list field holds by default when it names no ceiling. */
    public const LIST_MAX = 30;

    /* ---------------------------------------------------------------- read */

    /**
     * The active groups for a target, with their fields, in order.
     *
     * @return Collection<int, CustomFieldGroup>
     */
    public static function groupsFor(string $target): Collection
    {
        return CustomFieldGroup::query()
            ->active()
            ->forTarget($target)
            ->with('fields')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * key => field for every field that applies to a target. A key two
     * groups on one target both declared is refused when the second group is
     * saved, so the map cannot lose one.
     *
     * @return array<string, CustomField>
     */
    public static function fieldsFor(string $target): array
    {
        $out = [];

        foreach (self::groupsFor($target) as $group) {
            foreach ($group->fields as $field) {
                $out[$field->key] ??= $field;
            }
        }

        return $out;
    }

    /** The target key of a record — the morph alias, or `entry:<slug>`. */
    public static function targetOf(Model $model): string
    {
        return method_exists($model, 'customFieldTarget') ? $model->customFieldTarget() : $model->getMorphClass();
    }

    /* ----------------------------------------------------------- validate */

    /**
     * Validation rules for `custom_fields.*`, generated from the stored
     * definitions. Spread into a request's `rules()` when the request
     * carries the key — `AcceptsCustomFields` decides that.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function rules(string $target): array
    {
        $rules = ['custom_fields' => ['nullable', 'array']];

        foreach (self::fieldsFor($target) as $key => $field) {
            $path = 'custom_fields.'.$key;
            $base = [$field->required ? 'required' : 'nullable'];

            switch ($field->kind) {
                case CustomFieldKind::Text:
                    $rules[$path] = [...$base, 'string', 'max:'.min((int) ($field->setting('max_length') ?: 255), 255)];
                    break;
                case CustomFieldKind::Textarea:
                    $rules[$path] = [...$base, 'string', 'max:5000'];
                    break;
                case CustomFieldKind::RichText:
                    $rules[$path] = [...$base, 'string', 'max:65000'];
                    break;
                case CustomFieldKind::Number:
                    $rules[$path] = [...$base, 'numeric'];
                    if (is_numeric($field->setting('min'))) {
                        $rules[$path][] = 'min:'.$field->setting('min');
                    }
                    if (is_numeric($field->setting('max'))) {
                        $rules[$path][] = 'max:'.$field->setting('max');
                    }
                    break;
                case CustomFieldKind::Date:
                    $rules[$path] = [...$base, 'date_format:Y-m-d'];
                    break;
                case CustomFieldKind::Url:
                    // http and https only: this becomes an `href` on a live
                    // page, and `javascript:` is a URL too.
                    $rules[$path] = [...$base, 'string', 'max:2048', 'url:http,https'];
                    break;
                case CustomFieldKind::Email:
                    // Never `email:dns` — a lookup on the request path.
                    $rules[$path] = [...$base, 'string', 'max:190', 'email:rfc'];
                    break;
                case CustomFieldKind::Select:
                    // A dropdown with no options would accept anything, which
                    // is the opposite of what a dropdown is for.
                    $rules[$path] = [...$base, 'string', Rule::in($field->optionValues() ?: ['__none__'])];
                    break;
                case CustomFieldKind::MultiSelect:
                    $rules[$path] = [...$base, 'array'];
                    $rules[$path.'.*'] = ['string', Rule::in($field->optionValues() ?: ['__none__'])];
                    break;
                case CustomFieldKind::Boolean:
                    $rules[$path] = [...$base, 'boolean'];
                    break;
                case CustomFieldKind::Image:
                    $rules[$path] = [...$base, 'string', 'max:255',
                        Rule::exists('media', 'path')->whereNull('deleted_at')->where(fn ($q) => $q->where('mime', 'like', 'image/%'))];
                    break;
                case CustomFieldKind::File:
                    $rules[$path] = [...$base, 'string', 'max:255', Rule::exists('media', 'path')->whereNull('deleted_at')];
                    break;
                case CustomFieldKind::Relation:
                    $exists = Targets::existsRule((string) $field->setting('target'));
                    // A field whose target has gone accepts nothing rather
                    // than anything.
                    $rules[$path] = [...$base, 'integer', $exists ?? Rule::in([])];
                    break;
                case CustomFieldKind::List:
                    $max = (int) ($field->setting('max_items') ?: self::LIST_MAX);
                    $rules[$path] = [...$base, 'array', 'max:'.$max];
                    $rules[$path.'.*'] = ['nullable', 'string', 'max:255'];
                    break;
            }
        }

        return $rules;
    }

    /**
     * `custom_fields.key` => the field's label, so a message reads "The
     * Warranty field is required" rather than naming the dotted path.
     *
     * @return array<string, string>
     */
    public static function attributes(string $target): array
    {
        $out = [];

        foreach (self::fieldsFor($target) as $key => $field) {
            $out['custom_fields.'.$key] = $field->label;
            $out['custom_fields.'.$key.'.*'] = $field->label;
        }

        return $out;
    }

    /**
     * Rich-text values cleaned before validation, like every body on the
     * site — so nothing downstream ever sees the raw markup.
     */
    public static function sanitise(string $target, mixed $input): mixed
    {
        if (! is_array($input)) {
            return $input;
        }

        foreach (self::fieldsFor($target) as $key => $field) {
            if ($field->kind === CustomFieldKind::RichText && array_key_exists($key, $input)
                && (is_string($input[$key]) || $input[$key] === null)) {
                $input[$key] = HtmlSanitiser::clean($input[$key]);
            }
        }

        return $input;
    }

    /* -------------------------------------------------------------- write */

    /**
     * Writes the values a request sent. Null — the key was absent — touches
     * nothing; a key sent blank clears that one field; a key no group
     * declares is dropped.
     */
    public static function save(Model $model, ?array $input): void
    {
        if ($input === null || ! method_exists($model, 'customValues')) {
            return;
        }

        foreach (self::fieldsFor(self::targetOf($model)) as $key => $field) {
            if (! array_key_exists($key, $input)) {
                continue;
            }

            $value = self::normalise($field, $input[$key]);

            if ($value === null) {
                $model->customValues()->where('custom_field_id', $field->id)->delete();

                continue;
            }

            // Through the relation so `fieldable_type` comes from the morph
            // map — never set by hand.
            $model->customValues()->updateOrCreate(['custom_field_id' => $field->id], ['value' => $value]);
        }
    }

    /** The stored shape of a submitted value, or null for "nothing". */
    private static function normalise(CustomField $field, mixed $value): mixed
    {
        if ($value === null || $value === '' || $value === []) {
            return null;
        }

        return match ($field->kind) {
            CustomFieldKind::Boolean => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            CustomFieldKind::Number => is_numeric($value)
                ? ((string) (int) $value === (string) $value || is_int($value) ? (int) $value : (float) $value)
                : null,
            CustomFieldKind::Relation => (int) $value ?: null,
            CustomFieldKind::MultiSelect, CustomFieldKind::List => (function () use ($field, $value) {
                $rows = array_values(array_filter(
                    array_map(fn ($v) => trim((string) $v), Arr::wrap($value)),
                    fn ($v) => $v !== '',
                ));
                if ($field->kind === CustomFieldKind::MultiSelect) {
                    $rows = array_values(array_unique($rows));
                }

                return $rows === [] ? null : $rows;
            })(),
            CustomFieldKind::RichText => HtmlSanitiser::clean((string) $value),
            default => (($s = trim((string) $value)) === '' ? null : $s),
        };
    }

    /* -------------------------------------------------------------- admin */

    /**
     * The groups that apply to a target, as the console's Fields tab draws
     * them. A linked-record field carries its `choices`, so the form needs no
     * second request and no endpoint gated on a role the form's own screen
     * may not share.
     *
     * @return array<int, array<string, mixed>>
     */
    public static function definitions(string $target): array
    {
        return self::groupsFor($target)->map(fn (CustomFieldGroup $group) => [
            'id' => $group->id,
            'name' => $group->name,
            'slug' => $group->slug,
            'placement' => $group->placement,
            'fields' => $group->fields->map(fn (CustomField $f) => [
                'id' => $f->id,
                'key' => $f->key,
                'label' => $f->label,
                'kind' => $f->kind->value,
                'help' => $f->help,
                'required' => $f->required,
                'options' => $f->options ?? [],
                'settings' => (object) ($f->settings ?? []),
                'show_on_page' => $f->show_on_page,
                'choices' => $f->kind === CustomFieldKind::Relation
                    ? Targets::choices((string) $f->setting('target'))
                    : [],
            ])->values()->all(),
        ])->values()->all();
    }

    /**
     * The values that apply, as stored — key => value — for the console's
     * form. Values of a group that no longer applies, or is switched off,
     * are kept in the table and left out here.
     *
     * @return array<string, mixed>|null null when the relation was not loaded
     */
    public static function adminValues(Model $model): ?array
    {
        $values = self::applicable($model);

        if ($values === null) {
            return null;
        }

        $out = [];
        foreach ($values as $v) {
            $out[$v->field->key] = $v->value;
        }

        return $out;
    }

    /**
     * key => URL for image and file values, so the console's picture field
     * can show what is stored without composing a storage URL itself.
     *
     * @return array<string, string>|null
     */
    public static function adminMedia(Model $model): ?array
    {
        $values = self::applicable($model);

        if ($values === null) {
            return null;
        }

        $out = [];
        foreach ($values as $v) {
            if (in_array($v->field->kind, [CustomFieldKind::Image, CustomFieldKind::File], true) && is_string($v->value)) {
                $out[$v->field->key] = MediaUrl::for($v->value);
            }
        }

        return $out;
    }

    /* ------------------------------------------------------------- public */

    /**
     * What the page draws: `{key, label, kind, value, display}` for every
     * field in a `details` group marked `show_on_page`, in group then field
     * order, with anything empty left out.
     *
     * @return array<int, array{key: string, label: string, kind: string, value: mixed, display: string}>|null
     */
    public static function publicFields(Model $model): ?array
    {
        $values = self::applicable($model);

        if ($values === null) {
            return null;
        }

        $drawn = array_values(array_filter(
            $values,
            fn (CustomFieldValue $v) => $v->field->group->placement === 'details' && $v->field->show_on_page,
        ));

        return array_values(array_filter(self::present($drawn)));
    }

    /**
     * Every applicable value, keyed — `hidden` groups included — for a
     * template or an integration reading the API. `hidden` means "not
     * drawn", never "private": nothing typed into a custom field is a
     * secret, and the console says so.
     *
     * @return array<string, mixed>|null
     */
    public static function publicData(Model $model): ?array
    {
        $values = self::applicable($model);

        if ($values === null) {
            return null;
        }

        $out = [];
        foreach (self::present($values) as $row) {
            if ($row !== null) {
                $out[$row['key']] = $row['value'];
            }
        }

        return $out;
    }

    /**
     * The loaded values whose field belongs to an active group attached to
     * this record's target, in group then field order.
     *
     * @return array<int, CustomFieldValue>|null
     */
    private static function applicable(Model $model): ?array
    {
        if (! $model->relationLoaded('customValues')) {
            return null;
        }

        $target = self::targetOf($model);

        /** @var \Illuminate\Support\Collection<int, CustomFieldValue> $loaded */
        $loaded = $model->getRelation('customValues');

        return $loaded
            ->filter(function (CustomFieldValue $v) use ($target) {
                $field = $v->relationLoaded('field') ? $v->getRelation('field') : null;
                $group = $field?->relationLoaded('group') ? $field->getRelation('group') : null;

                return $group !== null && $group->is_active && $group->appliesTo($target);
            })
            ->sortBy(fn (CustomFieldValue $v) => [
                $v->field->group->sort_order, $v->field->group->name, $v->field->sort_order, $v->field->id,
            ])
            ->values()
            ->all();
    }

    /**
     * Each value in its public shape, or null when there is nothing to show
     * — a linked record no longer published, a file gone from the library.
     *
     * @param  array<int, CustomFieldValue>  $values
     * @return array<int, array{key: string, label: string, kind: string, value: mixed, display: string}|null>
     */
    private static function present(array $values): array
    {
        // One query per linked target and one for every media path, never
        // one per value.
        $links = [];
        $paths = [];
        foreach ($values as $v) {
            if ($v->field->kind === CustomFieldKind::Relation && is_numeric($v->value)) {
                $links[(string) $v->field->setting('target')][] = (int) $v->value;
            }
            if (in_array($v->field->kind, [CustomFieldKind::Image, CustomFieldKind::File], true) && is_string($v->value)) {
                $paths[] = $v->value;
            }
        }

        $resolved = [];
        foreach ($links as $target => $ids) {
            $resolved[$target] = Targets::resolve($target, array_values(array_unique($ids)));
        }

        $media = $paths === [] ? collect() : Media::query()
            ->whereIn('path', array_values(array_unique($paths)))
            ->get(['path', 'filename', 'width', 'height', 'mime'])
            ->keyBy('path');

        return array_map(function (CustomFieldValue $v) use ($resolved, $media) {
            $field = $v->field;
            $raw = $v->value;
            $value = $raw;
            $display = is_scalar($raw) ? (string) $raw : '';

            switch ($field->kind) {
                case CustomFieldKind::Number:
                    $display = self::number($raw);
                    break;
                case CustomFieldKind::Date:
                    $display = self::date($raw);
                    break;
                case CustomFieldKind::Select:
                    $display = $field->optionLabel((string) $raw);
                    break;
                case CustomFieldKind::MultiSelect:
                    $value = array_values(array_map('strval', Arr::wrap($raw)));
                    $display = implode(', ', array_map(fn ($o) => $field->optionLabel($o), $value));
                    break;
                case CustomFieldKind::List:
                    $value = array_values(array_map('strval', Arr::wrap($raw)));
                    $display = implode(', ', $value);
                    break;
                case CustomFieldKind::Boolean:
                    $value = (bool) $raw;
                    $display = $value ? 'Yes' : 'No';
                    break;
                case CustomFieldKind::Url:
                    $display = preg_replace('#^https?://(www\.)?#i', '', rtrim((string) $raw, '/')) ?? (string) $raw;
                    break;
                case CustomFieldKind::Image:
                    $row = $media->get((string) $raw);
                    if ($row === null) {
                        return null;
                    }
                    $value = [
                        'url' => MediaUrl::for($raw),
                        'alt' => MediaMeta::alt((string) $raw) ?? $field->label,
                        'focus' => MediaMeta::focus((string) $raw),
                        'blur' => MediaMeta::blur((string) $raw),
                        'width' => $row->width,
                        'height' => $row->height,
                    ];
                    $display = $value['alt'];
                    break;
                case CustomFieldKind::File:
                    $row = $media->get((string) $raw);
                    if ($row === null) {
                        return null;
                    }
                    $value = ['url' => MediaUrl::for($raw), 'name' => $row->filename, 'mime' => $row->mime];
                    $display = $row->filename;
                    break;
                case CustomFieldKind::Relation:
                    $link = $resolved[(string) $field->setting('target')][(int) $raw] ?? null;
                    if ($link === null) {
                        return null;
                    }
                    $value = $link;
                    $display = $link['title'];
                    break;
                case CustomFieldKind::RichText:
                    // Cleaned on write; rendered through `Prose` by the page.
                    $display = HtmlSanitiser::toText((string) $raw);
                    break;
                default:
                    break;
            }

            return [
                'key' => $field->key,
                'label' => $field->label,
                'kind' => $field->kind->value,
                'value' => $value,
                'display' => $display,
            ];
        }, $values);
    }

    /** A number as an Indian reader writes it — 1,00,000, not 100,000. */
    private static function number(mixed $raw): string
    {
        if (! is_numeric($raw)) {
            return (string) $raw;
        }

        if (class_exists(NumberFormatter::class)) {
            $formatted = (new NumberFormatter('en_IN', NumberFormatter::DECIMAL))->format($raw + 0);
            if (is_string($formatted)) {
                return $formatted;
            }
        }

        return (string) $raw;
    }

    /** A date the way `lib/dates.ts` pins them: en-IN, "26 September 2026". */
    private static function date(mixed $raw): string
    {
        try {
            return Carbon::parse((string) $raw)->format('j F Y');
        } catch (Throwable) {
            return (string) $raw;
        }
    }
}
