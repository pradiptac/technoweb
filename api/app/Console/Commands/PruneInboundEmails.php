<?php

namespace App\Console\Commands;

use App\Models\InboundEmail;
use Illuminate\Console\Command;

/**
 * Deletes old rows from the inbound email ledger.
 *
 * The ledger's unique Message-ID index is what stops a redelivered message
 * opening a second ticket, so a row must outlive any plausible redelivery —
 * a mailbox restored from backup, a message dragged back into the inbox
 * weeks later. 180 days is well past that; anything older is a line in a
 * log nobody reads, and the ticket it became keeps its own history. A fixed
 * figure rather than a setting, because nothing on the screen depends on
 * how long the log is.
 */
class PruneInboundEmails extends Command
{
    public const DAYS = 180;

    protected $signature = 'technoware:prune-inbound-emails';

    protected $description = 'Delete inbound email ledger rows older than six months';

    public function handle(): int
    {
        $deleted = InboundEmail::where('created_at', '<', now()->subDays(self::DAYS))->delete();

        $this->info("Deleted {$deleted} inbound email record(s) older than ".self::DAYS.' days.');

        return self::SUCCESS;
    }
}
