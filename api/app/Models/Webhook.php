<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A subscription: somebody else's URL, the events it wants, and the secret
 * every delivery is signed with.
 *
 * `secret` goes through the `encrypted` cast, so the column holds ciphertext
 * and a database read yields nothing usable. It is minted by `mintSecret()`
 * and handed to a person exactly once — on the response that created or
 * rotated it — and no resource carries it afterwards. The console can say
 * only that one is set.
 */
class Webhook extends Model
{
    protected $fillable = ['name', 'url', 'secret', 'events', 'is_active', 'created_by', 'last_delivered_at', 'last_error'];

    protected function casts(): array
    {
        return [
            'secret' => 'encrypted',
            'events' => 'array',
            'is_active' => 'boolean',
            'last_delivered_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // The active list is memoised for the request; a change to any hook
        // invalidates it, so a hook created and an event emitted in the same
        // request see each other.
        static::saved(fn () => Webhooks::forgetActive());
        static::deleted(fn () => Webhooks::forgetActive());
    }

    /**
     * A fresh secret. 48 hex characters from `random_bytes`, prefixed so it
     * is recognisable in a configuration file for what it is.
     */
    public static function mintSecret(): string
    {
        return 'whsec_'.bin2hex(random_bytes(24));
    }

    public function subscribesTo(WebhookEvent $event): bool
    {
        return in_array($event->value, $this->events ?? [], true);
    }

    /** @return HasMany<WebhookDelivery, $this> */
    public function deliveries(): HasMany
    {
        return $this->hasMany(WebhookDelivery::class);
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
