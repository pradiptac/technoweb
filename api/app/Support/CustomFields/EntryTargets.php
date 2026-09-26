<?php

namespace App\Support\CustomFields;

use App\Models\ContentType;
use App\Models\Entry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;

/**
 * The `entry:<type-slug>` half of `Targets`: custom content types.
 *
 * Every entry is one table, so a target here is that table narrowed to a
 * type. The key carries the type's slug because that is what an editor reads
 * in a list of targets; `ContentType` rewrites the keys that name it when its
 * slug changes, so a group does not silently fall off its type on a rename.
 */
final class EntryTargets
{
    public const PREFIX = 'entry:';

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return ContentType::query()->orderBy('sort_order')->orderBy('name')->get(['slug', 'plural'])
            ->map(fn (ContentType $t) => ['value' => self::PREFIX.$t->slug, 'label' => $t->plural])
            ->values()
            ->all();
    }

    public static function type(string $key): ?ContentType
    {
        if (! str_starts_with($key, self::PREFIX)) {
            return null;
        }

        return ContentType::query()->where('slug', substr($key, strlen(self::PREFIX)))->first();
    }

    /** @return Builder<Model>|null */
    public static function query(string $key): ?Builder
    {
        $type = self::type($key);

        /** @var Builder<Model>|null */
        return $type ? Entry::query()->where('content_type_id', $type->id) : null;
    }

    /** @return Builder<Model>|null */
    public static function publicQuery(string $key): ?Builder
    {
        $type = self::type($key);

        if ($type === null || ! $type->is_active) {
            return null;
        }

        /** @var Builder<Model> */
        return Entry::query()->published()->where('content_type_id', $type->id);
    }

    public static function existsRule(string $key): ?Exists
    {
        $type = self::type($key);

        return $type ? Rule::exists('entries', 'id')->where('content_type_id', $type->id) : null;
    }

    /**
     * The type loaded with each entry, so `publicPath()` needs no query per
     * row.
     *
     * @param  Builder<Model>  $query
     * @return Builder<Model>
     */
    public static function withType(string $key, Builder $query): Builder
    {
        return str_starts_with($key, self::PREFIX) ? $query->with('contentType') : $query;
    }
}
