<?php

namespace App\Support\Newsletter;

use App\Enums\CampaignStatus;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use App\Models\Setting;

/**
 * Handing a campaign to the queue.
 *
 * **Nothing here sends an email.** It freezes the recipient list, prepares the
 * HTML once, and dispatches one job per batch; the sending happens in the
 * worker the scheduler already runs. The specification is explicit that a
 * large campaign must never go through a browser request, and this project has
 * measured what a single unreachable SMTP host costs a request — 12.5 seconds.
 * Fifty thousand of them is not a slow page, it is a dead one.
 *
 * The rule that matters most is that **a campaign is never sent twice**. That
 * is guarded three ways: the status is moved to `sending` inside a
 * conditional update, so two simultaneous requests cannot both win; the
 * recipient rows have a unique index per (campaign, subscriber); and each
 * batch job re-reads the recipient's status before sending. A double-click on
 * a Send button is the ordinary case, not the exotic one.
 */
class CampaignSender
{
    /** How many addresses one job handles. Configurable — see `batchSize()`. */
    public const DEFAULT_BATCH = 100;

    /**
     * Queue a campaign.
     *
     * @return array{queued: bool, recipients: int, batches: int, reason: ?string}
     */
    public static function queue(NewsletterCampaign $campaign): array
    {
        /*
         * The claim, as a conditional UPDATE with the affected row count
         * checked — the same shape `SignInCodes::consume()` uses.
         *
         * The obvious version reads the status, decides, and writes. That
         * passes every test written on one thread and is a race in production:
         * two requests both read `ready`, both decide to send, and every
         * subscriber gets the message twice. There is no undo for that.
         */
        $claimed = NewsletterCampaign::whereKey($campaign->id)
            ->whereIn('status', [CampaignStatus::Ready->value, CampaignStatus::Scheduled->value])
            ->update([
                'status' => CampaignStatus::Sending->value,
                'started_at' => now(),
                'updated_at' => now(),
            ]);

        if ($claimed === 0) {
            return [
                'queued' => false,
                'recipients' => 0,
                'batches' => 0,
                'reason' => 'This campaign is not ready to send, or has already been sent.',
            ];
        }

        $campaign->refresh();

        // Prepared once for the whole campaign: the links are rewritten and
        // the pixel added here, and only the per-person token is substituted
        // later.
        $prepared = TrackingRewriter::prepare($campaign, (string) $campaign->html_content);

        $count = AudienceResolver::freeze($campaign);

        if ($count === 0) {
            $campaign->update([
                'status' => CampaignStatus::Failed->value,
                'completed_at' => now(),
            ]);

            return [
                'queued' => false,
                'recipients' => 0,
                'batches' => 0,
                'reason' => 'Nobody in the selected groups can be sent to. Check the audience before trying again.',
            ];
        }

        $campaign->update(['recipient_count' => $count, 'html_content' => $prepared]);

        if ($campaign->testsSubjects()) {
            self::splitForTest($campaign, $count);
        }

        $batches = self::dispatchPending($campaign);

        return ['queued' => true, 'recipients' => $count, 'batches' => $batches, 'reason' => null];
    }

    /**
     * Queue every pending recipient, one job per batch.
     *
     * Dispatched from a chunked query rather than by loading every recipient
     * — a campaign of fifty thousand would otherwise be fifty thousand models
     * in memory to produce a list of integers. Shared by the first send and by
     * the release of a subject test's held remainder.
     */
    public static function dispatchPending(NewsletterCampaign $campaign): int
    {
        $batches = 0;
        $size = self::batchSize();

        $campaign->recipients()->select('id')->where('status', 'pending')->orderBy('id')
            ->chunk($size, function ($chunk) use ($campaign, &$batches) {
                SendCampaignBatch::dispatch($campaign->id, $chunk->pluck('id')->all())
                    // Spread out, so a large campaign does not hand the relay
                    // everything at once — the provider limits the specification
                    // asks to be respected are usually per minute.
                    ->delay(now()->addSeconds($batches * self::batchDelay()));

                $batches++;
            });

        return $batches;
    }

    /**
     * A subject test: a slice goes now, half with each subject; the rest waits.
     *
     * The slice is `ab_test_percent` of the frozen list, at least two so each
     * subject is sent at all, alternating A and B down the list so a test of
     * twenty is ten and ten whatever order the audience was frozen in. Every
     * other recipient is `held` — a status the dispatcher does not pick up
     * and `completeIfDone()` does not count as done — until `decide()` names
     * the winner and releases them under it.
     */
    private static function splitForTest(NewsletterCampaign $campaign, int $count): void
    {
        $share = max(1, min(50, (int) $campaign->ab_test_percent));
        // Nothing to hold if the list is no bigger than the test: send it all,
        // still under both subjects, so the report can compare them.
        $testSize = min(max(2, (int) ceil($count * $share / 100)), $count);

        $ids = $campaign->recipients()->orderBy('id')->pluck('id');
        $test = $ids->take($testSize)->values();
        $held = $ids->slice($testSize)->values();

        $a = $test->filter(fn ($id, $i) => $i % 2 === 0)->values();
        $b = $test->filter(fn ($id, $i) => $i % 2 === 1)->values();

        NewsletterCampaignRecipient::whereIn('id', $a)->update(['variant' => 'a']);
        NewsletterCampaignRecipient::whereIn('id', $b)->update(['variant' => 'b']);
        if ($held->isNotEmpty()) {
            NewsletterCampaignRecipient::whereIn('id', $held)->update(['status' => 'held']);
        }
    }

    /**
     * Name the winning subject and release the held remainder under it.
     *
     * Opens over sent, per variant; the higher wins and a tie goes to A, the
     * subject somebody wrote first. Called by `technoware:decide-subject-tests`
     * once the wait has passed, or from the console to decide early — with a
     * `$force` of `a` or `b` to overrule the numbers. Idempotent: a campaign
     * already decided is left alone, and the claim is the same conditional
     * update the first send relies on.
     *
     * @return array{winner: string, released: int}|null
     */
    public static function decide(NewsletterCampaign $campaign, ?string $force = null): ?array
    {
        if (! $campaign->testsSubjects() || $campaign->ab_winner !== null) {
            return null;
        }

        $stats = self::variantStats($campaign);
        $rateA = $stats['a']['sent'] > 0 ? $stats['a']['opened'] / $stats['a']['sent'] : 0;
        $rateB = $stats['b']['sent'] > 0 ? $stats['b']['opened'] / $stats['b']['sent'] : 0;
        $winner = in_array($force, ['a', 'b'], true) ? $force : ($rateB > $rateA ? 'b' : 'a');

        $claimed = NewsletterCampaign::whereKey($campaign->id)
            ->whereNull('ab_winner')
            ->update(['ab_winner' => $winner, 'ab_decided_at' => now(), 'updated_at' => now()]);

        if ($claimed === 0) {
            return null;
        }

        $released = $campaign->recipients()->where('status', 'held')
            ->update(['status' => 'pending', 'variant' => $winner]);

        $campaign->refresh();
        self::dispatchPending($campaign);
        // A test with nothing held (the whole list was the test) is finished
        // the moment its winner is named.
        self::completeIfDone($campaign);

        return ['winner' => $winner, 'released' => $released];
    }

    /**
     * Sent and opened per subject, off the recipient rows.
     *
     * @return array{a: array{sent:int, opened:int, clicked:int}, b: array{sent:int, opened:int, clicked:int}}
     */
    public static function variantStats(NewsletterCampaign $campaign): array
    {
        $rows = $campaign->recipients()
            ->whereIn('variant', ['a', 'b'])
            ->selectRaw("variant, sum(status = 'sent') as sent, sum(opened_at is not null) as opened, sum(clicked_at is not null) as clicked")
            ->groupBy('variant')
            ->get()
            ->keyBy('variant');

        $of = fn (string $v) => [
            'sent' => (int) ($rows[$v]->sent ?? 0),
            'opened' => (int) ($rows[$v]->opened ?? 0),
            'clicked' => (int) ($rows[$v]->clicked ?? 0),
        ];

        return ['a' => $of('a'), 'b' => $of('b')];
    }

    /**
     * Mark a campaign finished, when nothing is left pending.
     *
     * Called by the last batch to notice rather than by a scheduled sweep: the
     * job that finds no pending recipients left is the one that knows, and a
     * sweep would need a schedule of its own to answer a question that is
     * already in front of somebody.
     */
    public static function completeIfDone(NewsletterCampaign $campaign): void
    {
        // Held rows are a subject test's remainder: not done, not yet queued.
        $pending = $campaign->recipients()->whereIn('status', ['pending', 'held'])->exists();

        if ($pending) {
            return;
        }

        $failed = $campaign->recipients()->where('status', 'failed')->count();
        $sent = $campaign->recipients()->where('status', 'sent')->count();

        NewsletterCampaign::whereKey($campaign->id)
            ->where('status', CampaignStatus::Sending->value)
            ->update([
                // Every single one failing is not a completed campaign, it is
                // a broken mail configuration — and the console must not show
                // it as "Sent" with a report full of zeroes.
                'status' => $sent === 0 && $failed > 0
                    ? CampaignStatus::Failed->value
                    : CampaignStatus::Sent->value,
                'completed_at' => now(),
                'updated_at' => now(),
            ]);
    }

    public static function batchSize(): int
    {
        return max(1, min(1000, (int) (Setting::get('newsletter_batch_size') ?: self::DEFAULT_BATCH)));
    }

    /** Seconds between one batch starting and the next. */
    public static function batchDelay(): int
    {
        return max(0, min(600, (int) (Setting::get('newsletter_batch_delay') ?: 0)));
    }
}
