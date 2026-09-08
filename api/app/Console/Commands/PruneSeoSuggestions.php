<?php

namespace App\Console\Commands;

use App\Models\SeoSuggestion;
use App\Support\Seo\Ai\SeoAiSettings;
use Illuminate\Console\Command;

/**
 * Deletes AI suggestions past their retention period.
 *
 * This table is a record of what was proposed, not content: once a suggestion
 * has been applied its words live on the record, and once it has been rejected
 * nobody will read it again. Keeping every draft anybody generated for ever
 * turns a useful history into an archive nobody prunes.
 *
 * **A seven-day floor**, enforced here as well as in the settings accessor, so a
 * typo in a text box cannot destroy this week's history — the rule the chat and
 * activity prunes both follow.
 *
 * A mass `delete()` is safe here in a way it is not for chats or CVs: nothing
 * hangs off a suggestion and its model has no `deleting` hook, so there are no
 * events to skip and no files to orphan. Chunked anyway, because deleting a
 * year of rows in one statement is a lock somebody notices.
 */
class PruneSeoSuggestions extends Command
{
    protected $signature = 'technoware:prune-seo-suggestions';

    protected $description = 'Delete stored AI SEO suggestions past their retention period';

    public function handle(): int
    {
        $days = max(7, SeoAiSettings::retentionDays());
        $cutoff = now()->subDays($days);

        $deleted = 0;

        do {
            $batch = SeoSuggestion::where('created_at', '<', $cutoff)->limit(500)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Deleted {$deleted} suggestion(s) older than {$days} days.");

        return self::SUCCESS;
    }
}
