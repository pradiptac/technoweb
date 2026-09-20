<?php

namespace App\Console\Commands;

use App\Enums\CommentStatus;
use App\Models\BlogComment;
use App\Models\Setting;
use Illuminate\Console\Command;

/**
 * Deletes comments that were filed as spam or binned a while ago.
 *
 * **Only spam and trash.** A published comment is part of the article now and
 * a waiting one is somebody's unanswered contribution — neither ages out.
 * What accumulates is the refuse, and on a blog that attracts any spam at all
 * that is the overwhelming majority of the table.
 *
 * Ranging on `updated_at`, which is when the decision was taken, rather than
 * `created_at`: a comment posted a year ago and filed this morning has just
 * been read, and dating it by when it arrived would delete the evidence of a
 * decision that is a day old.
 *
 * Thirty days, with a **seven-day floor** so a typo cannot empty the spam
 * folder somebody is halfway through reviewing. It matters that spam is kept
 * for a while: it is the only way to find a real comment that was filed by
 * mistake, which is the failure this whole module is arranged to avoid.
 */
class PruneComments extends Command
{
    protected $signature = 'technoware:prune-comments';

    protected $description = 'Delete spam and binned blog comments past the retention period';

    public function handle(): int
    {
        $days = max(7, (int) (Setting::get('comment_retention_days') ?? 30));

        $deleted = BlogComment::query()
            ->whereIn('status', [CommentStatus::Spam, CommentStatus::Trash])
            ->where('updated_at', '<', now()->subDays($days))
            ->delete();

        $this->info("Deleted {$deleted} spam or binned comment(s) older than {$days} day(s).");

        return self::SUCCESS;
    }
}
