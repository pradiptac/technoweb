<?php

namespace App\Console\Commands;

use App\Support\SignInCodes;
use Illuminate\Console\Command;

/**
 * Deletes sign-in codes that expired a while ago.
 *
 * Not a retention policy, unlike the activity log and the CV prune — there is
 * nothing here worth keeping and nothing anybody is entitled to see. A row is
 * a hash, an address and two timestamps, and it stops being useful ten minutes
 * after it is written.
 *
 * The delay before deletion is the only decision in the file. Twenty-four
 * hours rather than on expiry, so that "it says my code is no longer valid" is
 * answerable while the row that refused it still exists — an expired code and a
 * code that was never issued are deliberately indistinguishable to whoever is
 * at the form, which leaves this table as the only place the difference is
 * recorded.
 *
 * There is deliberately no floor here, and no setting. Nothing turns on how
 * long these are kept, so a number in the console would be a decision nobody
 * has any grounds to make.
 */
class PruneSignInCodes extends Command
{
    protected $signature = 'technoware:prune-sign-in-codes {--hours=24 : How long after expiry to keep a code}';

    protected $description = 'Delete one-time sign-in codes that expired more than a day ago';

    public function handle(): int
    {
        $hours = max(1, (int) $this->option('hours'));

        $deleted = SignInCodes::prune($hours);

        $this->info("Deleted {$deleted} sign-in code(s) that expired more than {$hours} hour(s) ago.");

        return self::SUCCESS;
    }
}
