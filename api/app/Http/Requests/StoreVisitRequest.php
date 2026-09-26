<?php

namespace App\Http\Requests;

use App\Enums\PublishStatus;
use App\Http\Requests\Store\CheckoutRequest;
use App\Models\Location;
use App\Models\Service;
use App\Models\Solution;
use App\Support\Address;
use App\Support\Visits\PreferredTimes;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Somebody asking for an engineer to come to their site.
 *
 * The mobile is held to the checkout's shape — `CheckoutRequest::MOBILE_PATTERN`,
 * one constant — because an engineer has to be able to ring it from the
 * road, and the messaging opt-in under it can only reach an Indian mobile.
 *
 * `email:dns` is absent for the reason every public form here gives: a DNS
 * lookup on the request path is what took a contact form from 0.2s to 12.5s.
 *
 * The site address is required where an engineer needs it — the street, the
 * town, the state and the PIN — through `App\Support\Address`, so it has the
 * checkout's shape and the checkout's normaliser.
 */
class StoreVisitRequest extends FormRequest
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
            'phone' => ['required', 'string', 'max:32', 'regex:'.CheckoutRequest::MOBILE_PATTERN],
            'company' => ['nullable', 'string', 'max:160'],

            ...Address::rules('site_address'),
            'site_address' => ['required', 'array'],
            'site_address.line1' => ['required', 'string', 'max:180'],
            'site_address.city' => ['required', 'string', 'max:120'],
            'site_address.state' => ['required', 'string', 'max:120'],
            'site_address.pin' => ['required', 'string', 'regex:/^\d{6}$/'],

            // Published only: a draft service is not something to send an
            // engineer about, and an id is a number anybody can type.
            'service_id' => ['nullable', 'integer', Rule::exists(Service::class, 'id')->where('status', PublishStatus::Published->value)],
            'solution_id' => ['nullable', 'integer', Rule::exists(Solution::class, 'id')->where('status', PublishStatus::Published->value)],
            'location_id' => ['nullable', 'integer', Rule::exists(Location::class, 'id')->where('is_active', true)],

            // Plain text, stored as typed and rendered escaped — the rule a
            // blog comment follows. Nothing here is markup.
            'notes' => ['nullable', 'string', 'max:2000'],

            ...PreferredTimes::rules(),

            // The checkout's opt-in boxes, the same two phone channels.
            'message_opt_in' => ['sometimes', 'array', 'max:2'],
            'message_opt_in.*' => ['string', Rule::in(['whatsapp', 'rcs'])],

            'website' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            ...PreferredTimes::messages(),
            'phone.regex' => 'That does not look like a mobile number. Ten digits starting 6 to 9, with or without +91.',
            'site_address.line1.required' => 'Where should the engineer go?',
            'site_address.pin.required' => 'The six-digit PIN code of the site.',
            'site_address.pin.regex' => 'A PIN code is six digits.',
            'service_id.exists' => 'Choose one of the services listed.',
            'location_id.exists' => 'Choose one of the places listed.',
            'website.prohibited' => 'This submission was rejected.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn (Validator $v) => PreferredTimes::check($v));
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('phone')) {
            $this->merge(['phone' => preg_replace('/\s+/', ' ', trim((string) $this->input('phone')))]);
        }

        $pin = $this->input('site_address.pin');

        if (is_string($pin)) {
            $this->merge(['site_address' => [...(array) $this->input('site_address'), 'pin' => preg_replace('/\s+/', '', $pin)]]);
        }
    }
}
