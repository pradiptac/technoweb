<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\NewsletterImport;
use App\Models\SiteImport;
use App\Models\User;
use App\Models\WordPressImport;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Tells whoever started a long job that it is done (C2, docs/notifications.md).
 * `ready` counts for the imports with a review step — that is when the starter
 * has to act. The bell only: a long job does not email its starter.
 */
final class JobFinished
{
    /** @var array<class-string<Model>, array{0: string, 1: string, 2: list<string>}> starter column, path, statuses */
    private const JOBS = [
        WordPressImport::class => ['uploaded_by', '/admin/imports/wordpress', ['ready', 'completed', 'failed']],
        SiteImport::class => ['uploaded_by', '/admin/imports/site', ['ready', 'completed', 'failed']],
        NewsletterImport::class => ['uploaded_by', '/admin/newsletter/subscribers/import', ['ready', 'failed']],
        Backup::class => ['created_by', '/admin/backups', ['completed', 'completed_with_errors', 'failed']],
        BackupRestore::class => ['created_by', '/admin/backups', ['completed', 'failed']],
    ];

    /** Listens on every job model; registered once by the app's service provider. */
    public static function watchAll(): void
    {
        foreach (array_keys(self::JOBS) as $class) {
            $class::updated(function (Model $job) {
                if ($job->wasChanged('status')) {
                    self::tell($job);
                }
            });
        }
    }

    /** For a status written past the model (a query-builder update): the caller passes the fresh row. */
    public static function tell(?Model $job): void
    {
        if ($job === null || ! isset(self::JOBS[$job::class])) {
            return;
        }

        try {
            [$column, $path, $statuses] = self::JOBS[$job::class];
            $status = (string) $job->getAttribute('status');
            if (! in_array($status, $statuses, true)) {
                return;
            }
            // A CSV import has no long wait; only a mailbox scan or a crawl does.
            if ($job instanceof NewsletterImport && ! $job->isScan()) {
                return;
            }
            // A safety copy is a step inside a restore or an update, which reports for itself.
            if ($job instanceof Backup && in_array($job->getAttribute('trigger'), Backup::SAFETY_TRIGGERS, true)) {
                return;
            }
            $starter = User::find($job->getAttribute($column));
            if ($starter === null) {
                return;
            }

            $label = self::label($job);
            $line = match ($status) {
                'failed' => "{$label} failed.",
                'ready' => "{$label} is ready to review.",
                default => "{$label} has finished.",
            };
            Notifications::send($starter, StaffNotificationKind::JobFinished, $line, $path, $job);
        } catch (Throwable $e) {
            Log::warning('Job-finished notification failed', ['job' => $job::class, 'error' => $e->getMessage()]);
        }
    }

    private static function label(Model $job): string
    {
        return match (true) {
            $job instanceof WordPressImport => 'The WordPress import',
            $job instanceof SiteImport => 'The site import',
            $job instanceof NewsletterImport => $job->getAttribute('source') === 'crawl' ? 'The website crawl' : 'The mailbox scan',
            $job instanceof BackupRestore => 'The restore',
            default => 'The backup',
        };
    }
}
