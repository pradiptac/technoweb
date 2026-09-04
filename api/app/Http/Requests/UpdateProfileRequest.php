<?php

namespace App\Http\Requests;

use App\Support\Address;
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

            /*
             * What the next checkout should open filled in.
             *
             * Nothing here is ever *required*: a customer who only raises
             * tickets has no reason to hold an address, and a profile screen
             * that refuses to save a changed telephone number until an address
             * is typed is a screen arguing with whoever opened it. The
             * checkout is where an address becomes compulsory, because that is
             * where something has to be delivered.
             *
             * The shape is `App\Support\Address`, shared with the checkout, so
             * the two screens cannot disagree about what an address is.
             */
            ...Address::rules('billing_address'),
            ...Address::rules('shipping_address'),

            /*
             * Whether there is a second address at all — read from the tick
             * box, never by comparing the two blocks. Two addresses that match
             * today are still two answers, and the account stores the answer.
             */
            'shipping_same' => ['sometimes', 'boolean'],

            'gstin' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/'],
        ];
    }

    public function messages(): array
    {
        return [
            'password.min' => 'Choose a password of at least 12 characters.',
            'gstin.regex' => 'That does not look like a GSTIN. They are 15 characters, like 27AAPFU0939F1ZV.',
        ];
    }
}
