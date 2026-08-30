<?php

namespace App\Jobs;

use App\Enums\SubscriberStatus;
use App\Enums\SuppressionReason;
use App\Mail\CampaignMessage;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterEvent;
use App\Models\NewsletterSuppression;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\EmailRenderer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

/**
 * One batch of a campaign, sent by the worker.
 *
 * Ids rather than models in the payload. A queued job's arguments are
 * serialised into the `jobs` table, and Laravel's model serialisation stores
 * an id and re-fetches — which is right, but a batch of a hundred models is a
 * hundred lookups on wake. A list of integers and one query is the same result
 * for a fraction of the work, and it survives a recipient being deleted
 * between dispatch and execution rather than throwing.
 */
class SendCampaignBatch implements ShouldQueue
{
    use Queueable;

    /**
     * One attempt for the batch as a whole.
     *
     * **Not three.** A retry would re-send to everyone the first attempt
     * already succeeded with, because the failure could come anywhere in the
     * loop — the per-recipient status guard below catches most of that, and
     * the honest answer is that a batch is not a unit that can be safely
     * retried wholesale. Individual failures are recorded per recipient and
     * can be retried deliberately from the console.
     */
    public int $tries = 1;

    /** @param array<int, int> $recipientIds */
    public function __construct(
        public int $campaignId,
        public array $recipientIds,
    ) {}

    public function handle(): void
    {
        $campaign = NewsletterCampaign::find($this->campaignId);

        if ($campaign === null) {
            return;
        }

        $recipients = NewsletterCampaignRecipient::with('subscriber')
            ->whereIn('id', $this->recipientIds)
            // The guard against sending twice, read at the moment of sending
            // rather than trusted from the dispatch. A job re-run by hand, or
            // a queue that delivered the same message twice, stops here.
            ->where('status', 'pending')
            ->get();

        foreach ($recipients as $recipient) {
            $this->send($campaign, $recipient);
        }

        CampaignSender::completeIfDone($campaign);
    }

    private function send(NewsletterCampaign $campaign, NewsletterCampaignRecipient $recipient): void
    {
        /*
         * Checked again here, per person, immediately before the send.
         *
         * The list was frozen when the campaign was queued, and a large
         * campaign takes minutes to work through — somebody who unsubscribes
         * from batch one must not receive batch forty. This is the difference
         * between "we stopped mailing them" and "we mailed them after they
         * asked us not to", which is the complaint that matters.
         */
        if (NewsletterSuppression::has($recipient->email)) {
            $recipient->update(['status' => 'skipped', 'failure_reason' => 'Suppressed before this batch was sent.']);

            return;
        }

        $base = rtrim((string) config('app.frontend_url'), '/');
        $subscriber = $recipient->subscriber;

        $html = EmailRenderer::personalise($campaign->html_content ?? '', $subscriber, [
            'token' => $recipient->token,
            'unsubscribe_url' => $base.'/newsletter/unsubscribe/'.($subscriber?->unsubscribe_token ?? ''),
        ]);

        $text = EmailRenderer::personalise($campaign->text_content ?? '', $subscriber, [
            'token' => $recipient->token,
            'unsubscribe_url' => $base.'/newsletter/unsubscribe/'.($subscriber?->unsubscribe_token ?? ''),
        ]);

        try {
            Mail::to($recipient->email)->send(new CampaignMessage($campaign, $html, $text, $recipient));

            $recipient->update(['status' => 'sent', 'sent_at' => now()]);

            NewsletterEvent::create([
                'newsletter_campaign_id' => $campaign->id,
                'newsletter_subscriber_id' => $recipient->newsletter_subscriber_id,
                'event_type' => 'sent',
            ]);
        } catch (TransportExceptionInterface|\Throwable $e) {
            /*
             * A refusal for one address must not take the batch down.
             *
             * A relay rejecting one recipient — a mailbox that is full, a
             * domain that no longer resolves — is an ordinary event in a
             * mailing of any size. Letting it throw would abandon every
             * address after it in the batch, and with `$tries = 1` they would
             * never be attempted at all.
             */
            $recipient->update([
                'status' => 'failed',
                'failure_reason' => mb_substr($e->getMessage(), 0, 490),
                'bounced_at' => now(),
            ]);

            NewsletterEvent::create([
                'newsletter_campaign_id' => $campaign->id,
                'newsletter_subscriber_id' => $recipient->newsletter_subscriber_id,
                'event_type' => 'failed',
            ]);

            if ($this->isPermanent($e->getMessage())) {
                $this->recordHardBounce($campaign, $recipient, $e->getMessage());
            }

            Log::warning('Campaign send failed for one recipient', [
                'campaign' => $campaign->id,
                'recipient' => $recipient->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Does this refusal mean the address is dead, or merely unlucky?
     *
     * SMTP says so in the status code — 5xx is permanent, 4xx is "try later" —
     * but the code arrives inside a message string rather than as a field,
     * because it comes back through a transport exception. Matched
     * conservatively: treating a temporary failure as permanent suppresses a
     * real customer for ever, which is much worse than retrying a dead address
     * next month.
     */
    private function isPermanent(string $message): bool
    {
        return (bool) preg_match(
            '/\b5\.[17]\.[0-9]+\b|\b55[0-4]\b|user unknown|no such user|mailbox unavailable|does not exist|address rejected/i',
            $message,
        );
    }

    private function recordHardBounce(NewsletterCampaign $campaign, NewsletterCampaignRecipient $recipient, string $reason): void
    {
        NewsletterSuppression::add(
            $recipient->email,
            SuppressionReason::HardBounce,
            mb_substr($reason, 0, 490),
            $campaign->id,
        );

        $recipient->subscriber?->update([
            'status' => SubscriberStatus::Bounced,
            'bounce_count' => ($recipient->subscriber->bounce_count ?? 0) + 1,
            'last_bounce_at' => now(),
        ]);

        NewsletterEvent::create([
            'newsletter_campaign_id' => $campaign->id,
            'newsletter_subscriber_id' => $recipient->newsletter_subscriber_id,
            'event_type' => 'bounced',
        ]);
    }
}
