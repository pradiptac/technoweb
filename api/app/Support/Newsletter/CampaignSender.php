<?php

namespace App\Support\Newsletter;

use App\Enums\CampaignStatus;
use App\Jobs\SendCampaignBatch;
use App\Models\NewsletterCampaign;
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

        $batches = 0;
        $size = self::batchSize();

        /*
         * One job per batch of ids, dispatched from a chunked query rather
         * than by loading every recipient — a campaign of fifty thousand would
         * otherwise be fifty thousand models in memory to produce a list of
         * integers.
         */
        $campaign->recipients()->select('id')->orderBy('id')->chunk($size, function ($chunk) use ($campaign, &$batches) {
            SendCampaignBatch::dispatch($campaign->id, $chunk->pluck('id')->all())
                // Spread out, so a large campaign does not hand the relay
                // everything at once — the provider limits the specification
                // asks to be respected are usually per minute.
                ->delay(now()->addSeconds($batches * self::batchDelay()));

            $batches++;
        });

        return ['queued' => true, 'recipients' => $count, 'batches' => $batches, 'reason' => null];
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
        $pending = $campaign->recipients()->where('status', 'pending')->exists();

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
