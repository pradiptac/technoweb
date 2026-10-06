<?php

namespace App\Support;

use App\Models\Form;
use App\Models\FormField;
use App\Support\Forms\FieldSpec;
use App\Support\Forms\FormUploads;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Illuminate\Validation\Validator as ValidatorInstance;

/**
 * Turns a stored form definition into validation rules.
 *
 * The whole point is that the *definition* is the contract, not the payload.
 * A submitted body is a bag of strings from a browser that may never have
 * rendered the form: it can carry keys no field declares, omit required ones,
 * and claim a select value that was never an option. Every one of those is
 * decided here against the rows in the database.
 *
 * Two consequences worth being explicit about:
 *
 * Unknown keys are dropped rather than rejected. A stale tab submitting a
 * field that has since been deleted should not get a 422 it cannot act on —
 * but that value must not be stored either, or the submissions table becomes
 * whatever anyone chose to POST.
 *
 * A select is validated against `optionValues()`, so the options are a
 * whitelist and not a suggestion. Without that, "Category" accepts any string
 * and the notification email prints it.
 *
 * ### Conditions are decided here too (0.117.0)
 *
 * A field may carry `show_if`, and the browser hides it when the condition
 * fails. That is presentation. The decision that matters is this one: the
 * same condition is evaluated against the submitted answers, and a field it
 * hides is **skipped** — not required, and its value dropped even when one was
 * posted. Otherwise a "required" field nobody was shown refuses every
 * submission, and a value typed into a field that was then hidden again
 * (or posted by something that never rendered the form) is stored and emailed
 * as an answer to a question that was never asked.
 *
 * A chain follows: a field whose source is itself hidden is hidden, whatever
 * its own operator says, because the answer it would read was dropped.
 *
 * ### Three kinds are not read from the payload
 *
 * A `heading` and a `step` lay the form out and collect nothing. A `hidden`
 * field's answer is `settings.value` from the definition **whatever is
 * posted** — it is in the page for nobody to see, which makes it the easiest
 * field on the form to rewrite, and the reason it exists (a campaign code, a
 * routing word) is that the editor chose it.
 */
class FormValidator
{
    /** Words a browser or a hand-written form sends for a ticked and an unticked box. */
    private const TICKED = ['1', 'true', 'on', 'yes'];

    private const UNTICKED = ['0', 'false', 'off', 'no', ''];

    public static function make(Form $form, array $payload): ValidatorInstance
    {
        return self::build(self::shown($form, $payload), $payload);
    }

    /**
     * Validate, and hand back what to store.
     *
     * `data` is the answers — a file's answer being the name it arrived
     * under; `uploads` is the files themselves, still where PHP put them.
     * Storing them is the caller's, after this returns: nothing is written to
     * disk for a submission that was refused.
     *
     * (`data` is built in the form's order and does not stay in it: the
     * column is MySQL JSON, which keeps an object's keys by length and then
     * alphabetically. Anything that prints a submission walks the form's
     * fields, never the stored keys.)
     *
     * @return array{data: array<string, mixed>, uploads: array<string, UploadedFile>}
     *
     * @throws ValidationException
     */
    public static function validate(Form $form, array $payload): array
    {
        $fields = self::shown($form, $payload);
        $valid = self::build($fields, $payload)->validate();

        $data = [];
        $uploads = [];

        foreach ($fields as $field) {
            if ($field->kind === 'hidden') {
                // From the definition, never from `$payload`.
                $value = (string) ($field->settings['value'] ?? '');

                if ($value !== '') {
                    $data[$field->name] = $value;
                }

                continue;
            }

            if (! array_key_exists($field->name, $valid)) {
                continue;
            }

            $value = $valid[$field->name];

            if ($field->isFile()) {
                if ($value instanceof UploadedFile) {
                    $uploads[$field->name] = $value;
                    // The answer, as far as an email or an export can show
                    // one: what the visitor called the file.
                    $data[$field->name] = FormUploads::displayName($value);
                }

                continue;
            }

            $data[$field->name] = self::stored($field, $value);
        }

        return ['data' => $data, 'uploads' => $uploads];
    }

    /**
     * The fields this submission was actually asked, in order.
     *
     * Layout rows are never among them; a field whose condition fails — or
     * whose condition reads a field that is itself hidden — is not either.
     *
     * @return list<FormField>
     */
    public static function shown(Form $form, array $payload): array
    {
        /** @var array<string, FormField> $asked every value field so far, by name */
        $asked = [];
        /** @var array<string, bool> $visible */
        $visible = [];
        $shown = [];

        foreach ($form->fields as $field) {
            if ($field->isLayout()) {
                continue;
            }

            $visible[$field->name] = self::passes($field->show_if, $asked, $visible, $payload);
            $asked[$field->name] = $field;

            if ($visible[$field->name]) {
                $shown[] = $field;
            }
        }

        return $shown;
    }

    /**
     * @param  array<string, FormField>  $asked
     * @param  array<string, bool>  $visible
     */
    private static function passes(?array $condition, array $asked, array $visible, array $payload): bool
    {
        if (! $condition || blank($condition['field'] ?? null)) {
            return true;
        }

        $source = $asked[$condition['field']] ?? null;

        // A condition that points at nothing is refused on save, so this is a
        // row written some other way. Showing the field is the safe reading:
        // hiding it would drop an answer on the strength of a rule nobody can
        // see.
        if ($source === null) {
            return true;
        }

        if (! $visible[$source->name]) {
            return false;
        }

        $answer = self::answer($source, $payload[$source->name] ?? null);
        $filled = is_bool($answer) ? $answer : ($answer !== '' && $answer !== []);
        $value = (string) ($condition['value'] ?? '');

        return match ($condition['op'] ?? null) {
            'filled' => $filled,
            'empty' => ! $filled,
            'equals', 'includes' => self::matches($answer, $value),
            'not_equals' => ! self::matches($answer, $value),
            default => true,
        };
    }

    /** A source field's posted answer in the one shape a condition compares. */
    private static function answer(FormField $source, mixed $raw): bool|string|array
    {
        if ($source->kind === 'checkbox') {
            // `(string) true` is "1" and `(string) false` is "", so a JSON
            // boolean and a multipart word take the same path.
            return is_scalar($raw) && in_array(strtolower(trim((string) $raw)), self::TICKED, true);
        }

        if ($source->kind === 'checkboxes') {
            return array_values(array_map('strval', array_filter(is_array($raw) ? $raw : [$raw], fn ($v) => is_scalar($v) && (string) $v !== '')));
        }

        return is_scalar($raw) && ! is_bool($raw) ? trim((string) $raw) : '';
    }

    /**
     * Does this answer equal — or, for a list, include — the value?
     *
     * Exact, case and all: an option's value is a key an editor wrote, not
     * prose. Two numbers are compared as numbers, so a rating posted as `4`
     * and as `"4"` and a number written `4.0` are one answer. A tick box
     * matches the words for ticked and unticked rather than one spelling.
     */
    private static function matches(bool|string|array $answer, string $value): bool
    {
        if (is_array($answer)) {
            return in_array($value, $answer, true);
        }

        if (is_bool($answer)) {
            $word = strtolower($value);

            return $answer ? in_array($word, self::TICKED, true) : in_array($word, self::UNTICKED, true);
        }

        if (is_numeric($answer) && is_numeric($value)) {
            return (float) $answer === (float) $value;
        }

        return $answer === $value;
    }

    /** @param  list<FormField>  $fields */
    private static function build(array $fields, array $payload): ValidatorInstance
    {
        $rules = [];
        $labels = [];
        $input = [];

        foreach ($fields as $field) {
            // Nothing a browser sends for a hidden field is read at all.
            if ($field->kind === 'hidden') {
                continue;
            }

            foreach (self::rulesFor($field) as $key => $set) {
                $rules[$key] = $set;
                $labels[$key] = $field->label;
            }

            if (array_key_exists($field->name, $payload)) {
                $input[$field->name] = self::incoming($field, $payload[$field->name]);
            }
        }

        return Validator::make($input, $rules, [
            'accepted' => 'Tick :attribute to continue.',
            'extensions' => ':attribute must be one of these: :values.',
            'mimes' => ':attribute is not a file of an accepted kind (:values).',
            'uploaded' => ':attribute did not upload. It may be larger than this server accepts.',
        ], $labels);
    }

    /**
     * A posted value in the shape its rules read.
     *
     * A form posted as `multipart/form-data` — which a form with a file field
     * must be — sends a ticked box as `on` and a single ticked option of a
     * group as one string; JSON sends `true` and a list. Both are the same
     * answer.
     */
    private static function incoming(FormField $field, mixed $value): mixed
    {
        if ($field->kind === 'checkbox' && is_string($value)) {
            $word = strtolower(trim($value));

            return match (true) {
                in_array($word, self::TICKED, true) => true,
                in_array($word, self::UNTICKED, true) => false,
                default => $value,
            };
        }

        if ($field->kind === 'checkboxes') {
            if (is_array($value)) {
                return array_values(array_map(
                    fn ($v) => is_scalar($v) && ! is_bool($v) ? (string) $v : $v,
                    array_filter($value, fn ($v) => $v !== null && $v !== ''),
                ));
            }

            return is_scalar($value) && (string) $value !== '' ? [(string) $value] : null;
        }

        return $value;
    }

    /** What is written to the submission for a validated answer. */
    private static function stored(FormField $field, mixed $value): mixed
    {
        if ($value === null) {
            return null;
        }

        return match ($field->kind) {
            'checkbox' => (bool) $value,
            'rating' => (int) $value,
            'number' => is_numeric($value) ? $value + 0 : $value,
            'checkboxes' => array_values(array_unique(array_map('strval', (array) $value))),
            default => $value,
        };
    }

    /** Every ticked choice is one of the field's options, and none is ticked twice. */
    private static function choices(FormField $field): \Closure
    {
        $allowed = $field->optionValues();

        return function (string $attribute, mixed $value, \Closure $fail) use ($allowed): void {
            $chosen = is_array($value) ? $value : [];

            foreach ($chosen as $choice) {
                if (! is_string($choice) || ! in_array($choice, $allowed, true)) {
                    $fail('One of the choices for :attribute is not an option on this form.');

                    return;
                }
            }

            if (count($chosen) !== count(array_unique($chosen))) {
                $fail('A choice for :attribute was sent twice.');
            }
        };
    }

    /** @return array<string, array<int, mixed>> rules keyed by the input they apply to */
    private static function rulesFor(FormField $field): array
    {
        $name = $field->name;
        $presence = $field->required ? 'required' : 'nullable';
        // A select with no options would otherwise accept anything, which is
        // the opposite of what a select is for.
        $options = fn () => Rule::in($field->optionValues() ?: ['__none__']);

        return match ($field->kind) {
            'email' => [$name => [$presence, 'string', 'email:rfc', 'max:255']],
            'number' => [$name => array_values(array_filter([
                $presence, 'numeric',
                is_numeric($field->settings['min'] ?? null) ? 'min:'.$field->settings['min'] : null,
                'max:'.(is_numeric($field->settings['max'] ?? null) ? $field->settings['max'] : '999999999999'),
            ]))],
            // A tick box that must be ticked is `accepted`: `required` alone
            // is satisfied by `false`, which is a consent nobody gave.
            'checkbox' => [$name => $field->required ? ['required', 'accepted'] : ['nullable', 'boolean']],
            // A textarea holds the long answer, so it gets the long cap; every
            // other kind is a single line and 255 is generous for one.
            'textarea' => [$name => [$presence, 'string', 'max:5000']],
            'select', 'radio' => [$name => [$presence, 'string', 'max:255', $options()]],
            /*
             * `required` on an array means at least one. The choices are
             * checked by a closure on the field itself rather than by a
             * `name.*` rule, so a bad one is reported under `name` — the key
             * the page shows errors by — and not under `name.1`, which no
             * control on the page is called.
             */
            'checkboxes' => [$name => [$presence, 'array', 'max:50', self::choices($field)]],
            'rating' => [$name => [$presence, 'integer', 'between:1,5']],
            'url' => [$name => [$presence, 'string', 'url:http,https', 'max:2048']],
            'date' => [$name => array_values(array_filter([
                $presence, 'string', 'date_format:Y-m-d',
                ($min = FieldSpec::resolveDate($field->settings['min'] ?? null)) ? 'after_or_equal:'.$min : null,
                ($max = FieldSpec::resolveDate($field->settings['max'] ?? null)) ? 'before_or_equal:'.$max : null,
            ]))],
            /*
             * The extension *and* the content, the careers form's rule:
             * `mimes:` reads the type the bytes sniff as, so a script renamed
             * `brief.pdf` is refused for being a script, and `extensions:`
             * reads the name, so a real PDF arriving as `brief.php` is
             * refused for being called one.
             */
            'file' => [$name => [
                $presence, 'file',
                'extensions:'.implode(',', FieldSpec::extensions($field)),
                'mimes:'.implode(',', FieldSpec::extensions($field)),
                'max:'.FieldSpec::maxKb($field),
            ]],
            // Deliberately permissive: people write numbers with spaces,
            // brackets, hyphens and a country code, and refusing those loses
            // real enquiries to protect against nothing.
            'tel' => [$name => [$presence, 'string', 'max:255', 'regex:/^[0-9+()\-.\s]{6,}$/']],
            default => [$name => [$presence, 'string', 'max:255']],
        };
    }
}
