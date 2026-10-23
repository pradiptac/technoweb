<?php

namespace App\Models;

use App\Enums\ApiScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * A credential for the `/ext` integration surface. Only the SHA-256 of the
 * key is stored: the plain key is shown once, on the response that made it,
 * and a database read yields nothing that can be sent. `prefix` is the
 * first eleven characters, kept so a person can tell keys apart.
 */
class ApiKey extends Model
{
    protected $fillable = [
        'name', 'prefix', 'key_hash', 'scopes', 'allowed_ips', 'expires_at', 'revoked_at',
        'last_used_at', 'last_used_ip', 'created_by',
    ];

    protected $hidden = ['key_hash'];

    protected function casts(): array
    {
        return [
            'scopes' => 'array',
            'allowed_ips' => 'array',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    /**
     * A new key and its hash: `ak_` and 40 base62 characters from
     * `random_bytes`. Bytes of 248 or more are discarded (248 = 62 × 4) so
     * the alphabet is not favoured by modulo bias.
     *
     * @return array{0: string, 1: string}
     */
    public static function mint(): array
    {
        $alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        $body = '';
        while (strlen($body) < 40) {
            foreach (str_split(random_bytes(48)) as $byte) {
                $n = ord($byte);
                if ($n < 248 && strlen($body) < 40) {
                    $body .= $alphabet[$n % 62];
                }
            }
        }
        $plain = 'ak_'.$body;

        return [$plain, self::hash($plain)];
    }

    public static function hash(string $plain): string
    {
        return hash('sha256', $plain);
    }

    public static function findByPlain(string $plain): ?self
    {
        if (! preg_match('/^ak_[A-Za-z0-9]{40}$/', $plain)) {
            return null;
        }

        return self::where('key_hash', self::hash($plain))->first();
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** `revoked` outranks `expired`: a key somebody switched off stays switched off. */
    public function status(): string
    {
        return $this->revoked_at !== null ? 'revoked' : ($this->isExpired() ? 'expired' : 'active');
    }

    public function allows(ApiScope|string $scope): bool
    {
        $value = $scope instanceof ApiScope ? $scope->value : $scope;

        return in_array($value, $this->scopes ?? [], true);
    }

    /** No list means any address; a list with no address to check means no. */
    public function allowsIp(?string $ip): bool
    {
        if (empty($this->allowed_ips)) {
            return true;
        }

        return $ip !== null && IpUtils::checkIp($ip, $this->allowed_ips);
    }

    /** @return HasMany<ApiKeyRequest, $this> */
    public function requests(): HasMany
    {
        return $this->hasMany(ApiKeyRequest::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
