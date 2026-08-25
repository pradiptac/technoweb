<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

class Setting extends Model
{
    protected $fillable = ['group', 'key', 'value', 'type', 'is_secret'];

    protected function casts(): array
    {
        return ['is_secret' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Cache::forget('settings.all'));
        static::deleted(fn () => Cache::forget('settings.all'));
    }

    /**
     * The stored value, decrypted if this row holds a credential.
     *
     * Encryption is applied here rather than through an `encrypted` cast
     * because only some rows are secret, and a cast applies to the column.
     */
    public function plainValue(): ?string
    {
        if (! $this->is_secret || blank($this->value)) {
            return $this->value;
        }

        try {
            return Crypt::decryptString($this->value);
        } catch (\Throwable) {
            // A value that will not decrypt is almost always APP_KEY having
            // changed. Returning null degrades to "not configured" rather than
            // taking down every page that reads settings.
            Log::warning('Could not decrypt setting', ['key' => $this->key]);

            return null;
        }
    }

    /** Stores a value, encrypting it when the row is marked secret. */
    public function setPlainValue(?string $value): void
    {
        $value = $value === '' ? null : $value;

        $this->value = $value !== null && $this->is_secret
            ? Crypt::encryptString($value)
            : $value;
    }

    /**
     * All settings as a flat key => cast-value map, cached.
     *
     * Secrets are decrypted here too: this is the server-side accessor, and
     * the mail configuration needs the real password. What must never happen
     * is a secret reaching a *response* — that is enforced by the public
     * endpoint's group whitelist and by the admin resource, not here.
     */
    public static function all_cached(): array
    {
        return Cache::rememberForever('settings.all', function () {
            return static::query()->get()->mapWithKeys(fn (self $s) => [
                $s->key => match ($s->type) {
                    'boolean' => filter_var($s->plainValue(), FILTER_VALIDATE_BOOLEAN),
                    'json' => json_decode((string) $s->plainValue(), true),
                    default => $s->plainValue(),
                },
            ])->all();
        });
    }

    /**
     * Drop the cached map.
     *
     * The model events above cover ordinary saves, but a bulk
     * `Setting::where(...)->update(...)` bypasses them entirely — so anything
     * that writes settings that way has to say so.
     */
    public static function flushCache(): void
    {
        Cache::forget('settings.all');
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::all_cached()[$key] ?? $default;
    }
}
