<?php

namespace App\Http\Requests\Store;

use App\Enums\PaymentMethod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * What a buyer tells us, and nothing they tell us about money.
 *
 * There is no price, no total, no quantity and no product id in here. The
 * basket is read from the database and re-priced; this is a name, a way of
 * reaching somebody and where to send the parcel.
 *
 * `email:dns` is deliberately absent, the rule every public form here follows:
 * it is a DNS lookup on the request path, and this project has measured what an
 * uncontrolled network call there costs — a contact-form submission went from
 * 0.2s to 12.5s against an unreachable host. The confirmation email is a far
 * stronger proof that an address exists than an MX record.
 */
class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['required', 'string', 'max:32'],

            /*
             * The address is required whenever anything is shipped, and that is
             * decided by the *basket* rather than by the form — so it is
             * checked in the controller, which has read the basket, rather than
             * here, which has not. A digital-only order has no delivery address
             * and asking for one is a form arguing with itself.
             */
            'address.line1' => ['nullable', 'string', 'max:180'],
            'address.line2' => ['nullable', 'string', 'max:180'],
            'address.city' => ['nullable', 'string', 'max:120'],
            'address.state' => ['nullable', 'string', 'max:120'],
            'address.pin' => ['nullable', 'string', 'max:12'],
            'address.country' => ['nullable', 'string', 'max:60'],

            /*
             * Validated as one of the enum's values here, and checked again in
             * `Checkout::place()` against what is actually switched on. This
             * rule only says the string is a payment method; whether it is one
             * this shop offers today is a question with an answer that changes.
             */
            'payment_method' => ['sometimes', 'nullable', Rule::enum(PaymentMethod::class)],

            'gst_required' => ['sometimes', 'boolean'],

            /*
             * A GSTIN is checked for **shape** and never against a government
             * API — the brief rules that out, and a lookup on the request path
             * is the cost this project has already measured once. Fifteen
             * characters: two state digits, a ten-character PAN, an entity
             * digit, a Z, and a checksum character.
             */
            'gstin' => ['nullable', 'required_if:gst_required,true', 'string', 'regex:/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/'],
            'company_name' => ['nullable', 'required_if:gst_required,true', 'string', 'max:180'],

            // The honeypot, the same field name every public form here uses.
            'website' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => 'We need a name for the order.',
            'email.required' => 'We need an email address to send the confirmation to.',
            'phone.required' => 'A phone number, in case there is a problem with the delivery.',
            'gstin.regex' => 'That does not look like a GSTIN. It is 15 characters, like 27AAPFU0939F1ZV.',
            'gstin.required_if' => 'Enter the GSTIN, or untick the GST option.',
            'company_name.required_if' => 'Enter the business name for the invoice.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('gstin')) {
            // Typed in lower case as often as not, and the format is upper.
            $this->merge(['gstin' => strtoupper(trim((string) $this->input('gstin')))]);
        }
    }
}
