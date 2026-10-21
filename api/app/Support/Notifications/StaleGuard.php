<?php

namespace App\Support\Notifications;

use App\Models\ContentRevision;
use App\Models\User;
use App\Support\ActivityLogger;
use App\Support\Revisions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Throwable;

/**
 * Refuses a save that would overwrite somebody's newer one (C2,
 * docs/notifications.md). Only a form that sends `base_updated_at` is checked,
 * so scripts, imports, bulk actions and the AI drafts are untouched. Compared
 * to the second: two saves inside one second are a known gap.
 */
final class StaleGuard
{
    public static function check(Request $request, Model $model): void
    {
        $raw = $request->input('base_updated_at');
        $stored = $model->getAttribute('updated_at');
        if (! is_string($raw) || $raw === '' || ! $stored instanceof Carbon) {
            return;
        }
        try {
            $base = Carbon::parse($raw);
        } catch (Throwable) {
            return;
        }
        if ($stored->getTimestamp() <= $base->getTimestamp()) {
            return;
        }

        $caller = $request->user();
        if ($request->boolean('overwrite')) {
            if ($caller instanceof User) {
                ActivityLogger::overwrote($caller, $model, $stored->toIso8601String(), $request);
            }

            return;
        }

        $by = self::lastSavedBy($model);
        $at = $stored->copy()->timezone((string) config('app.timezone'));
        $when = $at->isToday() ? $at->format('H:i') : $at->format('j F').' at '.$at->format('H:i');
        $message = $by !== null && $caller instanceof User && $by['id'] === $caller->id
            ? "You saved this at {$when} in another tab, after you opened it."
            : (($by['name'] ?? null) ?: 'Somebody')." saved this at {$when}, after you opened it.";

        throw new HttpResponseException(response()->json([
            'message' => $message,
            'errors' => ['stale' => [$message]],
            'meta' => ['stale' => ['at' => $stored->toIso8601String(), 'by' => $by['name'] ?? null]],
        ], 422));
    }

    /**
     * A save is a newer version even when it changed only related rows — the
     * SEO override, FAQs, answer blocks, custom fields, a relation list — which
     * Eloquent does not count as a change of the record. The last line before
     * each of the fourteen update methods answers. Quietly: no revision, no
     * recheck, no webhook for a timestamp.
     */
    public static function touch(Model $model): void
    {
        $model->touchQuietly();
    }

    /** The newest version's author, from page history. @return array{id: ?int, name: ?string}|null */
    public static function lastSavedBy(Model $model): ?array
    {
        $alias = Revisions::aliasFor($model);
        $row = $alias === null ? null : ContentRevision::query()
            ->where('subject_type', $alias)->where('subject_id', $model->getKey())
            ->orderByDesc('id')->first(['user_id', 'actor_name', 'updated_at']);
        $stored = $model->getAttribute('updated_at');

        // A save that changed only related rows (SEO, FAQs) records no version: the newest version then
        // predates the record's own time, and its author is not who saved last — so nobody is named.
        if ($row === null || ($stored instanceof Carbon && $row->updated_at !== null && $row->updated_at->lt($stored->copy()->subSeconds(2)))) {
            return null;
        }

        return ['id' => $row->user_id, 'name' => $row->actor_name];
    }
}
