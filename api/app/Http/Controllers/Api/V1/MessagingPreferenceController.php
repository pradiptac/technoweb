<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\MessageChannel;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\MessageContact;
use App\Support\Messaging\Contacts;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * A customer's own messaging choices, on the portal profile.
 *
 * WhatsApp and RCS reach **the number on the account**, so switching one on
 * needs a mobile number there; switching it off opts out every number the
 * account holds on that channel. Push is per browser and is switched on by
 * the bell, so here it can only be switched off — every browser at once.
 */
class MessagingPreferenceController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->state($this->customer($request))]);
    }

    public function update(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        $data = $request->validate([
            'whatsapp' => ['sometimes', 'boolean'],
            'rcs' => ['sometimes', 'boolean'],
            'push' => ['sometimes', 'boolean'],
        ]);

        foreach ([MessageChannel::WhatsApp, MessageChannel::Rcs] as $channel) {
            if (! array_key_exists($channel->value, $data)) {
                continue;
            }

            if ($data[$channel->value]) {
                // Consent is the customer's to give. A staff member viewing
                // as them may switch a channel off, never on.
                if ($customer->isImpersonated()) {
                    throw ValidationException::withMessages([$channel->value => 'Only the customer can opt in to messages — not a staff member viewing as them.']);
                }

                if (! $channel->ready()) {
                    continue;
                }

                if (Phone::e164($customer->phone) === null) {
                    throw ValidationException::withMessages([$channel->value => 'Add a mobile number to your profile first — updates go to that number.']);
                }

                Contacts::optIn($channel, $customer->phone, $customer->id, 'portal', $customer->name);
            } else {
                Contacts::optOutCustomer($channel, $customer->id, 'portal');
            }
        }

        if (array_key_exists('push', $data) && ! $data['push']) {
            Contacts::optOutCustomer(MessageChannel::Push, $customer->id, 'portal');
        }

        return response()->json(['data' => $this->state($customer), 'message' => 'Your message preferences are saved.']);
    }

    private function customer(Request $request): Customer
    {
        $user = $request->user();
        abort_unless($user instanceof Customer, 403);

        return $user;
    }

    /** @return array<string, mixed> */
    private function state(Customer $customer): array
    {
        $contacts = MessageContact::query()->active()->where('customer_id', $customer->id)->get();
        $phone = Phone::e164($customer->phone);

        return [
            'phone' => $phone,
            'channels' => array_map(fn (MessageChannel $c) => [
                'channel' => $c->value,
                'label' => $c->label(),
                'live' => $c->ready(),
                'opted_in' => $contacts->contains(fn (MessageContact $k) => $k->channel === $c
                    && ($c === MessageChannel::Push || $k->address === $phone)),
                'devices' => $c === MessageChannel::Push ? $contacts->where('channel', $c)->count() : null,
            ], MessageChannel::cases()),
        ];
    }
}
