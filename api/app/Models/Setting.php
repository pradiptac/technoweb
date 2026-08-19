<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class Setting extends Model
{
    protected $fillable = ['group', 'key', 'value', 'type'];

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget('settings.all'));
        static::deleted(fn () => Cache::forget('settings.all'));
    }

    /** All settings as a flat key => cast-value map, cached. */
    public static function all_cached(): array
    {
        return Cache::rememberForever('settings.all', function () {
            return static::query()->get()->mapWithKeys(fn (self $s) => [
                $s->key => match ($s->type) {
                    'boolean' => filter_var($s->value, FILTER_VALIDATE_BOOLEAN),
                    'json' => json_decode((string) $s->value, true),
                    default => $s->value,
                },
            ])->all();
        });
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::all_cached()[$key] ?? $default;
    }
}
