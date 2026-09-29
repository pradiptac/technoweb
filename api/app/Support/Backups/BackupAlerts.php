<?php

namespace App\Support\Backups;

use App\Models\Backup;
use App\Models\Setting;
use App\Notifications\BackupFailed;
use App\Support\Notifier;

/**
 * Saying so when a backup did not happen.
 *
 * A backup that fails silently is found out on the day it is needed, which
 * is the worst possible day. So a failure writes `backup_error` — the
 * `mail_error` banner pattern, shown on the Backups screen until the next
 * success clears it — and emails `backups_email`, falling back to the
 * support address. The email goes through `Notifier`, so a mail server that
 * is down cannot turn a failed backup into a failed worker.
 */
final class BackupAlerts
{
    public static function failed(string $message, ?Backup $backup = null): void
    {
        Setting::put('backup_error', mb_substr($message, 0, 480).' — '.now()->toDayDateTimeString());
        Notifier::route('backups_email', new BackupFailed($message, $backup?->folder), Setting::get('support_email'));
    }

    public static function succeeded(Backup $backup): void
    {
        if (! in_array($backup->trigger, Backup::SAFETY_TRIGGERS, true) && filled(Setting::get('backup_error'))) {
            Setting::put('backup_error', null);
        }
    }
}
