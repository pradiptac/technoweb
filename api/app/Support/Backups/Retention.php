<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Support\Backups\Destinations\Destinations;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;

/**
 * What is kept and what is deleted, run after every finished backup.
 *
 *  - **Chains, whole.** The newest `backup_keep_chains` fulls are kept with
 *    every incremental built on them; anything older goes, full and
 *    incrementals together, from every destination and from this server. An
 *    incremental is never deleted out from under its full, nor a full from
 *    under its incrementals, because either leaves backups that cannot be
 *    restored while still looking like backups.
 *  - **Staging copies.** The newest `backup_keep_local` finished backups
 *    stay on this server as well; the rest keep only their file index. A
 *    backup that reached no destination at all keeps its copy whatever the
 *    setting — it is the only one there is.
 *  - **Failures and safety copies.** A failed or cancelled backup is cleared
 *    after two days, a pre-restore safety copy after fourteen.
 *
 * Deleting from a destination is best effort: a destination that is down
 * today is tried again after the next backup, and a folder it keeps is space,
 * not a wrong answer.
 */
final class Retention
{
    public static function apply(): void
    {
        $keep = BackupSettings::keepChains();
        $fulls = Backup::query()->done()->where('type', Backup::FULL)->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->orderByDesc('id')->get();

        foreach ($fulls->slice($keep) as $full) {
            $chain = Backup::query()->where('base_id', $full->id)->get()->push($full);
            $chain->each(fn (Backup $b) => self::delete($b));
        }

        Backup::query()->whereIn('status', ['failed', 'cancelled'])->where('updated_at', '<', now()->subDays(2))->get()
            ->each(fn (Backup $b) => self::delete($b));

        Backup::query()->whereIn('trigger', Backup::SAFETY_TRIGGERS)->where('created_at', '<', now()->subDays(14))->whereNotIn('status', Backup::IN_FLIGHT)->get()
            ->each(fn (Backup $b) => self::delete($b));

        $local = BackupSettings::keepLocal();
        $held = Backup::query()->done()->whereNull('local_deleted_at')->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->orderByDesc('id')->with('uploads')->get();

        foreach ($held->slice($local) as $backup) {
            $reached = array_diff($backup->reachedDestinations(), ['local']);

            if ($reached !== []) {
                File::deleteDirectory(BackupPaths::staging($backup->uuid));
                $backup->update(['local_deleted_at' => now()]);
            }
        }
    }

    /** One backup gone: its folders on every destination it was sent to, its files here, its rows. */
    public static function delete(Backup $backup): void
    {
        foreach ($backup->uploads()->pluck('destination')->unique() as $key) {
            try {
                Destinations::make((string) $key)->deleteFolder($backup->folder);
            } catch (\Throwable $e) {
                Log::warning('Could not delete an old backup from a destination', ['backup' => $backup->id, 'destination' => $key, 'error' => $e->getMessage()]);
            }
        }

        File::deleteDirectory(BackupPaths::staging($backup->uuid));
        @unlink(BackupPaths::indexFile($backup->uuid));
        $backup->uploads()->delete();
        $backup->delete();
    }
}
