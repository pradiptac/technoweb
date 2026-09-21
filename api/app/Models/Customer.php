<?php

namespace App\Models;

use App\Enums\CustomerStatus;
use App\Support\Newsletter\CustomerGroupSync;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class Customer extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    /** How long a verification link stays good for. */
    public const VERIFICATION_HOURS = 24;

    /**
     * The token a staff member holds while viewing the portal as this customer.
     *
     * A name of its own, never `portal`: `AuthController::issueToken()` deletes
     * every `portal` token before minting one, so an impersonation issued under
     * that name would sign the real customer out of their own browser — and the
     * ability is what `/auth/me` reads to tell the portal to draw its banner.
     */
    public const IMPERSONATION_TOKEN = 'impersonation';

    public const IMPERSONATION_ABILITY = 'impersonation';

    public const IMPERSONATION_MINUTES = 60;

    protected $fillable = [
        'name', 'email', 'password', 'company', 'phone', 'status',
        // What the last checkout was billed and shipped to, so the next one
        // is prefilled. The *order* keeps its own immutable copy — see the
        // migration for why these are a convenience and not a record.
        'billing_address', 'shipping_address', 'gstin',
    ];

    /**
     * The token is hashed at rest, so it must never be serialised — and
     * `$hidden` is not enough on its own: it hides the attribute from JSON,
     * not from a resource that names the column explicitly. Nothing does.
     */
    protected $hidden = ['password', 'remember_token', 'email_verification_token'];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'status' => CustomerStatus::class,
            'billing_address' => 'array',
            'shipping_address' => 'array',
            'last_login_at' => 'datetime',
            'email_verified_at' => 'datetime',
            'approved_at' => 'datetime',
            'email_verification_sent_at' => 'datetime',
        ];
    }

    /** @return HasMany<Ticket, $this> */
    public function tickets(): HasMany
    {
        return $this->hasMany(Ticket::class);
    }

    /** The staff member who approved this account, if one did. */
    /** @return BelongsTo<User, $this> */
    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    /* ------------------------------------------------------------- queries */

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $query->when($status, fn (Builder $q) => $q->where('status', $status));
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        return $query->when($term, function (Builder $q) use ($term) {
            $like = '%'.$term.'%';
            $q->where(fn (Builder $inner) => $inner
                ->where('name', 'like', $like)
                ->orWhere('email', 'like', $like)
                ->orWhere('company', 'like', $like));
        });
    }

    /* ------------------------------------------------------- impersonation */

    /**
     * Whether the request in hand is a staff member viewing the portal as
     * this customer.
     *
     * An ability check, and it is sound *for a customer* for a reason worth
     * writing down: `TransientToken::can()` — the token a session-authenticated
     * principal carries under `statefulApi()` — answers true for every
     * ability, so on a model that can be reached through a session this would
     * be wrong. A `Customer` cannot be. Sanctum's stateful path asks only the
     * `web` guard (`config/sanctum.php` → `guard`), whose provider is the
     * `users` table; the `customer` session guard in `config/auth.php` is
     * not on that list, so the only way a `Customer` is ever authenticated
     * here is a bearer token, which is a real `PersonalAccessToken`. Under
     * `actingAs()` in a test there is no token at all, which is why the tests
     * for this send a real header.
     */
    public function isImpersonated(): bool
    {
        return $this->tokenCan(self::IMPERSONATION_ABILITY);
    }

    /* -------------------------------------------------------- verification */

    public function hasVerifiedEmail(): bool
    {
        return $this->email_verified_at !== null;
    }

    /**
     * Issue a fresh verification token and return the plain text of it.
     *
     * Stored as a hash for the same reason a password is: the column is one
     * database read away from anybody who gets that far, and a readable token
     * is a working sign-in link. Issuing a new one invalidates the last,
     * because two live links doubles the window without helping anyone.
     */
    public function issueVerificationToken(): string
    {
        $plain = Str::random(48);

        $this->forceFill([
            'email_verification_token' => Hash::make($plain),
            'email_verification_sent_at' => now(),
        ])->save();

        return $plain;
    }

    public function verificationTokenMatches(string $plain): bool
    {
        if (blank($this->email_verification_token) || $this->email_verification_sent_at === null) {
            return false;
        }

        if ($this->email_verification_sent_at->addHours(self::VERIFICATION_HOURS)->isPast()) {
            return false;
        }

        return Hash::check($plain, $this->email_verification_token);
    }

    /**
     * Keep the "Existing customers" newsletter group in step.
     *
     * A one-off import is correct on the day it is pressed and wrong from the
     * next approval onwards — and nobody notices, because a stale group looks
     * exactly like a current one. It is the newest customers, the ones most
     * worth writing to, who go missing.
     *
     * Guarded on the fields that can change the answer, so editing a phone
     * number does not touch the newsletter at all. The nightly
     * `technoware:sync-customer-group` is the other half: this covers the
     * ordinary path, and the sweep covers whatever reached the table without
     * firing an event.
     *
     * It cannot resurrect an unsubscribe — every addition goes through
     * `SubscriberIntake`, which checks the suppression list first.
     */
    protected static function booted(): void
    {
        static::saved(function (self $customer) {
            if ($customer->wasRecentlyCreated || $customer->wasChanged(['status', 'email', 'name', 'company', 'phone'])) {
                CustomerGroupSync::syncOne($customer);
            }
        });
    }

    /** Mark the address verified and burn the token. */
    public function markEmailVerified(): void
    {
        $this->forceFill([
            'email_verified_at' => now(),
            'email_verification_token' => null,
            'email_verification_sent_at' => null,
        ])->save();
    }
}
