<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * A stranger's registration.
 *
 * Every field here arrives from the open internet, so the rules are tighter
 * than they are on the profile form: this is the only write in the product
 * that creates a row without an authenticated principal behind it.
 */
class RegisterCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],

            // Deliberately not `unique:customers`. A uniqueness rule answers
            // "does this address have an account?" to anybody who asks, which
            // is the enumeration hole the controller goes out of its way to
            // avoid. The duplicate is handled there, silently.
            //
            // `rfc` only, deliberately not `dns`. A DNS check puts an
            // uncontrolled network call on the request path, and this project
            // has already measured what that costs: an unreachable SMTP host
            // took a contact-form submission from 0.2s to 12.5s. It also buys
            // little — the confirmation email is a far stronger proof that an
            // address exists than an MX record is, and we already require it.
            'email' => ['required', 'email:rfc', 'max:255'],

            'password' => ['required', 'confirmed', Password::min(12)->uncompromised()],
            'company' => ['nullable', 'string', 'max:160'],
            // Required, not just collected: a support ticket needs a number to
            // call as often as it needs an address to email, and this is also
            // what a future SMS or WhatsApp sign-in code would be sent to —
            // no account should reach that day still missing one.
            'phone' => ['required', 'string', 'max:32'],

            // The honeypot. A real person never sees this field, so anything
            // in it came from something filling in every input it found.
            'website' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'password.confirmed' => 'The two passwords do not match.',
            'email.dns' => 'That address does not look like it can receive email.',
        ];
    }

    public function attributes(): array
    {
        return ['company' => 'company name'];
    }
}
