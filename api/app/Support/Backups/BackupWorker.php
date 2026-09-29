<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Models\BackupRestore;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * The one thing that moves backups and restores along: a restore first, then
 * a backup, then — when neither is running — whether the schedule wants one.
 *
 * **Run by the scheduler, not the queue.** `technoware:backups-work` every
 * minute, in the background, for `backups.budget_seconds`. The queue would
 * have been the house pattern (`RunWordPressImport`), and it is the wrong
 * one here for one reason: during a restore nothing else may touch the
 * database, and the queue worker is exactly the thing that would — a
 * campaign batch, a reminder, a webhook, writing into tables that are
 * half-rebuilt. So while `RestoreMode` is on, the scheduler skips every
 * event except this one and its own heartbeat, and the queue simply is not
 * drained until the restore is done. A restore that needed the queue could
 * not do that.
 *
 * A cache lock keeps it to one worker at a time, whether started by the
 * scheduler or by `technoware:backup --wait` at a terminal.
 */
final class BackupWorker
{
    public const LOCK = 'backups-worker';

    /** Work until the deadline or until nothing is left. Returns what it did, for the command's output. */
    public static function run(CarbonImmutable $deadline): string
    {
        $lock = Cache::lock(self::LOCK, max(60, (int) CarbonImmutable::now()->diffInSeconds($deadline, true)) + 120);

        if (! $lock->get()) {
            return 'Another backup worker is running.';
        }

        $did = [];

        try {
            while (CarbonImmutable::now()->lessThan($deadline)) {
                if ($restore = BackupRestore::query()->inFlight()->orderBy('id')->first()) {
                    $finished = RestoreRunner::advance($restore, $deadline);
                    $did[] = "restore {$restore->id}: {$restore->fresh()?->status}";

                    if (! $finished) {
                        break;
                    }

                    continue;
                }

                if ($backup = Backup::query()->inFlight()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->orderBy('id')->first()) {
                    $finished = BackupRunner::advance($backup, $deadline);
                    $did[] = "backup {$backup->folder}: {$backup->fresh()?->status}";

                    if (! $finished) {
                        break;
                    }

                    continue;
                }

                if ($type = BackupSchedule::due()) {
                    try {
                        $backup = BackupRunner::start($type, 'schedule');
                        $did[] = "started {$backup->folder}";
                    } catch (\RuntimeException $e) {
                        BackupAlerts::failed('The scheduled backup could not start: '.$e->getMessage());
                        // Record the attempt, or the schedule would ask again every minute.
                        Backup::query()->create([
                            'uuid' => (string) Str::uuid(),
                            'type' => Backup::FULL,
                            'trigger' => 'schedule',
                            'status' => 'failed',
                            'folder' => 'not-started',
                            'includes' => [],
                            'destinations' => [],
                            'error' => $e->getMessage(),
                            'finished_at' => now(),
                        ]);
                    }

                    continue;
                }

                break;
            }
        } finally {
            $lock->release();
        }

        return $did === [] ? 'Nothing to do.' : implode('; ', $did);
    }
}
