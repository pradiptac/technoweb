<?php

namespace App\Support\Newsletter;

use App\Enums\SubscriberStatus;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use Illuminate\Support\Collection;

/**
 * Who a campaign actually goes to, and what was removed on the way.
 *
 * The specification asks for the removals to be shown before sending — how
 * many duplicates, how many unsubscribed, how many bounced — and that is worth
 * more than the final number on its own: "2,840 contacts, 2,609 recipients" is
 * a screen somebody can sanity-check, while "2,609" is a number they have to
 * trust.
 *
 * **This is the read half of the invariant `SubscriberIntake` writes.** One
 * class decides who may be added; this one decides who may be sent to, and
 * both ask the suppression list. A campaign that filtered on
 * `status = 'active'` alone would mail anyone suppressed without a subscriber
 * row ever having been updated — which is exactly the case a hard bounce
 * creates.
 */
class AudienceResolver
{
    /**
     * The counts, for the review screen. Nothing is written.
     *
     * @param  array<int, int>  $groupIds
     * @return array<string, int>
     */
    public static function preview(array $groupIds): array
    {
        $inGroups = self::inGroups($groupIds);

        // Distinct rows across the chosen groups. Somebody in three of them is
        // one contact and one recipient, and the difference between those two
        // numbers is the thing worth showing.
        $contacts = (clone $inGroups)->distinct()->count('newsletter_subscribers.id');
        $total = (clone $inGroups)->count();

        $suppressed = (clone $inGroups)->distinct()
            ->join('newsletter_suppressions', 'newsletter_suppressions.email', '=', 'newsletter_subscribers.email')
            ->count('newsletter_subscribers.id');

        $byStatus = fn (SubscriberStatus $status) => (clone $inGroups)->distinct()
            ->where('newsletter_subscribers.status', $status->value)
            ->count('newsletter_subscribers.id');

        return [
            'group_contacts' => $total,
            'duplicates_removed' => $total - $contacts,
            'unsubscribed_removed' => $byStatus(SubscriberStatus::Unsubscribed),
            'bounced_removed' => $byStatus(SubscriberStatus::Bounced),
            'suppressed_removed' => $suppressed,
            'final_recipients' => self::eligible($groupIds)->count(),
        ];
    }

    /**
     * The addresses that will actually be mailed.
     *
     * @param  array<int, int>  $groupIds
     * @return Collection<int, NewsletterSubscriber>
     */
    public static function eligible(array $groupIds): Collection
    {
        if ($groupIds === []) {
            return collect();
        }

        return NewsletterSubscriber::query()
            /*
             * `whereExists` against the pivot, **not** `whereIn` on a subquery
             * that joins it — and that is a bug fix rather than a preference.
             *
             * The obvious version, `whereIn('id', <select id join pivot>)`,
             * returns somebody in two of the chosen groups **twice**. It looks
             * exactly right, and `IN` is a set membership test that cannot
             * duplicate — but MySQL is free to flatten `IN (subquery)` into a
             * semi-join, and when the subquery's select list is not unique the
             * duplicate rows survive the transformation. Measured here:
             * `rows=3 ids=3,3,4` for three subscribers.
             *
             * That is a person receiving the same campaign twice, which is the
             * second-worst thing this module can do. `whereExists` cannot
             * express it: it is a predicate on the outer row, so the outer row
             * appears once whatever the pivot holds.
             */
            ->whereExists(fn ($q) => $q
                ->selectRaw('1')
                ->from('newsletter_group_subscriber')
                ->whereColumn('newsletter_group_subscriber.newsletter_subscriber_id', 'newsletter_subscribers.id')
                ->whereIn('newsletter_group_subscriber.newsletter_group_id', $groupIds))
            ->where('status', SubscriberStatus::Active)
            /*
             * The suppression list, as a predicate for the same reason. A
             * hundred thousand suppressed addresses is not something to load
             * into memory to answer a question the database can answer — and
             * doing it in SQL means the count on the review screen and the rows
             * the send uses come from one expression rather than two that have
             * to agree.
             */
            ->whereNotExists(fn ($q) => $q
                ->selectRaw('1')
                ->from('newsletter_suppressions')
                ->whereColumn('newsletter_suppressions.email', 'newsletter_subscribers.email'))
            ->orderBy('newsletter_subscribers.id')
            ->get();
    }

    /** @param array<int, int> $groupIds */
    private static function inGroups(array $groupIds)
    {
        return NewsletterSubscriber::query()
            ->join('newsletter_group_subscriber', 'newsletter_group_subscriber.newsletter_subscriber_id', '=', 'newsletter_subscribers.id')
            ->whereIn('newsletter_group_subscriber.newsletter_group_id', $groupIds);
    }

    /**
     * Freeze the list onto the campaign.
     *
     * Generated once, when the campaign is queued, rather than resolved as
     * each batch goes out. Two reasons, and both have teeth: a subscriber who
     * unsubscribes mid-send would otherwise shift the boundaries of a list
     * being paged through — so somebody after them is skipped entirely — and a
     * report has to describe what was attempted rather than what the list
     * looks like now.
     *
     * @return int the number of recipients written
     */
    public static function freeze(NewsletterCampaign $campaign): int
    {
        $groupIds = $campaign->groups()->pluck('newsletter_groups.id')->all();
        $eligible = self::eligible($groupIds);

        /*
         * `createMany` rather than a raw insert, because the model's
         * `creating` hook is what mints each recipient's tracking token — and
         * a recipient without one is a pixel and a set of links that 404.
         * Chunked so a campaign of fifty thousand is not one enormous
         * statement.
         *
         * The timestamps are deliberately absent: Eloquent sets them, and
         * naming them here throws under `preventSilentlyDiscardingAttributes`
         * since they are not fillable.
         */
        $eligible->chunk(500)->each(function (Collection $chunk) use ($campaign) {
            $campaign->recipients()->createMany(
                $chunk->map(fn (NewsletterSubscriber $s) => [
                    'newsletter_subscriber_id' => $s->id,
                    'email' => $s->email,
                    'status' => 'pending',
                ])->all()
            );
        });

        return $eligible->count();
    }
}
