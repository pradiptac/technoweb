<?php

namespace App\Support\Newsletter;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\NewsletterGroup;
use App\Models\NewsletterSubscriber;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * The one group nobody curates: everybody with a working portal account.
 *
 * A campaign to "our customers" is the most ordinary thing this module will be
 * asked to do, and answering it with a one-off import means the list is correct
 * on the day it was pressed and wrong from the next approval onwards. Nobody
 * notices that, because a stale group looks exactly like a current one — it is
 * the newest customers, the ones most worth writing to, who are silently
 * missing.
 *
 * So membership here is **derived and re-derived**, never edited. The group is
 * a view of `customers` that happens to be stored.
 *
 * **It cannot resurrect an unsubscribe, and that is the rule the whole class is
 * built around.** Every addition goes through `SubscriberIntake`, which checks
 * the suppression list *before* it looks a subscriber up — so somebody who
 * left the list stays off it however many times this runs, and being a customer
 * is not a way back onto a mailing list they declined. A sync that wrote
 * membership rows directly would quietly undo that on its next pass, which is
 * the single worst thing this feature could do.
 *
 * Consent is a separate question from correctness and this class does not
 * answer it: a portal account is a support relationship, not agreement to
 * receive marketing. Whether these people may be mailed is the client's call
 * and their jurisdiction's; the unsubscribe link and the suppression list are
 * what make it recoverable either way.
 */
class CustomerGroupSync
{
    public const SOURCE = 'customers';

    public const NAME = 'Existing customers';

    /**
     * The standing group, created if it is not there yet.
     *
     * Found by `source`, never by name or slug: both are editable, and a group
     * that loses its identity because somebody renamed it is a second group
     * appearing out of nowhere on the next run.
     */
    public static function group(): NewsletterGroup
    {
        $group = NewsletterGroup::where('source', self::SOURCE)->first();

        if ($group !== null) {
            return $group;
        }

        return NewsletterGroup::create([
            'name' => self::NAME,
            'slug' => Str::slug(self::NAME),
            'description' => 'Everybody with an active portal account. Kept in step automatically — '
                .'people are not added or removed by hand.',
            'source' => self::SOURCE,
            'is_active' => true,
        ]);
    }

    /**
     * Bring the group's membership back in line with the customer table.
     *
     * @return array{added: int, removed: int, suppressed: int, members: int}
     */
    public static function run(): array
    {
        $group = self::group();
        $tally = ['added' => 0, 'removed' => 0, 'suppressed' => 0, 'members' => 0];

        /*
         * Only `active` customers, the same test the sign-in uses.
         *
         * `pending` is somebody waiting on a human and `rejected` is somebody a
         * human turned down — mailing either is the module answering a question
         * the support desk has not answered yet.
         */
        $emails = [];

        Customer::query()
            ->where('status', CustomerStatus::Active)
            ->select(['id', 'email', 'name', 'company', 'phone'])
            ->chunkById(200, function ($customers) use ($group, &$tally, &$emails) {
                foreach ($customers as $customer) {
                    $email = Str::lower(trim((string) $customer->email));

                    if ($email === '') {
                        continue;
                    }

                    $emails[] = $email;

                    // The whole of the suppression guarantee is that this is
                    // the only way a row is written.
                    $result = SubscriberIntake::take(
                        $email,
                        self::attributes($customer),
                        [$group->id],
                        'customer',
                        $customer->id,
                    );

                    if ($result['outcome'] === SubscriberIntake::SUPPRESSED) {
                        $tally['suppressed']++;

                        continue;
                    }

                    if ($result['outcome'] === SubscriberIntake::CREATED) {
                        $tally['added']++;
                    }
                }
            });

        /*
         * Anybody in the group who is no longer an active customer comes out.
         *
         * Out of the *group* only — their subscriber row, their other groups
         * and their subscription are untouched. Somebody whose account was
         * suspended has not asked to stop hearing from the company, and
         * unsubscribing them here would be this class making a decision that
         * belongs to them.
         */
        $stale = DB::table('newsletter_group_subscriber')
            ->join('newsletter_subscribers', 'newsletter_subscribers.id', '=', 'newsletter_group_subscriber.newsletter_subscriber_id')
            ->where('newsletter_group_subscriber.newsletter_group_id', $group->id)
            ->when($emails !== [], fn ($q) => $q->whereNotIn('newsletter_subscribers.email', $emails))
            ->pluck('newsletter_subscribers.id');

        if ($stale->isNotEmpty()) {
            $group->subscribers()->detach($stale->all());
            $tally['removed'] = $stale->count();
        }

        $tally['members'] = $group->subscribers()->count();

        return $tally;
    }

    /**
     * Bring one customer into line, without sweeping the table.
     *
     * The hook that calls this fires on every customer save, so the full
     * reconcile would be a table scan every time somebody edits a phone
     * number. This is the same two rules applied to one row.
     */
    public static function syncOne(Customer $customer): void
    {
        $email = Str::lower(trim((string) $customer->email));

        if ($email === '') {
            return;
        }

        $group = self::group();

        if ($customer->status === CustomerStatus::Active) {
            SubscriberIntake::take($email, self::attributes($customer), [$group->id], 'customer', $customer->id);

            return;
        }

        /*
         * No longer active: out of the group, and nothing else touched.
         *
         * Their subscriber row, their other groups and their subscription all
         * stay. A suspended account has not asked to stop hearing from the
         * company, and deciding that for them is not this class's to make.
         */
        $subscriber = NewsletterSubscriber::where('email', $email)->first();

        if ($subscriber !== null) {
            $group->subscribers()->detach($subscriber->id);
        }
    }

    /**
     * A customer's name is one field here and two on a subscriber.
     *
     * Split on the last space rather than the first: "Neil Basu" and "Anna
     * Maria Roy" both want the final word as the surname, and taking the first
     * word as the forename gets the second one wrong.
     */
    private static function attributes(Customer $customer): array
    {
        $name = trim((string) $customer->name);
        $space = strrpos($name, ' ');

        return [
            'first_name' => $space === false ? $name : substr($name, 0, $space),
            'last_name' => $space === false ? null : substr($name, $space + 1),
            'company' => $customer->company,
            'phone' => $customer->phone,
        ];
    }
}
