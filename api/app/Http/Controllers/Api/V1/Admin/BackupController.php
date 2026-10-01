<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\Setting;
use App\Support\Backups\BackupPaths;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\BackupSchedule;
use App\Support\Backups\BackupSettings;
use App\Support\Backups\DatabaseDumper;
use App\Support\Backups\Destinations\Destinations;
use App\Support\Backups\FileIndex;
use App\Support\Backups\Manifest;
use App\Support\Backups\RestoreMode;
use App\Support\Backups\RestoreRunner;
use App\Support\Backups\Retention;
use App\Support\QueueHealth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

/**
 * Backups: the list, "Back up now", cancelling and deleting, testing a
 * destination and listing what one holds. `role:admin` — a backup is every
 * customer's details and every ticket attachment in one file. See
 * `docs/backups.md`.
 */
class BackupController extends Controller
{
    public function index(): JsonResponse
    {
        $backups = Backup::query()->with('uploads')->where('folder', '!=', 'not-started')->latest('id')->limit(60)->get();
        $restore = BackupRestore::query()->latest('id')->first();

        return response()->json([
            'data' => $backups->map(fn (Backup $b) => self::summary($b))->all(),
            'meta' => [
                'running' => ($running = Backup::query()->inFlight()->with('uploads')->latest('id')->first()) ? self::summary($running) : null,
                'restore' => $restore ? BackupRestoreController::summary($restore) : null,
                'restoring' => RestoreMode::active(),
                'last_success' => Backup::query()->where('status', 'completed')->whereNotIn('trigger', Backup::SAFETY_TRIGGERS)->latest('id')->value('finished_at'),
                'next_run' => BackupSchedule::next()?->toIso8601String(),
                'schedule' => [
                    'enabled' => BackupSettings::enabled(),
                    'time' => BackupSettings::time(),
                    'full_day' => BackupSettings::fullDay(),
                    'incremental_every' => BackupSettings::incrementalEvery(),
                    'keep_chains' => BackupSettings::keepChains(),
                ],
                'includes' => BackupSettings::includes(),
                'destinations' => Destinations::describe(),
                'error' => Setting::get('backup_error'),
                'scheduler' => QueueHealth::scheduler(),
                'dumper' => ['chosen' => DatabaseDumper::choose(), 'binary' => DatabaseDumper::binary() !== null],
                'disk_free' => self::diskFree(),
                'code_schema' => Manifest::codeSchema(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['required', Rule::in(['full', 'incremental'])]]);

        if (! self::running()) {
            throw ValidationException::withMessages(['type' => 'The scheduler is not running on this server, so the backup would never start. Add the cron entry `* * * * * cd /path/to/api && php artisan schedule:run`, or run `php artisan technoware:backup --wait` at a terminal.']);
        }

        if (Backup::query()->inFlight()->exists() || BackupRestore::query()->inFlight()->exists()) {
            throw ValidationException::withMessages(['type' => 'A backup or a restore is already running. Wait for it, or cancel it, first.']);
        }

        $includes = BackupSettings::includes();
        $needed = (int) (DatabaseDumper::estimatedBytes() * ($includes['database'] ? 1 : 0));

        if ($data['type'] === 'full') {
            $trees = array_values(array_filter(['public', 'private'], fn ($t) => $includes[$t]));
            $needed += array_sum(array_map(fn ($meta) => $meta[0], FileIndex::build($trees)));
        }

        $free = self::diskFree();

        if ($free !== null && $needed * 1.2 > $free) {
            throw ValidationException::withMessages(['type' => 'This server has '.self::megabytes($free).' free and the backup needs about '.self::megabytes((int) ($needed * 1.2)).' to be built in. Free some space first.']);
        }

        try {
            $backup = BackupRunner::start($data['type'], 'manual', $request->user()?->id, $request->user()?->name);
        } catch (\RuntimeException $e) {
            throw ValidationException::withMessages(['type' => $e->getMessage()]);
        }

        return response()->json(['data' => self::summary($backup->load('uploads'))], 202);
    }

    public function show(Backup $backup): JsonResponse
    {
        return response()->json(['data' => self::summary($backup->load('uploads'), detail: true)]);
    }

    /** Cancel one running, or delete a finished one that nothing builds on. */
    public function destroy(Backup $backup): JsonResponse
    {
        if (in_array($backup->status, Backup::IN_FLIGHT, true)) {
            Cache::put('backups:cancel:'.$backup->id, true, now()->addHour());
            $backup->update(['status' => 'cancelled', 'finished_at' => now(), 'error' => 'Cancelled.']);

            return response()->json(['data' => self::summary($backup->load('uploads'))]);
        }

        if (Backup::query()->where('parent_id', $backup->id)->orWhere('base_id', $backup->id)->exists()) {
            throw ValidationException::withMessages(['backup' => 'Newer incremental backups are built on this one, and would be unrestorable without it. Delete those first — or let retention remove the whole chain.']);
        }

        Retention::delete($backup);

        return response()->json(null, 204);
    }

    /** A file of a backup this server still holds, under its own name. */
    public function download(Backup $backup, string $file): BinaryFileResponse
    {
        $names = array_merge(array_column((array) $backup->files, 'name'), ['manifest.json']);
        if (! in_array($file, $names, true)) {
            abort(404);
        }

        $path = BackupPaths::staging($backup->uuid).DIRECTORY_SEPARATOR.$file;
        abort_unless($backup->local_deleted_at === null && is_file($path), 404, 'That file is no longer on this server. Restore reads it from a destination.');

        return response()->download($path, $backup->folder.'-'.$file);
    }

    public function test(string $destination): JsonResponse
    {
        abort_unless(in_array($destination, Destinations::KEYS, true), 404);

        if (! Destinations::configured($destination)) {
            return response()->json(['message' => 'Save the settings for '.Destinations::LABELS[$destination].' first.'], 422);
        }

        try {
            $message = Destinations::make($destination)->probe();
        } catch (\Throwable $e) {
            $why = mb_substr(trim($e->getMessage()) ?: $e::class, 0, 400);
            Destinations::fail($destination, $why);

            return response()->json(['message' => $why], 422);
        }

        Destinations::clear($destination);

        return response()->json(['data' => ['message' => $message]]);
    }

    /** What a destination holds: its backup folders, newest first, with their manifests. */
    public function folders(string $destination): JsonResponse
    {
        abort_unless(in_array($destination, Destinations::KEYS, true), 404);

        try {
            $dest = Destinations::make($destination);
            $folders = array_values(array_filter($dest->folders(), [Manifest::class, 'validFolder']));
            rsort($folders);
            $rows = [];

            foreach (array_slice($folders, 0, 30) as $folder) {
                try {
                    $manifest = RestoreRunner::remoteManifest($dest, $folder);
                    $rows[] = [
                        'folder' => $folder,
                        'complete' => true,
                        'type' => $manifest['type'],
                        'created_at' => $manifest['created_at'] ?? null,
                        'includes' => $manifest['includes'] ?? [],
                        'total_bytes' => array_sum(array_column((array) $manifest['files'], 'size')),
                        'chain' => $manifest['chain'] ?? [],
                        'newer_schema' => filled($manifest['schema'] ?? null) && strcmp((string) $manifest['schema'], Manifest::codeSchema()) > 0,
                    ];
                } catch (\RuntimeException $e) {
                    $rows[] = ['folder' => $folder, 'complete' => false, 'error' => $e->getMessage()];
                }
            }
        } catch (\Throwable $e) {
            return response()->json(['message' => mb_substr($e->getMessage(), 0, 400)], 422);
        }

        return response()->json(['data' => $rows, 'meta' => ['total' => count($folders)]]);
    }

    /** Forget the SFTP host key pinned on first contact, after a server was rebuilt. */
    public function forgetKey(): JsonResponse
    {
        Setting::put('backup_ftp_sftp_fingerprint', null);

        return response()->json(['data' => ['fingerprint' => null]]);
    }

    /** @return array<string, mixed> */
    public static function summary(Backup $backup, bool $detail = false): array
    {
        $progress = $backup->progress ?? [];
        $uploads = $backup->relationLoaded('uploads') ? $backup->uploads : $backup->uploads()->get();

        $summary = [
            'id' => $backup->id,
            'uuid' => $backup->uuid,
            'folder' => $backup->folder,
            'type' => $backup->type,
            'trigger' => $backup->trigger,
            'status' => $backup->status,
            'error' => $backup->error,
            'includes' => $backup->includes,
            'base_id' => $backup->base_id,
            'parent_id' => $backup->parent_id,
            'dumper' => $backup->dumper,
            'db_bytes' => $backup->db_bytes,
            'file_count' => $backup->file_count,
            'files_bytes' => $backup->files_bytes,
            'deleted_count' => $backup->deleted_count,
            'total_bytes' => $backup->total_bytes,
            'created_by' => $backup->created_by_name,
            'created_at' => $backup->created_at?->toIso8601String(),
            'started_at' => $backup->started_at?->toIso8601String(),
            'finished_at' => $backup->finished_at?->toIso8601String(),
            'local' => $backup->local_deleted_at === null && in_array($backup->status, Backup::DONE, true),
            'destinations' => collect($backup->destinations ?? [])->map(function (string $key) use ($uploads) {
                $rows = $uploads->where('destination', $key);

                return [
                    'key' => $key,
                    'label' => Destinations::LABELS[$key] ?? $key,
                    'status' => match (true) {
                        $rows->isEmpty() => 'waiting',
                        $rows->every(fn ($u) => $u->status === 'done') => 'done',
                        $rows->contains(fn ($u) => $u->status === 'failed') => 'failed',
                        default => 'uploading',
                    },
                    'bytes_sent' => (int) $rows->sum(fn ($u) => $u->status === 'done' ? $u->size : $u->bytes_sent),
                    'bytes' => (int) $rows->sum('size'),
                    'error' => $rows->firstWhere('status', 'failed')?->error,
                ];
            })->values()->all(),
            'restorable_from' => in_array($backup->status, Backup::DONE, true) ? $backup->restorableFrom() : [],
            'progress' => [
                'archived' => (int) (($progress['archive'] ?? [])['pos'] ?? 0),
                'volumes' => count((array) (($progress['archive'] ?? [])['volumes'] ?? [])),
                'dump_table' => isset($progress['dump']['tables'], $progress['dump']['t']) ? ($progress['dump']['tables'][$progress['dump']['t']] ?? null) : null,
            ],
        ];

        if ($detail) {
            $summary['files'] = $backup->files ?? [];
            $summary['chain'] = array_map(fn (Backup $b) => ['id' => $b->id, 'folder' => $b->folder, 'type' => $b->type], $backup->chain());
        }

        return $summary;
    }

    /** Whether something will pick a backup up: the scheduler, or the tests' sync queue. */
    private static function running(): bool
    {
        return (QueueHealth::scheduler()['running'] ?? false) || config('queue.default') === 'sync';
    }

    private static function diskFree(): ?int
    {
        $free = @disk_free_space(BackupPaths::ensure(BackupPaths::stagingRoot()));

        return $free === false ? null : (int) $free;
    }

    private static function megabytes(int $bytes): string
    {
        return number_format($bytes / 1048576, 0).' MB';
    }
}
