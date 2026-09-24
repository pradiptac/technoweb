<?php

namespace App\Models\Concerns;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Log;

/**
 * "This contains sensitive data, encrypt its contents" — a switch on the
 * row (`is_sensitive`) and one text column stored as ciphertext when it is
 * on. A ticket message's `body` and a ticket's `description` are the same
 * shape, so the sealing lives here and each model names its column.
 *
 * The Setting pattern rather than an `encrypted` cast, because only some
 * rows are secret and a cast applies to the column. The column is sealed
 * in `saving` (`sealSensitive()`) and opened by the model's accessor
 * (`openSensitive()`), so every reader — the resources, the notifications,
 * the piper's read-modify-write — sees the plain text and nothing has to
 * know. `isSealed()` recognises Laravel's envelope, so a row is never
 * sealed twice and a plain row is never "decrypted". A row that will not
 * decrypt — APP_KEY changed, the same trade `DigitalCode` documents —
 * answers `UNREADABLE` and a warning in the log rather than a 500.
 *
 * The model's accessor must be `->withoutObjectCaching()`: Eloquent
 * otherwise keeps the value the setter was handed and re-applies the
 * setter on save, which put the plain text back over the ciphertext the
 * hook had just written. Measured before it was understood.
 */
trait SealsSensitiveText
{
    /** What a sealed column reads as when it cannot be decrypted. */
    public const UNREADABLE = 'This message could not be decrypted.';

    /** Seal the column of a sensitive row before it is written, unless it already is. */
    protected function sealSensitive(string $column): void
    {
        $stored = $this->attributes[$column] ?? null;

        if ($this->is_sensitive && is_string($stored) && $stored !== '' && ! self::isSealed($stored)) {
            $this->attributes[$column] = Crypt::encryptString($stored);
        }
    }

    /** The column as written: opened when the row is sensitive and the stored value is sealed. */
    protected function openSensitive(string $column, ?string $stored): ?string
    {
        if ($stored === null || ! $this->is_sensitive || ! self::isSealed($stored)) {
            return $stored;
        }

        try {
            return Crypt::decryptString($stored);
        } catch (\Throwable) {
            Log::warning('Could not decrypt a sensitive ticket text', ['model' => static::class, 'id' => $this->id, 'column' => $column]);

            return self::UNREADABLE;
        }
    }

    /**
     * Whether a stored value is Laravel's ciphertext envelope — base64 of a
     * JSON object carrying `iv`, `value` and `mac`. A text somebody typed
     * that happens to be exactly that is not a case worth a column.
     */
    public static function isSealed(string $stored): bool
    {
        $decoded = base64_decode($stored, true);
        if ($decoded === false) {
            return false;
        }

        $json = json_decode($decoded, true);

        return is_array($json) && isset($json['iv'], $json['value'], $json['mac']);
    }
}
