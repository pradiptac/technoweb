<?php

namespace App\Console\Commands;

use App\Models\StaffNotification;
use Illuminate\Console\Command;

/** Nightly (docs/notifications.md). A bell row is a pointer, not a record: ninety days is plenty. */
class PruneStaffNotifications extends Command
{
    protected $signature = 'technoware:prune-staff-notifications';

    protected $description = 'Delete bell notifications more than 90 days old';

    public function handle(): int
    {
        $n = StaffNotification::query()->where('created_at', '<', now()->subDays(90))->delete();
        $this->info("{$n} deleted.");

        return self::SUCCESS;
    }
}
