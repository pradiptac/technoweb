<?php

namespace App\Support\Messaging;

use App\Enums\MessageChannel;
use App\Models\MessageContact;
use App\Support\Phone;
use Illuminate\Database\QueryException;
use Illuminate\Support\Collection;

/**
 * Opting in, opting out, and who an event reaches.
 *
 * **Consent comes only from the person.** Every opt-in here is called from
 * something they did — the checkout checkbox, the portal toggle, the push
 * bell — and nothing in the console can create one. An opt-out can come
 * from them (a STOP reply, the portal toggle, the bell), from the provider
 * (FCM `UNREGISTERED`), or from staff recording one on somebody's behalf;
 * it never deletes the row, which is the record that we stopped.
 */
final class Contacts
{
    /** Replies that mean "stop messaging me", compared after trimming and upper-casing. */
    public const STOP_WORDS = ['STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPT OUT', 'OPTOUT', 'STOP PROMOTIONS'];

    public static function isStop(string $text): bool
    {
        $word = strtoupper(trim((string) preg_replace('/[^\p{L}\s]/u', '', $text)));

        return in_array((string) preg_replace('/\s+/', ' ', $word), self::STOP_WORDS, true);
    }

    /**
     * The address a channel stores: E.164 for a phone channel, the token as
     * given for push. Null when it is not one.
     */
    public static function normalise(MessageChannel $channel, ?string $address): ?string
    {
        if ($channel->addressKind() === 'phone') {
            return Phone::e164($address);
        }

        $token = trim((string) $address);

        return preg_match('/^[A-Za-z0-9_:\-.]{20,500}$/', $token) === 1 ? $token : null;
    }

    /**
     * Record an opt-in. An existing row is re-armed — the stamp cleared, a
     * fresh `opted_in_at` — and gains the customer when one is known; it
     * never loses one it had.
     */
    public static function optIn(MessageChannel $channel, ?string $address, ?int $customerId, string $source, ?string $name = null): ?MessageContact
    {
        $address = self::normalise($channel, $address);

        if ($address === null) {
            return null;
        }

        $write = function () use ($channel, $address, $customerId, $source, $name) {
            $contact = MessageContact::query()->firstOrNew(['channel' => $channel->value, 'address' => $address]);

            $contact->fill([
                'source' => $source,
                'opted_in_at' => now(),
                'opted_out_at' => null,
                'opt_out_reason' => null,
            ]);

            if ($customerId !== null) {
                $contact->customer_id = $customerId;
            }

            if (filled($name) && blank($contact->name)) {
                $contact->name = mb_substr((string) $name, 0, 160);
            }

            $contact->save();

            return $contact;
        };

        try {
            return $write();
        } catch (QueryException) {
            // Two requests opting the same address in at once: the unique
            // index let one insert, and the second now finds the row.
            return $write();
        }
    }

    /** Opt one address out on a channel. Returns how many rows changed. */
    public static function optOut(MessageChannel $channel, ?string $address, string $reason): int
    {
        $address = self::normalise($channel, $address) ?? trim((string) $address);

        if ($address === '') {
            return 0;
        }

        return MessageContact::query()
            ->where('channel', $channel->value)->where('address', $address)->whereNull('opted_out_at')
            ->update(['opted_out_at' => now(), 'opt_out_reason' => mb_substr($reason, 0, 60), 'updated_at' => now()]);
    }

    /** Opt every one of a customer's contacts on a channel out — the portal toggle. */
    public static function optOutCustomer(MessageChannel $channel, int $customerId, string $reason): int
    {
        return MessageContact::query()
            ->where('channel', $channel->value)->where('customer_id', $customerId)->whereNull('opted_out_at')
            ->update(['opted_out_at' => now(), 'opt_out_reason' => mb_substr($reason, 0, 60), 'updated_at' => now()]);
    }

    /**
     * The contacts an event for this recipient reaches on a channel, active
     * only.
     *
     * A phone channel is reached by the number the caller holds — the one
     * typed at the checkout is who the order is for — and, only when the
     * caller holds no number, by the customer's own opted-in numbers. Push
     * is reached through a customer's subscriptions alone: a guest's browser
     * is broadcast-only, the contract's rule.
     *
     * @return Collection<int, MessageContact>
     */
    public static function forRecipient(MessageChannel $channel, MessageRecipient $to): Collection
    {
        $query = MessageContact::query()->active()->where('channel', $channel->value);

        if ($channel->addressKind() === 'phone') {
            $phone = Phone::e164($to->phone);

            if ($phone !== null) {
                return $query->where('address', $phone)->get();
            }

            return $to->customerId !== null ? $query->where('customer_id', $to->customerId)->get() : new Collection;
        }

        return $to->customerId !== null ? $query->where('customer_id', $to->customerId)->get() : new Collection;
    }
}
