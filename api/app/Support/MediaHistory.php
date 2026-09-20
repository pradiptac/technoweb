<?php

namespace App\Support;

use App\Models\Media;
use App\Models\MediaVersion;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Keeps the previous bytes of a file that is about to be rewritten.
 *
 * Every editing endpoint writes in place, because the path is the identity
 * records store and keeping it is what lets an edit reach every page already
 * using the image. The cost is that an edit is destructive, and this is the
 * counterweight: one copy of what was there before, restorable in a click.
 *
 * **Called before the edit, never after.** Afterwards the original bytes are
 * gone and there is nothing left to copy — which sounds obvious and is exactly
 * the ordering mistake that would make this class look like it worked while
 * archiving the *new* version every time.
 */
class MediaHistory
{
    /**
     * How many versions a file keeps.
     *
     * A cap rather than everything, because these are full copies on the
     * public disk: a 4MB photograph cropped ten times is 40MB of history for
     * one picture. Ten is enough to undo a session's worth of mistakes and few
     * enough that the library cannot quietly become its own backup system.
     */
    public const KEEP = 10;

    /**
     * Archive the current file, then prune anything past the cap.
     *
     * Returns null when there is nothing to archive — a row whose file has
     * already gone. That is not an error worth failing the edit for: the edit
     * itself will fail on its own, with a message about the thing the person
     * actually asked for.
     */
    public static function snapshot(Media $medium, string $operation, ?int $userId = null): ?MediaVersion
    {
        $disk = Storage::disk($medium->disk);

        if (! $disk->exists($medium->path)) {
            return null;
        }

        $extension = pathinfo($medium->path, PATHINFO_EXTENSION);
        $path = 'media/versions/'.now()->format('Y/m').'/'.Str::random(40).($extension ? '.'.$extension : '');

        $disk->copy($medium->path, $path);

        $version = MediaVersion::create([
            'media_id' => $medium->id,
            'created_by' => $userId,
            'disk' => $medium->disk,
            'path' => $path,
            'mime' => $medium->mime,
            'size' => $medium->size,
            'width' => $medium->width,
            'height' => $medium->height,
            'operation' => $operation,
        ]);

        self::prune($medium);

        return $version;
    }

    /**
     * Restore a version's bytes over the live file.
     *
     * The restore is itself an edit, so the *current* bytes are archived first
     * — otherwise restoring an older version to compare would throw away the
     * newer one, and "undo" would be a one-way door. The version being
     * restored is then consumed: keeping it would leave two identical copies
     * in a list whose whole purpose is showing what is different.
     */
    public static function restore(Media $medium, MediaVersion $version, ?int $userId = null): bool
    {
        $disk = Storage::disk($version->disk);

        if (! $disk->exists($version->path)) {
            return false;
        }

        self::snapshot($medium, 'restore', $userId);

        $disk->put($medium->path, $disk->get($version->path));

        $medium->update([
            'mime' => $version->mime,
            'size' => $version->size,
            'width' => $version->width,
            'height' => $version->height,
        ]);

        $version->delete();

        return true;
    }

    /**
     * Drop everything past the cap, oldest first.
     *
     * One row at a time, because the model's `deleting` hook is what removes
     * the file — a mass `delete()` skips model events and leaves a folder of
     * orphaned copies nothing points at. The same reasoning as the CV prune
     * and the landing-page repath.
     */
    public static function prune(Media $medium): void
    {
        $surplus = MediaVersion::where('media_id', $medium->id)
            ->orderByDesc('id')
            ->skip(self::KEEP)
            ->take(100)
            ->get();

        foreach ($surplus as $version) {
            $version->delete();
        }
    }
}
