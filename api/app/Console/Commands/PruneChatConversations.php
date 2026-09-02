<?php

namespace App\Console\Commands;

use App\Models\ChatConversation;
use App\Support\Chat\ChatSettings;
use Illuminate\Console\Command;

/**
 * Deletes conversations older than the retention setting.
 *
 * A transcript holds whatever a visitor typed — a name, a phone number, a
 * description of their network — given by somebody with no account to come
 * back and delete it themselves. So deletion is the default rather than a
 * decision, the argument the CV prune is built on, and §43 of the
 * specification is only true if something actually runs.
 *
 * **A seven-day floor**, enforced here rather than in the settings screen: a
 * typo in a text box should not be able to destroy yesterday's conversations.
 * The activity log's prune makes the same call with thirty.
 *
 * Rows go **one at a time** so the model's events fire and the cascade takes
 * the messages and the events with them — a mass `delete()` skips both, and
 * fast-and-wrong here is a table of orphaned messages holding exactly the
 * personal data this command exists to remove.
 */
class PruneChatConversations extends Command
{
    protected $signature = 'technoware:prune-chats';

    protected $description = 'Delete chat conversations past their retention period';

    public function handle(): int
    {
        $days = max(7, ChatSettings::retentionDays());
        $cutoff = now()->subDays($days);

        $deleted = 0;

        ChatConversation::where('created_at', '<', $cutoff)
            ->lazyById(200)
            ->each(function (ChatConversation $conversation) use (&$deleted) {
                $conversation->delete();
                $deleted++;
            });

        $this->info("Deleted {$deleted} conversation(s) older than {$days} days.");

        return self::SUCCESS;
    }
}
