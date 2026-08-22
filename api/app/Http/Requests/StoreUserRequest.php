<?php

namespace App\Http\Requests;

use App\Enums\Role as RoleEnum;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            // Optional: leaving it blank has the API generate one and return
            // it once, which is better than an administrator inventing a
            // password they will then have to transmit.
            'password' => ['nullable', 'string', Password::min(12)],
            'is_active' => ['boolean'],
            'roles' => ['required', 'array', 'min:1'],
            'roles.*' => ['string', Rule::in(array_column(RoleEnum::cases(), 'value'))],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the staff member a name.',
            'email.required' => 'An email address is required — it is how they sign in.',
            'email.unique' => 'That email address already has an account.',
            'roles.required' => 'Give the account at least one role, or it can sign in and see nothing.',
            'roles.min' => 'Give the account at least one role, or it can sign in and see nothing.',
        ];
    }
}
