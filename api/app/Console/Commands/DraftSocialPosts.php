<?php

namespace App\Console\Commands;

use App\Support\Social\SocialDrafts;
use Illuminate\Console\Command;

/** Drafts the posts for records that came due after their save (a future publish date). */
class DraftSocialPosts extends Command
{
    protected $signature = 'technoware:draft-social-posts';

    protected $description = 'Draft LinkedIn and X posts for blog posts and press releases that have just gone live';

    public function handle(): int
    {
        $this->info(SocialDrafts::sweep().' record(s) drafted.');

        return self::SUCCESS;
    }
}
