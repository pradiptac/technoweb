<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Models\FormField;
use App\Support\Forms\FieldSpec;
use App\Support\LinkPattern;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return array_merge(self::formRules(), [
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:150', 'alpha_dash', Rule::unique('forms', 'slug')],
        ]);
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn (Validator $v) => self::checkFields($v, $this->input('fields')));
    }

    /** Shared with UpdateFormRequest — one definition of a field. */
    public static function formRules(): array
    {
        return [
            'status' => ['sometimes', Rule::enum(PublishStatus::class)],
            'submit_label' => ['sometimes', 'string', 'max:60'],
            'success_message' => ['nullable', 'string', 'max:500'],
            // Validated as an address because it becomes a mail recipient. A
            // typo here means submissions silently go nowhere.
            'notify_email' => ['nullable', 'email:rfc', 'max:190'],

            /*
             * Where a visitor is sent once the form is in, instead of being
             * shown the success message — a thank-you page, a calendar, a
             * download. It becomes a navigation on a public page, so it is
             * held to a path on this site or an http(s) URL: `javascript:`
             * would run for everybody who filled the form in, and `//host`
             * is another site however much it looks like a path.
             */
            'redirect_url' => ['nullable', 'string', 'max:2048', LinkPattern::PAGE_RULE],

            /*
             * Whether this form may be framed by another website.
             *
             * It is the only thing standing between a form and somebody else's
             * page, and it is deliberately not much: `POST /forms/{slug}` has
             * always been public and unauthenticated, so this changes who is
             * *offered* the form rather than who can post to it. What bounds
             * abuse is the 10/min throttle and the `website` honeypot, exactly
             * as it already does for the contact page.
             */
            'embed_enabled' => ['sometimes', 'boolean'],

            // Fifty rows rather than the thirty it was: headings and step
            // breaks are rows too, and they collect nothing.
            'fields' => ['sometimes', 'array', 'max:50'],
            'fields.*.kind' => ['required', Rule::in(FormField::KINDS)],
            /*
             * The field key. Slug characters only, because it becomes an array
             * key, a validation rule name and a line in an email — and
             * `website` is reserved for the honeypot, which a field of that
             * name would silently disable.
             *
             * Optional on a heading and a step break: neither has an answer
             * to key, so the server names them (`section_1`, `step_1`).
             */
            'fields.*.name' => ['required_unless:fields.*.kind,heading,step', 'nullable', 'string', 'max:60', 'regex:/^[a-z][a-z0-9_]*$/', 'not_in:website'],
            // A step break's label is the next step's title, and "Step 2"
            // is a title — so it alone may be left blank.
            'fields.*.label' => ['required_unless:fields.*.kind,step', 'nullable', 'string', 'max:150'],
            'fields.*.placeholder' => ['nullable', 'string', 'max:150'],
            'fields.*.help' => ['nullable', 'string', 'max:250'],
            'fields.*.required' => ['sometimes', 'boolean'],
            'fields.*.width' => ['sometimes', 'in:half,full'],
            'fields.*.options' => ['nullable', 'array', 'max:50'],
            'fields.*.options.*.value' => ['required', 'string', 'max:150'],
            'fields.*.options.*.label' => ['required', 'string', 'max:150'],
            // Both are checked key by key in `checkFields()`, because what is
            // allowed depends on the field's kind and on the fields before it
            // — neither of which a wildcard rule can read.
            'fields.*.settings' => ['nullable', 'array'],
            'fields.*.show_if' => ['nullable', 'array'],
        ];
    }

    /**
     * The rules that read more than one row.
     *
     * A key used twice, a list with nothing to choose from, a fourth file
     * field, a setting of the wrong shape for its kind, and a condition that
     * could never be evaluated: one that reads a field that does not exist,
     * comes later, is the field itself, or has no answer to read. Each of
     * those saves happily without this and then fails in front of a visitor,
     * as a field that never appears or a form that cannot be sent.
     */
    public static function checkFields(Validator $validator, mixed $fields): void
    {
        if (! is_array($fields)) {
            return;
        }

        $kindOf = [];

        foreach ($fields as $field) {
            if (is_array($field) && is_string($field['name'] ?? null) && is_string($field['kind'] ?? null)) {
                $kindOf[$field['name']] ??= $field['kind'];
            }
        }

        /** @var array<string, string> $earlier value fields above the current row, name => kind */
        $earlier = [];
        $names = [];
        $files = 0;

        foreach ($fields as $i => $field) {
            $kind = is_array($field) ? ($field['kind'] ?? null) : null;

            if (! is_string($kind) || ! in_array($kind, FormField::KINDS, true)) {
                continue;
            }

            $name = is_string($field['name'] ?? null) && $field['name'] !== '' ? $field['name'] : null;

            if ($name !== null) {
                if (isset($names[$name])) {
                    $validator->errors()->add("fields.{$i}.name", "Two fields share the key “{$name}”. Each needs its own, or one answer overwrites the other.");
                }

                $names[$name] = true;
            }

            if (in_array($kind, FieldSpec::WITH_OPTIONS, true)) {
                $options = is_array($field['options'] ?? null) ? $field['options'] : [];
                $values = array_filter(array_map(fn ($o) => is_array($o) ? ($o['value'] ?? null) : null, $options), 'is_string');

                if ($kind === 'select' && count($options) < 1) {
                    $validator->errors()->add("fields.{$i}.options", 'A dropdown needs at least one option, or nothing can be chosen from it.');
                } elseif ($kind !== 'select' && count($options) < 2) {
                    $validator->errors()->add("fields.{$i}.options", 'Give this at least two options to choose between.');
                } elseif (count($values) !== count(array_unique($values))) {
                    $validator->errors()->add("fields.{$i}.options", 'Two options have the same value. Each option needs its own.');
                }
            }

            if ($kind === 'file' && ++$files > FieldSpec::MAX_FILE_FIELDS) {
                $validator->errors()->add("fields.{$i}.kind", 'A form can hold at most '.FieldSpec::MAX_FILE_FIELDS.' file fields.');
            }

            foreach (FieldSpec::problems($kind, $field['settings'] ?? null) as $key => $message) {
                $validator->errors()->add("fields.{$i}.settings.{$key}", $message);
            }

            self::checkCondition($validator, $i, $field['show_if'] ?? null, $name, $earlier, $kindOf);

            if ($name !== null && ! FieldSpec::isLayout($kind)) {
                $earlier[$name] = $kind;
            }
        }
    }

    /**
     * @param  array<string, string>  $earlier
     * @param  array<string, string>  $kindOf
     */
    private static function checkCondition(Validator $validator, int|string $i, mixed $condition, ?string $name, array $earlier, array $kindOf): void
    {
        // An empty object is the console saying "no condition", not a
        // malformed one.
        if (! is_array($condition) || (blank($condition['field'] ?? null) && blank($condition['op'] ?? null))) {
            return;
        }

        $source = $condition['field'] ?? null;
        $op = $condition['op'] ?? null;
        $at = "fields.{$i}.show_if";

        if (! is_string($source) || $source === '') {
            $validator->errors()->add("{$at}.field", 'Choose the field this condition reads.');
        } elseif ($source === $name) {
            $validator->errors()->add("{$at}.field", 'A field cannot be shown or hidden by its own answer.');
        } elseif (! isset($kindOf[$source])) {
            $validator->errors()->add("{$at}.field", "No field on this form has the key “{$source}”.");
        } elseif (in_array($kindOf[$source], FieldSpec::NOT_A_SOURCE, true)) {
            $validator->errors()->add("{$at}.field", 'A condition cannot read a file upload, a hidden value, a heading or a step break.');
        } elseif (! isset($earlier[$source])) {
            $validator->errors()->add("{$at}.field", 'A condition can only read a field that comes before this one.');
        }

        if (! is_string($op) || ! in_array($op, FieldSpec::OPS, true)) {
            $validator->errors()->add("{$at}.op", 'Choose how the answer is compared.');

            return;
        }

        if ($op === 'includes' && is_string($source) && isset($kindOf[$source]) && $kindOf[$source] !== 'checkboxes') {
            $validator->errors()->add("{$at}.op", '“Includes” reads a multiple-choice field. Use “is” for this one.');
        }

        if (in_array($op, FieldSpec::OPS_WITH_VALUE, true)) {
            $value = $condition['value'] ?? null;

            if (! is_scalar($value) || trim((string) $value) === '') {
                $validator->errors()->add("{$at}.value", 'Say what the answer is compared with.');
            } elseif (mb_strlen((string) $value) > FieldSpec::CONDITION_VALUE_MAX) {
                $validator->errors()->add("{$at}.value", 'A condition’s value can be at most '.FieldSpec::CONDITION_VALUE_MAX.' characters.');
            }
        }
    }

    public function messages(): array
    {
        return [
            'fields.*.name.regex' => 'A field key must start with a letter and use only lowercase letters, numbers and underscores.',
            'fields.*.name.not_in' => '"website" is reserved for the spam trap and cannot be used as a field key.',
            'fields.*.name.required_unless' => 'Give this field a key.',
            'fields.*.label.required_unless' => 'Give this field a label.',
            'redirect_url.regex' => 'Send people to a page on this site (/thank-you) or to a full http(s) address.',
        ];
    }
}
