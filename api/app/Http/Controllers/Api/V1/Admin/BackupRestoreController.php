<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Backup;
use App\Models\BackupRestore;
use App\Support\Backups\Destinations\Destinations;
use App\Support\Backups\RestoreRunner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Restoring from the console.
 *
 * `role:admin`, the word RESTORE typed, and the activity log records who
 * asked. The worker takes a safety copy of the current database before it
 * replaces anything, so restoring the wrong backup is itself undoable — which
 * is why this is allowed from a browser at all.
 */
class BackupRestoreController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'backup_id' => ['nullable', 'integer', 'required_without:folder'],
            'from' => ['nullable', 'string', Rule::in(['local', ...Destinations::KEYS])],
            'destination' => ['nullable', 'required_with:folder', Rule::in(Destinations::KEYS)],
            'folder' => ['nullable', 'string', 'max:80'],
            'scope' => ['required', Rule::in(BackupRestore::SCOPES)],
            'prune_missing' => ['sometimes', 'boolean'],
            'confirm' => ['required', 'string'],
        ]);

        if (trim($data['confirm']) !== 'RESTORE') {
            throw ValidationException::withMessages(['confirm' => 'Type RESTORE, in capitals, to confirm.']);
        }

        if (isset($data['backup_id'])) {
            $backup = Backup::query()->find($data['backup_id']) ?? throw ValidationException::withMessages(['backup_id' => 'That backup is not on record.']);
            $source = ['kind' => 'local', 'folder' => $backup->folder, 'from' => $data['from'] ?? null];
        } else {
            $source = ['kind' => 'remote', 'destination' => $data['destination'], 'folder' => $data['folder']];
        }

        try {
            $restore = RestoreRunner::plan($source, $data['scope'], (bool) ($data['prune_missing'] ?? false), $request->user()?->id, $request->user()?->name);
        } catch (\RuntimeException $e) {
            throw ValidationException::withMessages(['backup_id' => $e->getMessage()]);
        }

        return response()->json(['data' => self::summary($restore)], 202);
    }

    public function show(BackupRestore $backupRestore): JsonResponse
    {
        return response()->json(['data' => self::summary($backupRestore)]);
    }

    /** Stop a restore before it has replaced anything. */
    public function destroy(BackupRestore $backupRestore): JsonResponse
    {
        if (! in_array($backupRestore->status, ['pending', 'safety', 'downloading'], true)) {
            throw ValidationException::withMessages(['restore' => 'A restore that has started replacing the database or the files cannot be stopped half-way.']);
        }

        RestoreRunner::cancel($backupRestore);

        return response()->json(['data' => self::summary($backupRestore)]);
    }

    /** @return array<string, mixed> */
    public static function summary(BackupRestore $restore): array
    {
        $progress = $restore->progress ?? [];
        $chain = (array) $restore->chain;
        $target = $chain === [] ? [] : end($chain);
        $import = (array) ($progress['import'] ?? []);

        return [
            'id' => $restore->id,
            'status' => $restore->status,
            'scope' => $restore->scope,
            'prune_missing' => $restore->prune_missing,
            'source' => $restore->source,
            'folder' => $target['folder'] ?? null,
            'chain' => array_map(fn ($m) => ['folder' => $m['folder'] ?? null, 'type' => $m['type'] ?? null], $chain),
            'error' => $restore->error,
            'created_by' => $restore->created_by_name,
            'created_at' => $restore->created_at?->toIso8601String(),
            'started_at' => $restore->started_at?->toIso8601String(),
            'finished_at' => $restore->finished_at?->toIso8601String(),
            'safety_folder' => $restore->safety_backup_id ? Backup::query()->whereKey($restore->safety_backup_id)->value('folder') : null,
            'progress' => [
                'downloaded' => count((array) ($progress['downloaded'] ?? [])),
                'current' => $progress['current'] ?? null,
                'statements' => (int) (((array) ($import['cursor'] ?? []))['statements'] ?? 0),
                'sql_percent' => ($import['size'] ?? 0) > 0 ? (int) round(100 * (int) (((array) $import['cursor'])['offset'] ?? 0) / (int) $import['size']) : null,
                'files_written' => (int) (($progress['files'] ?? [])['written'] ?? 0),
                'files_refused' => (int) (($progress['files'] ?? [])['refused'] ?? 0),
                'files_removed' => (int) (($progress['files'] ?? [])['removed'] ?? 0),
                'migrated' => (bool) ($progress['migrated'] ?? false),
            ],
        ];
    }
}
