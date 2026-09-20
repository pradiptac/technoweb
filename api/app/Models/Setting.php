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
        static::saved(fn () => static::flushCache());
        static::deleted(fn () => static::flushCache());
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
     *
     * **Through `Cache::memo()`, never the plain store.** `Setting::get()` is
     * called from everywhere — the mail provider at boot, a resource per row,
     * the comment gate per post — and on the `database` cache store each
     * `Cache::get` is a query. A blog listing of twelve posts ran 28 queries,
     * 24 of them re-reading this one cached map, and every request paid it at
     * boot before any route code ran. The memoised repository reads the store
     * once per request and answers from memory after that. It is a scoped
     * binding, so it is fresh per request (and per test), which a static
     * property would not be: a `static $memo` survives from one test's
     * application to the next and hands the second test the first one's
     * settings.
     *
     * The other half is that `forget` has to go through the same repository,
     * or the memo goes on answering with the row that was just changed — see
     * `flushCache()`.
     */
    public static function all_cached(): array
    {
        return Cache::memo()->rememberForever('settings.all', function () {
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
     * Every non-secret row as `key => [group, value]`, with the value exactly
     * as stored, cached beside the cast map.
     *
     * The public `/settings` endpoint publishes *strings* — `"0"` and `"1"`,
     * never booleans — because the frontend reads them as strings and a
     * caller reading one value as a number and its neighbour as a string is
     * a trap. `all_cached()` casts, so it cannot feed that endpoint; this map
     * can, and it turned three queries per call into none. Secret rows are
     * left out entirely rather than carried encrypted: nothing that reads
     * this is entitled to a credential, and a map that cannot hold one cannot
     * leak one.
     *
     * @return array<string, array{group: string, value: string|null}>
     */
    public static function rows_cached(): array
    {
        return Cache::memo()->rememberForever('settings.rows', function () {
            return static::query()
                ->where('is_secret', false)
                ->get(['key', 'group', 'value'])
                ->mapWithKeys(fn (self $s) => [$s->key => ['group' => $s->group, 'value' => $s->value]])
                ->all();
        });
    }

    /**
     * Drop the cached map.
     *
     * The model events above cover ordinary saves, but a bulk
     * `Setting::where(...)->update(...)` bypasses them entirely — so anything
     * that writes settings that way has to say so.
     *
     * Forgotten through `Cache::memo()` because that is where it is read: the
     * memoised repository forgets its own copy *and* the store's, whereas a
     * plain `Cache::forget()` clears the store and leaves the request's memo
     * answering with the old map — a save that reads back as not having
     * happened until the next request.
     */
    public static function flushCache(): void
    {
        Cache::memo()->forget('settings.all');
        Cache::memo()->forget('settings.rows');
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return static::all_cached()[$key] ?? $default;
    }

    /**
     * Write one setting by key, encrypting it if the row is marked secret.
     *
     * Only an existing key is written, the same rule the admin endpoint
     * follows: settings are read by name from all over the codebase, so a
     * writer that can invent keys fills the table with values nothing reads.
     * Saving through the model rather than with an update() query is what
     * fires the events that drop the cached map.
     *
     * Returns whether anything was written, so a caller storing a token knows
     * the seeder has actually been run.
     */
    public static function put(string $key, ?string $value): bool
    {
        $setting = static::query()->where('key', $key)->first();

        if (! $setting) {
            Log::warning('Ignored a write to an unknown setting', ['key' => $key]);

            return false;
        }

        $setting->setPlainValue($value);
        $setting->save();

        return true;
    }
}
