<?php

namespace App\Http\Requests\Store;

use App\Enums\PaymentMethod;
use App\Support\Address;
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
            /*
             * A mobile number, checked for shape.
             *
             * The key stays `phone`. It is what the column, the order resource,
             * the console, the mock and the customer's own account all call it,
             * and renaming a wire key to match a label is a migration across
             * five files that buys a visitor nothing — the *screen* says
             * Mobile, which is the part anybody reads.
             *
             * Indian mobiles only, and deliberately: this shop prices in
             * rupees, extracts GST, asks for a PIN code and offers cash on
             * delivery, so a number nobody here can ring is not a number worth
             * storing. Ten digits opening 6–9, with an optional +91, 91 or 0 in
             * front, and separators anywhere — people type `98765 43210` and
             * `+91-98765-43210` in equal measure and neither is a mistake.
             *
             * Shape only, never a lookup: an uncontrolled network call on the
             * request path is what took a contact-form submission from 0.2s to
             * 12.5s here, which is the same reason `email:dns` is absent above.
             */
            'phone' => [
                'required', 'string', 'max:32',
                'regex:/^(?:\+?91[-\s]?)?0?[6-9](?:[-\s]?\d){9}$/',
            ],

            /*
             * Anything the buyer wants the desk to know — a delivery window, a
             * gate code, a purchase-order number. Optional, and it has to stay
             * optional: a required box here is a question asked of every order
             * for the sake of the few that have an answer.
             */
            'customer_note' => ['nullable', 'string', 'max:1000'],

            /*
             * The address is required whenever anything is shipped, and that is
             * decided by the *basket* rather than by the form — so it is
             * checked in the controller, which has read the basket, rather than
             * here, which has not. A digital-only order has no delivery address
             * and asking for one is a form arguing with itself.
             */
            ...Address::rules('address'),

            /*
             * A separate delivery address, and the flag that says whether to
             * read it.
             *
             * Default *same*: most orders go where they are billed, and a
             * second address block open by default is a form asking a question
             * nobody had. Unticking it is what makes these fields matter — the
             * controller ignores them entirely while `shipping_same` holds.
             *
             * Nullable throughout for the same reason the billing block is:
             * whether an address is needed at all is decided by the basket,
             * which this class has not read.
             */
            'shipping_same' => ['sometimes', 'boolean'],
            ...Address::rules('shipping_address'),

            /*
             * Validated as one of the enum's values here, and checked again in
             * `Checkout::place()` against what is actually switched on. This
             * rule only says the string is a payment method; whether it is one
             * this shop offers today is a question with an answer that changes.
             */
            'payment_method' => ['sometimes', 'nullable', Rule::enum(PaymentMethod::class)],

            // The messaging opt-in boxes under the mobile field: which of the
            // phone channels may carry updates to the number typed above.
            'message_opt_in' => ['sometimes', 'array', 'max:2'],
            'message_opt_in.*' => ['string', Rule::in(['whatsapp', 'rcs'])],

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
            'phone.required' => 'A mobile number, in case there is a problem with the delivery.',
            'phone.regex' => 'That does not look like a mobile number. Ten digits starting 6 to 9, with or without +91.',
            'gstin.regex' => 'That does not look like a GSTIN. It is 15 characters, like 27AAPFU0939F1ZV.',
            'gstin.required_if' => 'Enter the GSTIN, or untick the GST option.',
            'company_name.required_if' => 'Enter the business name for the invoice.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('phone')) {
            // Collapsed, never reformatted. Runs of spaces come from pasting a
            // number out of a contacts app and mean nothing; rewriting the
            // number itself would store something the buyer did not type.
            $this->merge(['phone' => preg_replace('/\s+/', ' ', trim((string) $this->input('phone')))]);
        }

        if ($this->filled('gstin')) {
            // Typed in lower case as often as not, and the format is upper.
            $this->merge(['gstin' => strtoupper(trim((string) $this->input('gstin')))]);
        }
    }
}
