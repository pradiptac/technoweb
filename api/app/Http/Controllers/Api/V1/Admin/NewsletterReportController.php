<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CampaignStatus;
use App\Enums\SubscriberStatus;
use App\Http\Controllers\Controller;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterEvent;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Support\Newsletter\TrackingRewriter;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * The dashboard and the per-campaign report.
 *
 * Two rules run through all of it.
 *
 * **Rates are labelled with what they are over.** An open rate is unique opens
 * over *delivered*, not over sent, and a click rate is unique clickers over
 * delivered too — quoting either over "sent" inflates both by however many
 * bounced. The specification asks for the distinction to be explicit, and it is
 * the difference between a figure somebody can compare to an industry number
 * and one they cannot.
 *
 * **A rate with no denominator is null, never zero.** Zero per cent reads as
 * "nobody opened it"; null reads as "nothing has been measured", which is what
 * is true of a campaign that has not been sent. Same rule the ticket dashboard
 * follows for its medians.
 */
class NewsletterReportController extends Controller
{
    public function dashboard(): JsonResponse
    {
        $subscribers = NewsletterSubscriber::query()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $sent = NewsletterCampaign::where('status', CampaignStatus::Sent)->count();

        // Averaged across sent campaigns rather than over all events: a single
        // enormous mailing would otherwise dominate the headline figures and
        // make the trend meaningless.
        $rates = DB::table('newsletter_campaign_recipients')
            ->join('newsletter_campaigns', 'newsletter_campaigns.id', '=', 'newsletter_campaign_recipients.newsletter_campaign_id')
            ->where('newsletter_campaigns.status', CampaignStatus::Sent->value)
            ->selectRaw('
                count(*) as total,
                sum(case when newsletter_campaign_recipients.status = ? then 1 else 0 end) as delivered,
                sum(case when newsletter_campaign_recipients.opened_at is not null then 1 else 0 end) as opened,
                sum(case when newsletter_campaign_recipients.clicked_at is not null then 1 else 0 end) as clicked,
                sum(case when newsletter_campaign_recipients.bounced_at is not null then 1 else 0 end) as bounced
            ', ['sent'])
            ->first();

        $delivered = (int) ($rates->delivered ?? 0);
        $total = (int) ($rates->total ?? 0);

        return response()->json(['data' => [
            'subscribers' => [
                'total' => (int) $subscribers->sum(),
                'active' => (int) ($subscribers[SubscriberStatus::Active->value] ?? 0),
                'unsubscribed' => (int) ($subscribers[SubscriberStatus::Unsubscribed->value] ?? 0),
                'bounced' => (int) ($subscribers[SubscriberStatus::Bounced->value] ?? 0),
                'suppressed' => NewsletterSuppression::count(),
            ],
            'campaigns' => [
                'total' => NewsletterCampaign::count(),
                'sent' => $sent,
                'draft' => NewsletterCampaign::where('status', CampaignStatus::Draft)->count(),
                'scheduled' => NewsletterCampaign::where('status', CampaignStatus::Scheduled)->count(),
                'emails_sent' => $delivered,
            ],
            'rates' => [
                'open' => self::rate((int) ($rates->opened ?? 0), $delivered),
                'click' => self::rate((int) ($rates->clicked ?? 0), $delivered),
                'bounce' => self::rate((int) ($rates->bounced ?? 0), $total),
                'delivery' => self::rate($delivered, $total),
                // The sample, so "34%" is read alongside what it is 34% of.
                // 100% of two and 100% of two hundred are not the same claim.
                'sample' => $delivered,
            ],
            'tracking_enabled' => TrackingRewriter::enabled(),
            'recent_campaigns' => NewsletterCampaign::latest('id')->limit(5)
                ->get(['id', 'name', 'subject', 'status', 'recipient_count', 'completed_at'])
                ->map(fn (NewsletterCampaign $c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'status' => $c->status->value,
                    'status_label' => $c->status->label(),
                    'recipients' => $c->recipient_count,
                    'completed_at' => $c->completed_at?->toIso8601String(),
                ]),
            'recent_unsubscribes' => NewsletterSuppression::latest('id')->limit(5)
                ->get(['email', 'reason', 'created_at'])
                ->map(fn (NewsletterSuppression $s) => [
                    'email' => $s->email,
                    'reason' => $s->reason->label(),
                    'at' => $s->created_at?->toIso8601String(),
                ]),
        ]]);
    }

    /** One campaign, in full. */
    public function campaign(NewsletterCampaign $campaign): JsonResponse
    {
        $counts = $campaign->recipients()
            ->selectRaw('
                count(*) as total,
                sum(case when status = ? then 1 else 0 end) as sent,
                sum(case when status = ? then 1 else 0 end) as failed,
                sum(case when status = ? then 1 else 0 end) as skipped,
                sum(case when opened_at is not null then 1 else 0 end) as opened,
                sum(case when clicked_at is not null then 1 else 0 end) as clicked,
                sum(case when bounced_at is not null then 1 else 0 end) as bounced,
                sum(case when unsubscribed_at is not null then 1 else 0 end) as unsubscribed
            ', ['sent', 'failed', 'skipped'])
            ->first();

        $delivered = (int) $counts->sent;

        return response()->json(['data' => [
            'campaign' => [
                'id' => $campaign->id,
                'name' => $campaign->name,
                'subject' => $campaign->subject,
                'status' => $campaign->status->value,
                'status_label' => $campaign->status->label(),
                'started_at' => $campaign->started_at?->toIso8601String(),
                'completed_at' => $campaign->completed_at?->toIso8601String(),
                'health_score' => $campaign->health_score,
            ],
            'counts' => [
                'recipients' => (int) $counts->total,
                'sent' => $delivered,
                'failed' => (int) $counts->failed,
                'skipped' => (int) $counts->skipped,
                'opened' => (int) $counts->opened,
                'clicked' => (int) $counts->clicked,
                'bounced' => (int) $counts->bounced,
                'unsubscribed' => (int) $counts->unsubscribed,
            ],
            'rates' => [
                'delivery' => self::rate($delivered, (int) $counts->total),
                'open' => self::rate((int) $counts->opened, $delivered),
                'click' => self::rate((int) $counts->clicked, $delivered),
                // Click-to-open: of the people who opened it, how many acted.
                // The figure that says whether the *content* worked, as
                // opposed to the subject line.
                'click_to_open' => self::rate((int) $counts->clicked, (int) $counts->opened),
                'bounce' => self::rate((int) $counts->bounced, (int) $counts->total),
                'unsubscribe' => self::rate((int) $counts->unsubscribed, $delivered),
            ],
            /*
             * Both figures per link. Total clicks says how much traffic a link
             * sent; unique says how many people were interested. A "top links"
             * table built on totals alone ranks one enthusiastic reader above
             * ten mildly interested ones.
             */
            'links' => $campaign->links()
                ->orderByDesc('unique_clicks')
                ->limit(15)
                ->get(['id', 'url', 'label', 'total_clicks', 'unique_clicks']),
            'timeline' => $this->timeline($campaign),
            'measurement_note' => TrackingRewriter::enabled()
                ? 'Opens are an estimate: some clients load images automatically and others never do.'
                : 'Tracking is switched off, so opens and clicks are not recorded for this campaign.',
        ]]);
    }

    /**
     * Activity by hour for the first two days, which is where it all happens.
     *
     * Zero-filled, because a chart drawn from sparse rows puts a busy Tuesday
     * next to a busy Friday as though they were consecutive — the bug the
     * ticket dashboard's 30-day series already had to be fixed for.
     */
    private function timeline(NewsletterCampaign $campaign): array
    {
        if ($campaign->started_at === null) {
            return [];
        }

        $rows = NewsletterEvent::where('newsletter_campaign_id', $campaign->id)
            ->whereIn('event_type', ['opened', 'clicked'])
            ->selectRaw("date_format(created_at, '%Y-%m-%d %H:00') as hour, event_type, count(*) as total")
            ->groupBy('hour', 'event_type')
            ->pluck('total', DB::raw("concat(hour, '|', event_type)"))
            ->all();

        $series = [];
        $cursor = $campaign->started_at->copy()->startOfHour();

        for ($i = 0; $i < 48; $i++) {
            $key = $cursor->format('Y-m-d H:00');

            $series[] = [
                'hour' => $cursor->toIso8601String(),
                'opened' => (int) ($rows[$key.'|opened'] ?? 0),
                'clicked' => (int) ($rows[$key.'|clicked'] ?? 0),
            ];

            $cursor->addHour();
        }

        return $series;
    }

    /** Null rather than zero when there is nothing to divide by. */
    private static function rate(int $part, int $whole): ?float
    {
        return $whole === 0 ? null : round($part / $whole * 100, 1);
    }
}
