<?php

namespace App\Support\Notifications;

use App\Enums\StaffNotificationKind;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Who a note mentions (C2, docs/notifications.md). The server decides: an id is
 * honoured only while "@Their Name" is still in the saved text, the person is
 * active, can open the screen and is not the author. At most ten. Nothing here
 * ever refuses a note — the `mentions` input is read raw, never validated.
 */
final class Mentions
{
    public const MAX = 10;

    /** @return Collection<int, User> */
    public static function resolve(string $body, mixed $ids, string $path, User $author): Collection
    {
        try {
            $ids = collect(is_array($ids) ? array_slice($ids, 0, 50) : [])
                ->filter(fn ($id) => is_int($id) || (is_string($id) && ctype_digit($id)))
                ->map(fn ($id) => (int) $id)
                ->filter(fn (int $id) => $id > 0 && $id !== $author->id)
                ->unique()->values();
            if ($ids->isEmpty()) {
                return collect();
            }

            return User::query()->whereIn('id', $ids->all())->where('is_active', true)->with('roles')->get()
                ->filter(fn (User $u) => mb_stripos($body, '@'.$u->name) !== false && ScreenAccess::can($u, $path))
                ->take(self::MAX)->values();
        } catch (Throwable $e) {
            Log::warning('Mentions could not be read', ['error' => $e->getMessage()]);

            return collect();
        }
    }

    /** @param Collection<int, User> $people */
    public static function notify(Collection $people, StaffNotificationKind $kind, string $line, string $path, ?Model $subject, User $author): void
    {
        foreach ($people as $person) {
            Notifications::later($person, $kind, $line, $path, $subject, $author);
        }
    }

    /** @return list<array{id: int, name: string}> */
    public static function candidates(string $q, string $path): array
    {
        $like = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($q)).'%';

        return User::query()->where('is_active', true)
            ->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('name', 'like', '% '.$like)->orWhere('email', 'like', $like))
            ->with('roles')->orderBy('name')->limit(50)->get()
            ->filter(fn (User $u) => ScreenAccess::can($u, $path))
            ->take(8)->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name])->values()->all();
    }
}
