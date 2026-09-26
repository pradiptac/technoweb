<?php

namespace App\Http\Requests;

use App\Models\ContentType;
use App\Support\ReservedSlugs;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * A custom content type. One class for create and update, the
 * `ContentBlockRequest` shape: the rules differ only in what is required.
 *
 * The slug is the URL prefix every entry lives under, so it is held to three
 * things beyond its shape: not a route the site already owns
 * (`ReservedSlugs`), not a CMS page's slug — the two share the one top-level
 * segment and the page would win — and unique among types.
 */
class ContentTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('slug') && is_string($this->input('slug'))) {
            $this->merge(['slug' => strtolower(trim((string) $this->input('slug')))]);
        }
    }

    public function rules(): array
    {
        $type = $this->route('content_type');
        $creating = ! $type instanceof ContentType;
        $required = $creating ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:100'],
            'plural' => [$required, 'string', 'max:100'],
            'slug' => [$required, 'string', 'max:60', 'regex:/^[a-z][a-z0-9-]*$/',
                Rule::unique('content_types', 'slug')->ignore($type instanceof ContentType ? $type->id : null),
                Rule::notIn(ReservedSlugs::all()),
                Rule::unique('pages', 'slug')],
            // An `iconMap` key; checked for shape only — the map lives in the
            // frontend, which draws nothing for a key it does not know.
            'icon' => ['sometimes', 'nullable', 'string', 'max:60', 'regex:/^[a-z0-9-]+$/'],
            'description' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'has_body' => ['sometimes', 'boolean'],
            'has_image' => ['sometimes', 'boolean'],
            'archive_enabled' => ['sometimes', 'boolean'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:60'],
            'sort' => ['sometimes', Rule::in(ContentType::SORTS)],
            'schema_type' => ['sometimes', Rule::in(ContentType::SCHEMA_TYPES)],
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000'],
            'is_active' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        // A slug is the address of every entry; changing it writes a redirect
        // per entry. Allowed — the model does it — but never to blank.
        $validator->after(function (Validator $v) {
            if ($this->has('slug') && blank($this->input('slug'))) {
                $v->errors()->add('slug', 'A content type needs an address.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'The address must start with a letter and use only lowercase letters, numbers and hyphens.',
            'slug.not_in' => 'That address belongs to a part of the site that already exists. Choose another.',
            'slug.unique' => 'Another content type or a page already uses that address.',
        ];
    }
}
