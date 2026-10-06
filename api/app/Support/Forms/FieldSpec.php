<?php

namespace App\Support\Forms;

use App\Models\FormField;
use App\Support\UploadLimits;

/**
 * What each kind of form field is, in one place (0.117.0, docs/forms.md).
 *
 * `FormField::KINDS` is the list; this says what each entry means: which take
 * options, which collect nothing, what a kind keeps in `settings`, what may be
 * a condition's source. Four callers read it — the save request, the submit
 * validator, the resources and the console's `meta` — and a second copy of any
 * of these lists on the far side of the wire is the drift this project keeps
 * being caught by, so the console is sent the list rather than writing one.
 */
class FieldSpec
{
    /** Rows that lay the form out and collect nothing. Never validated, never stored. */
    public const LAYOUT = ['heading', 'step'];

    /** Kinds answered from a list an editor wrote. */
    public const WITH_OPTIONS = ['select', 'radio', 'checkboxes'];

    /**
     * Kinds another field's `show_if` may not read.
     *
     * A file is absent from the payload a browser evaluates conditions on, a
     * hidden value never varies, and a layout row has no answer at all.
     */
    public const NOT_A_SOURCE = ['file', 'hidden', 'heading', 'step'];

    public const OPS = ['equals', 'not_equals', 'includes', 'filled', 'empty'];

    /** The three that compare against something. */
    public const OPS_WITH_VALUE = ['equals', 'not_equals', 'includes'];

    /**
     * What a file field may be told to accept, and what each word admits.
     *
     * Groups rather than extensions because that is the decision an editor is
     * making — "photographs", "a PDF", "an office document" — and an
     * allowlist typed by hand is how `svg` or `html` ends up in one. No
     * archives and no SVG in any group: this is an upload open to the
     * internet, the careers form's argument.
     */
    public const FILE_ACCEPTS = [
        'image' => ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        'pdf' => ['pdf'],
        'document' => ['doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'],
    ];

    public const DEFAULT_ACCEPT = ['image', 'pdf'];

    public const MIN_KB = 100;

    public const MAX_KB = 20480;

    public const DEFAULT_KB = 5120;

    /** One form, three uploads. Each is a file on this server from a stranger. */
    public const MAX_FILE_FIELDS = 3;

    public const VALUE_MAX = 255;

    public const CONDITION_VALUE_MAX = 150;

    /**
     * The kinds, for the console's palette.
     *
     * @return list<array{value: string, label: string, blurb: string, takes_options: bool, is_layout: bool, is_file: bool, is_condition_source: bool}>
     */
    public static function kinds(): array
    {
        $copy = [
            'text' => ['Short text', 'One line: a name, a company, a subject.'],
            'email' => ['Email', 'An address, checked for shape. The first one on a form is where its receipt goes.'],
            'tel' => ['Phone', 'A telephone number, with spaces, brackets and a country code allowed.'],
            'number' => ['Number', 'A figure, with an optional lowest and highest.'],
            'textarea' => ['Paragraph', 'A longer answer over several lines.'],
            'select' => ['Dropdown', 'One choice from a list that opens.'],
            'checkbox' => ['Tick box', 'One box to tick, such as a consent.'],
            'url' => ['Web address', 'A link beginning http:// or https://.'],
            'date' => ['Date', 'A day, with an optional earliest and latest.'],
            'radio' => ['Single choice', 'One choice from a short list, every option visible.'],
            'checkboxes' => ['Multiple choice', 'Any number of choices from a list.'],
            'rating' => ['Rating', 'One to five stars.'],
            'file' => ['File upload', 'One file. Kept privately and downloaded from the console, never emailed.'],
            'hidden' => ['Hidden value', 'A fixed value stored with every submission. The visitor never sees or sends it.'],
            'heading' => ['Heading', 'A title and an optional paragraph between fields. Collects nothing.'],
            'step' => ['Step break', 'Starts a new step. Its label is that step’s title.'],
        ];

        $kinds = [];

        foreach (FormField::KINDS as $kind) {
            $kinds[] = [
                'value' => $kind,
                // Indexed without a fallback on purpose: a kind added to
                // `KINDS` with no words here is a missing offset the analyser
                // names, rather than a palette tile labelled with its key.
                'label' => $copy[$kind][0],
                'blurb' => $copy[$kind][1],
                'takes_options' => in_array($kind, self::WITH_OPTIONS, true),
                'is_layout' => in_array($kind, self::LAYOUT, true),
                'is_file' => $kind === 'file',
                'is_condition_source' => ! in_array($kind, self::NOT_A_SOURCE, true),
            ];
        }

        return $kinds;
    }

    /** @return list<array{value: string, label: string, takes_value: bool}> */
    public static function ops(): array
    {
        $labels = [
            'equals' => 'is',
            'not_equals' => 'is not',
            'includes' => 'includes',
            'filled' => 'is answered',
            'empty' => 'is not answered',
        ];

        return array_map(fn (string $op) => [
            'value' => $op,
            'label' => $labels[$op],
            'takes_value' => in_array($op, self::OPS_WITH_VALUE, true),
        ], self::OPS);
    }

    /** @return list<array{value: string, label: string, extensions: list<string>}> */
    public static function fileAccepts(): array
    {
        $labels = ['image' => 'Images', 'pdf' => 'PDF', 'document' => 'Office documents and text'];

        $out = [];

        foreach (self::FILE_ACCEPTS as $group => $extensions) {
            $out[] = ['value' => $group, 'label' => $labels[$group], 'extensions' => $extensions];
        }

        return $out;
    }

    /**
     * The largest upload a file field can actually take, in kilobytes.
     *
     * The field's own ceiling or php.ini's, whichever is lower — a figure
     * above `upload_max_filesize` is not a bigger limit, it is a promise the
     * server will not keep (`UploadLimits`).
     */
    public static function maxUploadKb(): int
    {
        return max(1, min(self::MAX_KB, UploadLimits::phpCeilingKb()));
    }

    /** Everything the console needs to draw the builder without a list of its own. */
    public static function meta(): array
    {
        return [
            'kinds' => self::kinds(),
            'ops' => self::ops(),
            'file_accepts' => self::fileAccepts(),
            'max_upload_kb' => self::maxUploadKb(),
            'max_file_fields' => self::MAX_FILE_FIELDS,
        ];
    }

    public static function isLayout(?string $kind): bool
    {
        return in_array($kind, self::LAYOUT, true);
    }

    /**
     * `settings` as stored: this kind's own keys and nothing else.
     *
     * Called after `problems()` found none, so every value here is already
     * the right shape; what this adds is the defaults and the dropping of
     * anything a different kind would have kept — an editor who changes a
     * number into a date must not leave `min: 5` behind to be read as a day.
     *
     * @return array<string, mixed>|null
     */
    public static function settings(string $kind, mixed $raw): ?array
    {
        $raw = is_array($raw) ? $raw : [];

        $settings = match ($kind) {
            'hidden' => ['value' => self::text($raw['value'] ?? null)],
            'number' => array_filter([
                'min' => is_numeric($raw['min'] ?? null) ? $raw['min'] + 0 : null,
                'max' => is_numeric($raw['max'] ?? null) ? $raw['max'] + 0 : null,
            ], fn ($v) => $v !== null),
            'date' => array_filter([
                'min' => self::dateBound($raw['min'] ?? null),
                'max' => self::dateBound($raw['max'] ?? null),
            ], fn ($v) => $v !== null),
            'file' => [
                'accept' => self::accept($raw['accept'] ?? null),
                'max_kb' => is_numeric($raw['max_kb'] ?? null) ? (int) $raw['max_kb'] : self::DEFAULT_KB,
            ],
            default => [],
        };

        return $settings === [] ? null : $settings;
    }

    /**
     * What is wrong with a field's `settings`, keyed by the setting.
     *
     * @return array<string, string>
     */
    public static function problems(string $kind, mixed $raw): array
    {
        $raw = is_array($raw) ? $raw : [];
        $problems = [];

        if ($kind === 'hidden') {
            $value = $raw['value'] ?? null;

            if ($value !== null && ! is_scalar($value)) {
                $problems['value'] = 'A hidden value is a single line of text.';
            } elseif (mb_strlen((string) $value) > self::VALUE_MAX) {
                $problems['value'] = 'A hidden value can be at most '.self::VALUE_MAX.' characters.';
            }
        }

        if ($kind === 'number') {
            foreach (['min' => 'lowest', 'max' => 'highest'] as $key => $word) {
                if (filled($raw[$key] ?? null) && ! is_numeric($raw[$key])) {
                    $problems[$key] = "The {$word} value must be a number.";
                }
            }

            if ($problems === [] && is_numeric($raw['min'] ?? null) && is_numeric($raw['max'] ?? null) && $raw['min'] > $raw['max']) {
                $problems['max'] = 'The highest value cannot be below the lowest.';
            }
        }

        if ($kind === 'date') {
            foreach (['min' => 'earliest', 'max' => 'latest'] as $key => $word) {
                if (filled($raw[$key] ?? null) && self::dateBound($raw[$key]) === null) {
                    $problems[$key] = "The {$word} date is “today” or a date written as YYYY-MM-DD.";
                }
            }

            $min = self::resolveDate($raw['min'] ?? null);
            $max = self::resolveDate($raw['max'] ?? null);

            if ($problems === [] && $min !== null && $max !== null && $min > $max) {
                $problems['max'] = 'The latest date cannot be before the earliest.';
            }
        }

        if ($kind === 'file') {
            $accept = $raw['accept'] ?? null;

            if ($accept !== null) {
                if (! is_array($accept) || $accept === []) {
                    $problems['accept'] = 'Choose at least one kind of file this field accepts.';
                } elseif (array_diff(array_map('strval', array_filter($accept, 'is_scalar')), array_keys(self::FILE_ACCEPTS)) !== [] || count(array_filter($accept, 'is_scalar')) !== count($accept)) {
                    $problems['accept'] = 'A file field accepts images, PDFs or documents — nothing else.';
                }
            }

            $maxKb = $raw['max_kb'] ?? null;

            if ($maxKb !== null && $maxKb !== '') {
                if (filter_var($maxKb, FILTER_VALIDATE_INT) === false || $maxKb < self::MIN_KB || $maxKb > self::MAX_KB) {
                    $problems['max_kb'] = 'The size limit is between '.self::MIN_KB.' KB and '.self::MAX_KB.' KB.';
                }
            }
        }

        return $problems;
    }

    /**
     * `show_if` as stored, or null for "always shown".
     *
     * @return array{field: string, op: string, value?: string}|null
     */
    public static function showIf(mixed $raw): ?array
    {
        if (! is_array($raw) || blank($raw['field'] ?? null) || ! in_array($raw['op'] ?? null, self::OPS, true)) {
            return null;
        }

        $condition = ['field' => (string) $raw['field'], 'op' => (string) $raw['op']];

        if (in_array($condition['op'], self::OPS_WITH_VALUE, true)) {
            $condition['value'] = self::text($raw['value'] ?? null);
        }

        return $condition;
    }

    /** The extensions a file field admits. */
    public static function extensions(FormField $field): array
    {
        $extensions = [];

        foreach (self::accept($field->settings['accept'] ?? null) as $group) {
            $extensions = [...$extensions, ...self::FILE_ACCEPTS[$group]];
        }

        return $extensions;
    }

    /** The size limit in force for a file field: its own, never above the server's. */
    public static function maxKb(FormField $field): int
    {
        $wanted = (int) ($field->settings['max_kb'] ?? self::DEFAULT_KB);

        if ($wanted < 1) {
            $wanted = self::DEFAULT_KB;
        }

        return min($wanted, self::maxUploadKb());
    }

    /** A date bound as a real day: "today" resolved in the application's timezone. */
    public static function resolveDate(mixed $bound): ?string
    {
        $bound = self::dateBound($bound);

        return $bound === 'today' ? now()->toDateString() : $bound;
    }

    /**
     * What a page may know of a field's settings.
     *
     * Everything but a hidden field's value: the server stores that from the
     * definition whatever is posted, so the browser has no use for it — and a
     * campaign code or an internal routing word in the page source is one
     * more thing somebody can read. A file field's limit is the one in force
     * and its extensions are spelled out, so the page can refuse a file
     * before sending it without carrying the allowlist itself.
     *
     * @return array<string, mixed>|null
     */
    public static function publicSettings(FormField $field): ?array
    {
        return match ($field->kind) {
            'file' => [
                'accept' => self::accept($field->settings['accept'] ?? null),
                'extensions' => self::extensions($field),
                'max_kb' => self::maxKb($field),
            ],
            'hidden' => null,
            default => $field->settings ?: null,
        };
    }

    /** @return list<string> */
    private static function accept(mixed $raw): array
    {
        $chosen = is_array($raw) ? array_map('strval', array_filter($raw, 'is_scalar')) : [];
        // In the list's own order, so two forms ticking the same boxes store
        // the same thing whichever was ticked first.
        $accept = array_values(array_filter(array_keys(self::FILE_ACCEPTS), fn (string $group) => in_array($group, $chosen, true)));

        return $accept === [] ? self::DEFAULT_ACCEPT : $accept;
    }

    private static function dateBound(mixed $value): ?string
    {
        if (! is_string($value) || $value === '') {
            return null;
        }

        if ($value === 'today') {
            return 'today';
        }

        $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $value);

        return $date !== false && $date->format('Y-m-d') === $value ? $value : null;
    }

    private static function text(mixed $value): string
    {
        return is_scalar($value) ? trim((string) (is_bool($value) ? (int) $value : $value)) : '';
    }
}
