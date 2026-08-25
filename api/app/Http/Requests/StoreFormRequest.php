<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Models\FormField;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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

            'fields' => ['sometimes', 'array', 'max:30'],
            'fields.*.kind' => ['required', Rule::in(FormField::KINDS)],
            /*
             * The field key. Slug characters only, because it becomes an array
             * key, a validation rule name and a line in an email — and
             * `website` is reserved for the honeypot, which a field of that
             * name would silently disable.
             */
            'fields.*.name' => ['required', 'string', 'max:60', 'regex:/^[a-z][a-z0-9_]*$/', 'not_in:website'],
            'fields.*.label' => ['required', 'string', 'max:150'],
            'fields.*.placeholder' => ['nullable', 'string', 'max:150'],
            'fields.*.help' => ['nullable', 'string', 'max:250'],
            'fields.*.required' => ['sometimes', 'boolean'],
            'fields.*.width' => ['sometimes', 'in:half,full'],
            'fields.*.options' => ['nullable', 'array', 'max:50'],
            'fields.*.options.*.value' => ['required', 'string', 'max:150'],
            'fields.*.options.*.label' => ['required', 'string', 'max:150'],
        ];
    }

    public function messages(): array
    {
        return [
            'fields.*.name.regex' => 'A field key must start with a letter and use only lowercase letters, numbers and underscores.',
            'fields.*.name.not_in' => '"website" is reserved for the spam trap and cannot be used as a field key.',
        ];
    }
}
