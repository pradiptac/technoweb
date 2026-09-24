<?php

namespace App\Http\Requests;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookUrl;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A new outgoing webhook.
 *
 * The URL is checked by `WebhookUrl`, not by `url` alone: `url` accepts
 * `http://127.0.0.1:8000/` happily, and that is the address this server
 * must never be pointed at. The refusal is a sentence for the form.
 *
 * `events` is validated against the enum's subscribable list, so `ping` —
 * sent from the console only — cannot be subscribed to, and a name that
 * stops existing is refused at the form rather than stored and silently
 * never matched.
 */
class StoreWebhookRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:120'],
            'url' => ['required', 'string', 'max:2048', function (string $attribute, mixed $value, \Closure $fail) {
                if (($reason = WebhookUrl::refusal((string) $value)) !== null) {
                    $fail($reason);
                }
            }],
            'events' => ['required', 'array', 'min:1'],
            'events.*' => ['string', Rule::in(WebhookEvent::subscribableValues())],
            'is_active' => ['boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'Give the webhook a name — it is how the list tells them apart.',
            'url.required' => 'Enter the URL to post to.',
            'events.required' => 'Tick at least one event, or the hook will never be sent anything.',
            'events.min' => 'Tick at least one event, or the hook will never be sent anything.',
            'events.*.in' => 'That is not an event this site sends.',
        ];
    }

    /** Duplicate ticks collapse to one, and the order is the enum's. */
    public function validatedEvents(): array
    {
        $chosen = array_unique((array) ($this->validated()['events'] ?? []));

        return array_values(array_filter(WebhookEvent::subscribableValues(), fn ($v) => in_array($v, $chosen, true)));
    }
}
