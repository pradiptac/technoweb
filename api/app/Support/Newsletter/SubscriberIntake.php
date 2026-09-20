<?php

namespace App\Support\Newsletter;

use App\Enums\SubscriberStatus;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * The one way an address gets onto the list.
 *
 * There are five callers — the CSV import, a manual add, the customer import,
 * the public signup form and the seeder — and every one of them has to answer
 * the same four questions in the same order: is this a real address, is it
 * already here, is it suppressed, and which groups does it join. A check
 * written per caller is a check missed at one of them, and the one that is
 * missed is the one that mails somebody who asked not to be. Same argument
 * that put `staff` on the admin route group rather than at 67 call sites.
 *
 * **Suppression wins over everything.** An address on the do-not-mail list is
 * refused here, whatever it is being added by and whatever it says about
 * itself — a spreadsheet that happens to contain somebody who unsubscribed
 * last year must not put them back. That is the rule with legal weight, and it
 * is the reason this class exists rather than a handful of `firstOrCreate`
 * calls.
 */
class SubscriberIntake
{
    public const CREATED = 'created';

    public const UPDATED = 'updated';

    public const DUPLICATE = 'duplicate';

    public const SUPPRESSED = 'suppressed';

    public const INVALID = 'invalid';

    /**
     * Add or update one address.
     *
     * @param  array<string, mixed>  $attributes  first_name, last_name, company, phone
     * @param  array<int, int>  $groupIds
     * @return array{outcome: string, subscriber: ?NewsletterSubscriber, reason: ?string}
     */
    public static function take(
        ?string $email,
        array $attributes = [],
        array $groupIds = [],
        string $source = 'manual',
        ?int $customerId = null,
    ): array {
        $email = Str::lower(trim((string) $email));

        if ($email === '' || Validator::make(['email' => $email], ['email' => 'email:rfc'])->fails()) {
            return self::result(self::INVALID, null, 'Not a valid email address.');
        }

        /*
         * Checked before the lookup, not after.
         *
         * A suppressed address may still have a subscriber row — somebody who
         * unsubscribed keeps their record so the history reads correctly — so
         * asking the row first and the suppression list second would let an
         * import "update" them back to active on the way past.
         */
        if (NewsletterSuppression::has($email)) {
            return self::result(self::SUPPRESSED, null, 'This address has asked not to be contacted.');
        }

        $subscriber = NewsletterSubscriber::where('email', $email)->first();

        if ($subscriber === null) {
            $subscriber = NewsletterSubscriber::create([
                'email' => $email,
                'customer_id' => $customerId,
                'source' => $source,
                'status' => SubscriberStatus::Active,
                ...self::fill($attributes),
            ]);

            self::join($subscriber, $groupIds);

            return self::result(self::CREATED, $subscriber);
        }

        /*
         * An existing row is enriched, never overwritten with blanks.
         *
         * A second spreadsheet that has the address but not the company must
         * not erase a company somebody typed in — an import is additive
         * information, and treating a missing column as an instruction to
         * clear the field is how a list quietly loses everything it knows.
         */
        $changes = array_filter(
            self::fill($attributes),
            fn ($value, $key) => filled($value) && blank($subscriber->{$key}),
            ARRAY_FILTER_USE_BOTH,
        );

        // Linking a subscriber to a customer account is worth doing even when
        // nothing else changed.
        if ($customerId !== null && $subscriber->customer_id === null) {
            $changes['customer_id'] = $customerId;
        }

        $joined = self::join($subscriber, $groupIds);

        if ($changes === [] && ! $joined) {
            return self::result(self::DUPLICATE, $subscriber, 'Already on the list.');
        }

        if ($changes !== []) {
            $subscriber->update($changes);
        }

        return self::result(self::UPDATED, $subscriber);
    }

    /**
     * @param  array<int, int>  $groupIds
     * @return bool whether anything was actually added
     */
    private static function join(NewsletterSubscriber $subscriber, array $groupIds): bool
    {
        if ($groupIds === []) {
            return false;
        }

        // `syncWithoutDetaching` rather than `sync`: adding somebody to the
        // "Networking" group must not remove them from every other group they
        // are in, which is what a plain sync would do — and the pivot's unique
        // index means a repeat is a no-op rather than a duplicate recipient.
        $changed = $subscriber->groups()->syncWithoutDetaching(
            NewsletterGroup::whereIn('id', $groupIds)->pluck('id')->all()
        );

        return $changed['attached'] !== [];
    }

    /** @return array<string, mixed> */
    private static function fill(array $attributes): array
    {
        $clean = [];

        foreach (['first_name', 'last_name', 'company', 'phone'] as $field) {
            $value = trim((string) ($attributes[$field] ?? ''));
            $clean[$field] = $value === '' ? null : Str::limit($value, 190, '');
        }

        return $clean;
    }

    private static function result(string $outcome, ?NewsletterSubscriber $subscriber, ?string $reason = null): array
    {
        return ['outcome' => $outcome, 'subscriber' => $subscriber, 'reason' => $reason];
    }
}
