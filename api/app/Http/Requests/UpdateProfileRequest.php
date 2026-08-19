<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:120'],
            'company' => ['sometimes', 'nullable', 'string', 'max:160'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
            'email' => [
                'sometimes', 'string', 'email', 'max:255',
                Rule::unique('customers', 'email')->ignore($this->user()->id),
            ],
            'current_password' => ['required_with:password', 'current_password:sanctum'],
            'password' => ['sometimes', 'string', 'min:12', 'confirmed'],
        ];
    }

    public function messages(): array
    {
        return ['password.min' => 'Choose a password of at least 12 characters.'];
    }
}
