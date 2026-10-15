<?php

namespace App\Http\Requests;

use App\Support\Events\EventSettings;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Somebody registering for an event.
 *
 * `email:dns` is absent for the reason every public form here gives: a DNS
 * lookup on the request path is what took a contact form from 0.2s to 12.5s,
 * and the confirmation email is a far stronger proof an address exists.
 *
 * `phone` is optional and only loosely a phone number — digits, spaces and
 * the punctuation people write one with. It is not held to the checkout's
 * Indian-mobile shape: a seminar is attended by people with landlines and
 * by visitors from abroad, and nothing here rings or messages the number.
 *
 * **`website` is the honeypot and carries no rule on purpose.** A filled one
 * is answered with the ordinary success by the controller and stored
 * nowhere; a `prohibited` rule would tell a bot exactly which field gave it
 * away.
 *
 * How many seats *this* event allows is the event's own `max_seats`, which
 * the controller checks once it has the event; the ceiling here is only the
 * one no event may exceed.
 */
class RegisterForEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return self::fields();
    }

    /**
     * The fields a registration is made of — shared with the console's
     * "add one" form, which takes the same person through a different door.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function fields(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+()\-.\s]{6,30}$/'],
            'company' => ['nullable', 'string', 'max:160'],
            'seats' => ['nullable', 'integer', 'min:1', 'max:'.EventSettings::SEATS_CEILING],
            // Plain text, stored as typed and rendered escaped. Nothing here is markup.
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return self::wording();
    }

    /** @return array<string, string> */
    public static function wording(): array
    {
        return [
            'name.required' => 'Tell us who is coming.',
            'email.required' => 'We need an email address to send your confirmation to.',
            'email.email' => 'That does not look like an email address.',
            'phone.regex' => 'That does not look like a phone number.',
            'seats.min' => 'A registration is for at least one seat.',
            'seats.max' => 'One registration can hold up to '.EventSettings::SEATS_CEILING.' seats.',
        ];
    }

    protected function prepareForValidation(): void
    {
        if (is_string($this->input('phone'))) {
            $this->merge(['phone' => preg_replace('/\s+/', ' ', trim($this->input('phone')))]);
        }

        if (is_string($this->input('email'))) {
            $this->merge(['email' => trim($this->input('email'))]);
        }
    }
}
