<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\StaffNotificationKind;
use App\Http\Controllers\Controller;
use App\Models\StaffNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The caller's own bell (C2, docs/notifications.md). Staff-wide: every row is the caller's. */
class StaffNotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = (int) $request->user()->id;
        $page = StaffNotification::query()
            ->where('user_id', $userId)
            ->when($request->query('filter', 'unread') !== 'all', fn ($q) => $q->whereNull('read_at'))
            ->orderByDesc('created_at')->orderByDesc('id')
            ->paginate(30);

        return response()->json([
            'data' => $page->getCollection()->map(fn (StaffNotification $n) => self::row($n))->values(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
                'unread' => self::unread($userId),
                'kinds' => StaffNotificationKind::options(),
            ],
        ]);
    }

    public function read(Request $request, int $id): JsonResponse
    {
        $row = StaffNotification::query()->where('user_id', $request->user()->id)->findOrFail($id);
        $row->read_at ??= now();
        $row->save();

        return response()->json(['data' => self::row($row)]);
    }

    public function readAll(Request $request): JsonResponse
    {
        $updated = StaffNotification::query()->where('user_id', $request->user()->id)->whereNull('read_at')->update(['read_at' => now()]);

        return response()->json(['updated' => $updated]);
    }

    public static function unread(int $userId): int
    {
        return StaffNotification::query()->where('user_id', $userId)->whereNull('read_at')->count();
    }

    /** @return array<string, mixed> */
    private static function row(StaffNotification $n): array
    {
        return [
            'id' => $n->id,
            'kind' => $n->kind->value,
            'group' => $n->kind->group(),
            'line' => $n->line,
            'path' => $n->path,
            'actor_name' => $n->actor_name,
            'read_at' => $n->read_at?->toIso8601String(),
            'created_at' => $n->created_at?->toIso8601String(),
        ];
    }
}
