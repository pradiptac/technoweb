<?php

namespace App\Console\Commands;

use App\Enums\CampaignStatus;
use App\Models\NewsletterCampaign;
use App\Support\Newsletter\CampaignSender;
use Illuminate\Console\Command;

/**
 * Hand any campaign whose time has come to the queue.
 *
 * Scheduled sending needs something that wakes up and looks, and the scheduler
 * is already that thing — the same cron entry that drains the mail queue. No
 * daemon, no second requirement to deploy.
 *
 * The window is deliberately open-ended backwards: a campaign scheduled for
 * 09:00 on a machine whose scheduler was down until 09:40 should still go, late,
 * rather than be silently skipped for ever. `CampaignSender::queue()` claims
 * each one with a conditional update, so a second run cannot double-send even
 * if two overlap.
 */
class SendScheduledCampaigns extends Command
{
    protected $signature = 'technoware:send-scheduled-campaigns';

    protected $description = 'Queue newsletter campaigns whose scheduled time has passed';

    public function handle(): int
    {
        $due = NewsletterCampaign::where('status', CampaignStatus::Scheduled)
            ->whereNotNull('scheduled_at')
            ->where('scheduled_at', '<=', now())
            ->get();

        if ($due->isEmpty()) {
            $this->info('Nothing scheduled is due.');

            return self::SUCCESS;
        }

        foreach ($due as $campaign) {
            $result = CampaignSender::queue($campaign);

            $this->line($result['queued']
                ? sprintf('Queued "%s" to %d recipients in %d batches.', $campaign->name, $result['recipients'], $result['batches'])
                : sprintf('Skipped "%s": %s', $campaign->name, $result['reason']));
        }

        return self::SUCCESS;
    }
}
