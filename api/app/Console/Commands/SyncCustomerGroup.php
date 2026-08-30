<?php

namespace App\Console\Commands;

use App\Support\Newsletter\CustomerGroupSync;
use Illuminate\Console\Command;

/**
 * Keep the "Existing customers" group in step with the customer table.
 *
 * Scheduled as well as hooked on the model, because the two catch different
 * things: the hook is immediate and covers the ordinary path, and the sweep
 * catches whatever reached the table without firing an event — a seeder, a
 * mass update, an import, a row edited in the database by hand.
 */
class SyncCustomerGroup extends Command
{
    protected $signature = 'technoware:sync-customer-group';

    protected $description = 'Bring the Existing customers newsletter group in line with the portal customer list';

    public function handle(): int
    {
        $tally = CustomerGroupSync::run();

        $this->info(sprintf(
            '%d members. Added %d, removed %d, %d skipped as unsubscribed.',
            $tally['members'], $tally['added'], $tally['removed'], $tally['suppressed'],
        ));

        return self::SUCCESS;
    }
}
