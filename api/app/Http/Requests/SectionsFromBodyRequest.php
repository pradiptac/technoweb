<?php

namespace App\Http\Requests;

use App\Http\Requests\Concerns\SanitisesRichText;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A page body to lay out as builder sections (`POST
 * /admin/pages/sections-from-body`, 0.109.0): cleaned exactly as a saved
 * body is, so the sections that come back are what a save would store.
 */
class SectionsFromBodyRequest extends FormRequest
{
    use SanitisesRichText;

    protected function richTextFields(): array
    {
        return ['body'];
    }

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return ['body' => ['required', 'string', 'max:2000000']];
    }

    public function messages(): array
    {
        return ['body.required' => 'This page has no content to lay out yet.'];
    }
}
