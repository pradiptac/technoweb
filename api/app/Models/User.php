<?php

namespace App\Models;

use App\Enums\Role as RoleEnum;
use App\Support\Meetings\HostSync;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Staff account. Customers live in their own model and guard — a staff user is
 * never a customer and vice versa.
 */
class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'phone', 'password', 'is_active'];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        // A host's invitation goes to the address on their account: a new
        // one has to reach every event still to come (docs/meetings.md).
        static::updated(function (self $user) {
            if ($user->wasChanged('email')) {
                HostSync::emailChanged($user);
            }
        });
    }

    /**
     * The support centres this person is shown at (docs/support-network.md).
     *
     * @return BelongsToMany<SupportCentre, $this>
     */
    public function supportCentres(): BelongsToMany
    {
        return $this->belongsToMany(SupportCentre::class)->withPivot(['title', 'is_public']);
    }

    /** @return BelongsToMany<Role, $this> */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class);
    }

    /** @return HasOne<StaffPreference, $this> */
    public function staffPreference(): HasOne
    {
        return $this->hasOne(StaffPreference::class);
    }

    /** @return HasMany<StaffPushSubscription, $this> */
    public function pushSubscriptions(): HasMany
    {
        return $this->hasMany(StaffPushSubscription::class);
    }

    /** @return HasMany<Ticket, $this> */
    public function assignedTickets(): HasMany
    {
        return $this->hasMany(Ticket::class, 'assigned_to');
    }

    public function hasRole(RoleEnum|string ...$roles): bool
    {
        $slugs = array_map(fn ($r) => $r instanceof RoleEnum ? $r->value : $r, $roles);

        return $this->roles->whereIn('slug', $slugs)->isNotEmpty();
    }

    public function isAdmin(): bool
    {
        return $this->hasRole(RoleEnum::Admin);
    }
}
