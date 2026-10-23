<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Support\PaginatedEnvelope;
use BackedEnum;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What every `/ext` list shares: `?since=` on `updated_at`, `?per_page=`, a
 * stable order (oldest change first, then id, so a page boundary never shows
 * a row twice) and the house `{data, meta, links}` envelope.
 */
final class ExtList
{
    /** @param  callable(mixed): array<string, mixed>  $map */
    public static function page(Request $request, Builder $query, callable $map): JsonResponse
    {
        $request->validate([
            'since' => ['nullable', 'string', fn ($a, $v, $fail) => self::since($v) ?? $fail('Give `since` as an ISO 8601 date and time.')],
            'per_page' => 'nullable|integer|between:1,100',
        ]);

        if ($request->filled('since')) {
            $query->where('updated_at', '>=', self::since($request->query('since')));
        }

        $rows = $query->orderBy('updated_at')->orderBy('id')
            ->paginate($request->integer('per_page') ?: 50)->withQueryString();
        $rows->through($map);

        return response()->json(PaginatedEnvelope::from($rows));
    }

    /**
     * `since` as an instant in the app's timezone, which is what `updated_at`
     * is stored in; ISO 8601 only (not strtotime's "yesterday").
     */
    private static function since(mixed $value): ?Carbon
    {
        foreach (['Y-m-d\TH:i:sp', 'Y-m-d\TH:i:s.up', 'Y-m-d\TH:ip'] as $format) {
            if (Carbon::canBeCreatedFromFormat($value, $format)) {
                return Carbon::createFromFormat($format, $value)->setTimezone(config('app.timezone'));
            }
        }

        return Carbon::canBeCreatedFromFormat($value, '!Y-m-d')
            ? Carbon::createFromFormat('!Y-m-d', $value, config('app.timezone'))
            : null;
    }

    /**
     * Narrow by a status query value; an unknown one is ignored, so a stale
     * integration gets everything rather than an error.
     *
     * @param  class-string<BackedEnum>  $enum
     */
    public static function status(Request $request, Builder $query, string $enum): void
    {
        $status = $enum::tryFrom((string) $request->query('status'));
        if ($status !== null) {
            $query->where('status', $status);
        }
    }

    public static function notFound(): JsonResponse
    {
        return response()->json(['message' => 'Not found.'], 404);
    }
}
