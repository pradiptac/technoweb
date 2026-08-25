<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return array_merge(StoreFormRequest::formRules(), [
            'name' => ['sometimes', 'string', 'max:150'],
            'slug' => [
                'sometimes', 'string', 'max:150', 'alpha_dash',
                Rule::unique('forms', 'slug')->ignore($this->route('form')),
            ],
        ]);
    }

    public function messages(): array
    {
        return (new StoreFormRequest)->messages();
    }
}
