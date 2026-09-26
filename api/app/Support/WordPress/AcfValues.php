<?php

namespace App\Support\WordPress;

use App\Support\CustomFields\CustomFields;
use App\Support\HtmlSanitiser;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Advanced Custom Fields values, as custom fields here.
 *
 * **Where they come from.** WordPress includes a record's ACF values in the
 * REST API as `acf` only when each field group has "Show in REST API"
 * switched on; the scan cannot see them otherwise, and the review says so.
 * WooCommerce's API never includes `acf`, but it does include `meta_data`,
 * where ACF stores each value beside a `_name → field_…` companion — that
 * pairing is how a product's ACF fields are recognised.
 *
 * **What they become.** ACF does not publish its field definitions over
 * REST, so each field's kind is *inferred* from the values seen (a string
 * of eight digits is a date, an attachment id is a picture, text with tags
 * is rich text) and shown in the review, where it can be changed or the
 * field left out. Shapes with no equivalent here — a repeater, flexible
 * content, a group, a gallery, a relationship — are named and not kept.
 *
 * Every value is written through `CustomFields::save()` after the same
 * validation the console applies (`CustomFields::rules()`), so an imported
 * value is held to exactly what an editor's would be.
 */
final class AcfValues
{
    /** Kinds the inference can produce and the review may choose. */
    public const KINDS = ['text', 'textarea', 'rich_text', 'number', 'date', 'url', 'email', 'boolean', 'image', 'file', 'list'];

    private const SAMPLES = 20;

    /**
     * The fields found per target, each with its inferred kind — or why it
     * cannot be kept.
     *
     * @param  array<string, iterable<array<string, mixed>>>  $sources  target => records
     * @return array<string, list<array{source: string, key: string, label: string, kind: ?string, unsupported: ?string, count: int}>>
     */
    public static function infer(Context $ctx, array $sources): array
    {
        $out = [];

        foreach ($sources as $target => $records) {
            $samples = [];
            $counts = [];

            foreach ($records as $record) {
                foreach (self::values($record) as $name => $value) {
                    if (self::blank($value)) {
                        continue;
                    }

                    $counts[$name] = ($counts[$name] ?? 0) + 1;

                    if (count($samples[$name] ?? []) < self::SAMPLES) {
                        $samples[$name][] = $value;
                    }
                }
            }

            foreach ($counts as $name => $count) {
                [$kind, $unsupported] = self::kindOf($ctx, $samples[$name]);
                $out[$target][] = [
                    'source' => (string) $name,
                    'key' => self::key((string) $name),
                    'label' => Str::headline((string) $name),
                    'kind' => $kind,
                    'unsupported' => $unsupported,
                    'count' => $count,
                ];
            }
        }

        return $out;
    }

    /**
     * ACF name → a custom field key here: lower-case, `[a-z0-9_]`, starting
     * with a letter, and never one of `CustomFields::RESERVED_KEYS` (an ACF
     * field called `title` becomes `acf_title`).
     */
    public static function key(string $name): string
    {
        $key = trim((string) preg_replace('/[^a-z0-9_]+/', '_', strtolower($name)), '_');

        if ($key === '' || ! preg_match('/^[a-z]/', $key) || in_array($key, CustomFields::RESERVED_KEYS, true)) {
            $key = 'acf_'.$key;
        }

        return Str::limit($key, 60, '');
    }

    /** The kind the review settled on for a field, or null when it is not kept. */
    public static function chosenKind(Context $ctx, string $target, string $name): ?string
    {
        $chosen = (($ctx->decision('acf_kinds') ?? [])[$target] ?? [])[$name] ?? null;

        if ($chosen === 'skip') {
            return null;
        }

        foreach ((Decisions::options($ctx)['acf'][$target] ?? []) as $field) {
            if ($field['source'] === $name) {
                if ($field['unsupported'] !== null) {
                    return null;
                }

                return in_array($chosen, self::KINDS, true) ? $chosen : $field['kind'];
            }
        }

        return null;
    }

    /**
     * Warnings for the fields on one record that will not come across.
     *
     * @param  array<string, mixed>  $record
     */
    public static function plan(Context $ctx, string $target, array $record, Outcome $outcome): void
    {
        foreach (self::values($record) as $name => $value) {
            if (self::blank($value)) {
                continue;
            }

            if (self::chosenKind($ctx, $target, (string) $name) === null) {
                $why = collect(Decisions::options($ctx)['acf'][$target] ?? [])->firstWhere('source', $name)['unsupported'] ?? 'left out in the review';
                $outcome->warn("The ACF field \"{$name}\" is not kept ({$why}).");
            }
        }
    }

    /**
     * The attachments a record's picture and file fields point at.
     *
     * @param  array<string, mixed>  $record
     * @return list<int|string>
     */
    public static function media(Context $ctx, string $target, array $record): array
    {
        if (! $ctx->import->wants('custom')) {
            return [];
        }

        $out = [];

        foreach (self::values($record) as $name => $value) {
            if (in_array(self::chosenKind($ctx, $target, (string) $name), ['image', 'file'], true) && ($ref = self::attachmentRef($value)) !== null) {
                $out[] = $ref;
            }
        }

        return $out;
    }

    /** @param  array<string, mixed>  $record */
    public static function write(Context $ctx, Model $model, string $target, array $record): void
    {
        $input = [];

        foreach (self::values($record) as $name => $value) {
            $kind = self::chosenKind($ctx, $target, (string) $name);

            if ($kind === null || self::blank($value)) {
                continue;
            }

            $input[self::key((string) $name)] = self::convert($ctx, $kind, $value);
        }

        if ($input === []) {
            return;
        }

        // Held to the console's rules, one value at a time, so one bad value costs only itself.
        $rules = CustomFields::rules($target);
        $kept = [];

        foreach ($input as $key => $value) {
            $path = 'custom_fields.'.$key;

            if (! isset($rules[$path])) {
                continue;
            }

            $check = Validator::make(['custom_fields' => [$key => $value]], [$path => $rules[$path]]);

            if ($check->fails()) {
                $ctx->report->reason('field_groups', 'warn', "A value for \"{$key}\" did not fit the field and was left out.", (string) $model->getAttribute('title'));

                continue;
            }

            $kept[$key] = $value;
        }

        CustomFields::save($model, $kept);
    }

    /**
     * ACF values on a record: `acf` from the WordPress API, or pairs out of
     * WooCommerce's `meta_data`.
     *
     * @param  array<string, mixed>  $record
     * @return array<string, mixed>
     */
    public static function values(array $record): array
    {
        if (isset($record['acf']) && is_array($record['acf'])) {
            return $record['acf'];
        }

        $meta = [];
        foreach ((array) ($record['meta_data'] ?? []) as $row) {
            if (is_array($row) && isset($row['key'])) {
                $meta[(string) $row['key']] = $row['value'] ?? null;
            }
        }

        $out = [];
        foreach ($meta as $key => $value) {
            if (! str_starts_with($key, '_') && is_string($meta['_'.$key] ?? null) && str_starts_with($meta['_'.$key], 'field_')) {
                $out[$key] = self::unserialised($value);
            }
        }

        return $out;
    }

    /**
     * @param  list<mixed>  $samples
     * @return array{0: ?string, 1: ?string} kind, or the reason it has no kind here
     */
    private static function kindOf(Context $ctx, array $samples): array
    {
        $kinds = [];

        foreach ($samples as $value) {
            [$kind, $unsupported] = self::kindOfOne($ctx, $value);

            if ($unsupported !== null) {
                return [null, $unsupported];
            }

            $kinds[$kind] = true;
        }

        $kinds = array_keys($kinds);

        return match (true) {
            count($kinds) === 1 => [$kinds[0], null],
            // Mixed short and long text is a textarea; any markup at all makes it rich text.
            in_array('rich_text', $kinds, true) => ['rich_text', null],
            array_diff($kinds, ['text', 'textarea', 'url', 'email', 'number', 'date']) === [] => ['textarea', null],
            default => ['text', null],
        };
    }

    /** @return array{0: string, 1: ?string} */
    private static function kindOfOne(Context $ctx, mixed $value): array
    {
        if (is_bool($value)) {
            return ['boolean', null];
        }

        if (is_array($value)) {
            if (array_is_list($value)) {
                if (array_filter($value, fn ($v) => ! is_scalar($v)) === []) {
                    return ['list', null];
                }

                $first = $value[0] ?? [];

                return match (true) {
                    is_array($first) && (isset($first['sizes']) || isset($first['mime_type'])) => ['', 'a gallery'],
                    is_array($first) && (isset($first['ID']) || isset($first['post_title'])) => ['', 'a relationship'],
                    default => ['', 'a repeater or flexible content'],
                };
            }

            return match (true) {
                isset($value['url']) && (isset($value['sizes']) || isset($value['mime_type']) || isset($value['filename'])) => [str_starts_with((string) ($value['mime_type'] ?? 'image/'), 'image/') ? 'image' : 'file', null],
                isset($value['url'], $value['title']) || isset($value['url'], $value['target']) => ['url', null],
                isset($value['ID']) || isset($value['post_title']) => ['', 'a relationship'],
                default => ['', 'a group'],
            };
        }

        if (is_int($value) || (is_string($value) && ctype_digit($value) && strlen($value) !== 8)) {
            if (($attachment = $ctx->record('media', (int) $value)) !== null) {
                return [str_starts_with((string) ($attachment['mime_type'] ?? 'image/'), 'image/') ? 'image' : 'file', null];
            }

            return ['number', null];
        }

        $text = (string) $value;

        return match (true) {
            is_float($value) || is_numeric($text) && ! preg_match('/^\d{8}$/', $text) => ['number', null],
            (bool) preg_match('/^\d{8}$|^\d{4}-\d{2}-\d{2}$/', $text) => ['date', null],
            filter_var($text, FILTER_VALIDATE_URL) !== false => ['url', null],
            filter_var($text, FILTER_VALIDATE_EMAIL) !== false => ['email', null],
            $text !== strip_tags($text) => ['rich_text', null],
            mb_strlen($text) > 255 || str_contains($text, "\n") => ['textarea', null],
            default => ['text', null],
        };
    }

    private static function convert(Context $ctx, string $kind, mixed $value): mixed
    {
        return match ($kind) {
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'number' => is_numeric($value) ? $value + 0 : null,
            'date' => self::date($value),
            'url' => is_array($value) ? (string) ($value['url'] ?? '') : (string) $value,
            'image', 'file' => ($ref = self::attachmentRef($value)) === null ? null : $ctx->media($ref),
            'list' => array_values(array_map('strval', (array) $value)),
            'rich_text' => HtmlSanitiser::clean((string) $value),
            default => is_scalar($value) ? trim((string) $value) : null,
        };
    }

    private static function date(mixed $value): ?string
    {
        $text = (string) $value;

        try {
            return preg_match('/^\d{8}$/', $text)
                ? CarbonImmutable::createFromFormat('Ymd', $text)->format('Y-m-d')
                : CarbonImmutable::parse($text)->format('Y-m-d');
        } catch (\Throwable) {
            return null;
        }
    }

    /** An attachment id or URL out of whatever return format the field used. */
    private static function attachmentRef(mixed $value): int|string|null
    {
        return match (true) {
            is_int($value), is_string($value) && ctype_digit($value) => (int) $value,
            is_array($value) && isset($value['ID']) => (int) $value['ID'],
            is_array($value) && isset($value['id']) => (int) $value['id'],
            is_array($value) && isset($value['url']) => (string) $value['url'],
            is_string($value) && preg_match('#^https?://#', $value) => $value,
            default => null,
        };
    }

    private static function unserialised(mixed $value): mixed
    {
        // WooCommerce hands back ACF's serialised arrays (galleries, checkboxes)
        // as strings. `allowed_classes: false` means no object is ever built
        // from the site's bytes — an array or nothing.
        if (is_string($value) && preg_match('/^a:\d+:\{/', $value)) {
            $decoded = @unserialize($value, ['allowed_classes' => false]);

            return is_array($decoded) ? $decoded : $value;
        }

        return $value;
    }

    private static function blank(mixed $value): bool
    {
        // `false` is a value (an unticked true/false field), not an absence.
        return $value === null || $value === '' || $value === [];
    }
}
