<?php

namespace App\Http\Requests;

use App\Http\Requests\Store\CheckoutRequest;
use App\Models\MeetingType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Somebody booking an online meeting from the public page or the portal
 * (docs/meetings.md).
 *
 * `type` is the slug of an active, public type. `start` is checked by
 * `MeetingActions` — it must carry its offset and equal a slot the engine
 * offers, exactly. The mobile is held to the checkout's shape
 * (`CheckoutRequest::MOBILE_PATTERN`, one constant), the reminder and the
 * messaging opt-in under it can only reach an Indian mobile. `email:dns` is
 * absent for the reason every public form here gives.
 */
class StoreMeetingRequest extends FormRequest
{
    /** The longest agenda accepted, in characters — sent as `agenda_max`. */
    public const AGENDA_MAX = 2000;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'type' => ['required', 'string', Rule::exists(MeetingType::class, 'slug')->where('is_active', true)->where('is_public', true)],
            'start' => ['required', 'string', 'max:40'],
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['required', 'string', 'max:32', 'regex:'.CheckoutRequest::MOBILE_PATTERN],
            'company' => ['nullable', 'string', 'max:160'],
            // Plain text, stored as typed and rendered escaped. Never put
            // into the Google event: Google mails that to whatever address
            // was typed here.
            'agenda' => ['nullable', 'string', 'max:'.self::AGENDA_MAX],

            'message_opt_in' => ['sometimes', 'array', 'max:2'],
            'message_opt_in.*' => ['string', Rule::in(['whatsapp', 'rcs'])],

            'website' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'type.exists' => 'Choose one of the kinds of meeting listed.',
            'start.required' => 'Choose a time.',
            'phone.regex' => 'That does not look like a mobile number. Ten digits starting 6 to 9, with or without +91.',
            'website.prohibited' => 'This submission was rejected.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->filled('phone')) {
            $this->merge(['phone' => preg_replace('/\s+/', ' ', trim((string) $this->input('phone')))]);
        }
    }
}
