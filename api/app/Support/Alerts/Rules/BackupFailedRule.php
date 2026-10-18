<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Models\Backup;
use App\Models\Setting;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Backups\BackupSettings;
use Carbon\Carbon;
use Illuminate\Support\Collection;

final class BackupFailedRule implements AlertRule
{
    public function key(): string
    {
        return 'backup_failed';
    }

    public function role(): Role
    {
        return Role::Admin;
    }

    public function label(): string
    {
        return 'A backup that failed or did not run';
    }

    public function thresholdLabel(): ?string
    {
        return null;
    }

    /** Scheduled and manual backups only: a safety copy before a restore or an update is not the schedule. */
    public function current(): Collection
    {
        if (! BackupSettings::enabled()) {
            return collect();
        }
        $latest = Backup::query()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)
            ->whereIn('status', ['completed', 'completed_with_errors', 'failed'])->latest('id')->first();
        if ($latest !== null && $latest->status !== 'completed') {
            return collect([new AlertHit('backup:'.$latest->id, 'The latest backup did not complete everywhere.', '/admin/backups')]);
        }
        // A daily schedule is late after 36 hours, a weekly one (full on one day, no incrementals) after eight days.
        $daily = BackupSettings::incrementalEvery() !== null || BackupSettings::fullDay() === 'daily';
        $window = $daily ? 36 : 8 * 24;
        $last = Backup::query()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->where('status', 'completed')->max('finished_at');
        // Never completed: counted from when backups were switched on, so switching them on alerts nobody at once.
        $since = $last ?? Setting::query()->where('key', 'backup_enabled')->value('updated_at');
        if ($since === null || Carbon::parse($since)->greaterThanOrEqualTo(now()->subHours($window))) {
            return collect();
        }

        return collect([new AlertHit('stale', 'No backup has completed in '.($daily ? '36 hours' : '8 days').'.', '/admin/backups')]);
    }
}
