<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Models\Backup;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Backups\BackupSettings;
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
        $recent = Backup::query()->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->where('status', 'completed')
            ->where('finished_at', '>=', now()->subHours(36))->exists();

        return collect($recent ? [] : [new AlertHit('stale', 'No backup has completed in 36 hours.', '/admin/backups')]);
    }
}
