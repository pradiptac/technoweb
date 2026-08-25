<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Staff editing a customer's contact details.
 *
 * `status` is deliberately not here. It moves through the approve / reject /
 * status endpoints, each of which does something besides writing the column —
 * sends an email, stamps who decided, revokes live tokens. A status settable
 * through this form would be a way to suspend an account while leaving its
 * session running.
 *
 * Nor is `password`. Staff resetting a customer's password by typing one is a
 * password two people know; the reset link exists for this.
 */
class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'email' => [
                'sometimes', 'required', 'email', 'max:255',
                // Unique is safe here, unlike on registration: the caller is
                // already an authenticated staff member who can see the whole
                // list anyway, so there is nothing left to leak.
                Rule::unique('customers', 'email')->ignore($this->route('customer')),
            ],
            'company' => ['sometimes', 'nullable', 'string', 'max:160'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:32'],
        ];
    }
}
