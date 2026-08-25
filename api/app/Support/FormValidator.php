<?php

namespace App\Support;

use App\Models\Form;
use App\Models\FormField;
use Illuminate\Support\Facades\Validator;
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
 */
class FormValidator
{
    public static function make(Form $form, array $payload): ValidatorInstance
    {
        $rules = [];
        $labels = [];

        foreach ($form->fields as $field) {
            $rules[$field->name] = self::rulesFor($field);
            $labels[$field->name] = $field->label;
        }

        return Validator::make(self::onlyKnown($form, $payload), $rules, [], $labels);
    }

    /** The payload reduced to keys the form actually declares. */
    public static function onlyKnown(Form $form, array $payload): array
    {
        $names = $form->fields->pluck('name')->all();

        return array_intersect_key($payload, array_flip($names));
    }

    /** @return array<int,string> */
    private static function rulesFor(FormField $field): array
    {
        $rules = [$field->required ? 'required' : 'nullable'];

        $rules[] = match ($field->kind) {
            'email' => 'email:rfc',
            'number' => 'numeric',
            'checkbox' => 'boolean',
            // A textarea holds the long answer, so it gets the long cap; every
            // other kind is a single line and 255 is generous for one.
            'textarea' => 'string',
            default => 'string',
        };

        $rules[] = match ($field->kind) {
            'textarea' => 'max:5000',
            'checkbox', 'number' => 'max:100000',
            default => 'max:255',
        };

        if ($field->kind === 'select') {
            $options = $field->optionValues();
            // A select with no options would otherwise accept anything, which
            // is the opposite of what a select is for.
            $rules[] = 'in:'.implode(',', $options ?: ['__none__']);
        }

        if ($field->kind === 'tel') {
            // Deliberately permissive: people write numbers with spaces,
            // brackets, hyphens and a country code, and refusing those loses
            // real enquiries to protect against nothing.
            $rules[] = 'regex:/^[0-9+()\-.\s]{6,}$/';
        }

        return $rules;
    }
}
