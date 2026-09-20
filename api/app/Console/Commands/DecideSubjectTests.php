<?php

namespace App\Console\Commands;

use App\Enums\CampaignStatus;
use App\Models\NewsletterCampaign;
use App\Support\Newsletter\CampaignSender;
use Illuminate\Console\Command;

/**
 * Names the winning subject on every test whose wait has passed.
 *
 * A campaign testing two subject lines sends its slice and then sits in
 * `sending` with the remainder `held` until `ab_wait_hours` after it
 * started. This runs from the scheduler every ten minutes and releases each
 * one that is due through `CampaignSender::decide()`, which is idempotent —
 * a campaign decided from the console a minute earlier is skipped by its
 * own conditional update. Nothing here is a judgement about the campaign;
 * the rule is in the sender, and the console can overrule it before the
 * clock runs out.
 */
class DecideSubjectTests extends Command
{
    protected $signature = 'technoware:decide-subject-tests';

    protected $description = 'Release the held remainder of every subject test whose wait has passed, under the better subject';

    public function handle(): int
    {
        $due = NewsletterCampaign::query()
            ->where('status', CampaignStatus::Sending->value)
            ->whereNotNull('subject_b')
            ->whereNull('ab_winner')
            ->whereNotNull('started_at')
            ->get()
            ->filter(fn (NewsletterCampaign $c) => $c->abDecideAt()?->isPast() ?? false);

        foreach ($due as $campaign) {
            $result = CampaignSender::decide($campaign);
            if ($result !== null) {
                $this->line(sprintf('%s: subject %s wins, %d released.', $campaign->name, strtoupper($result['winner']), $result['released']));
            }
        }

        $this->info(sprintf('%d test%s decided.', $due->count(), $due->count() === 1 ? '' : 's'));

        return self::SUCCESS;
    }
}
