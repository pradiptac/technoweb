<?php

namespace App\Models;

use App\Enums\SupportCentreKind;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * An office or service centre in the support network (0.170.0,
 * docs/support-network.md): an address, a phone, a pin on the map, and the
 * staff who work there.
 *
 * @property SupportCentreKind $kind
 */
class SupportCentre extends Model
{
    protected $fillable = [
        'name', 'slug', 'kind', 'country_code', 'region', 'city', 'address', 'phone', 'phone_alt',
        'email', 'hours', 'latitude', 'longitude', 'location_id', 'sort_order', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'kind' => SupportCentreKind::class,
            'latitude' => 'float',
            'longitude' => 'float',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsToMany<User, $this> */
    public function staff(): BelongsToMany
    {
        return $this->belongsToMany(User::class)
            ->withPivot(['title', 'is_public', 'sort_order'])
            ->withTimestamps()
            ->orderByPivot('sort_order');
    }

    /** @return BelongsTo<Location, $this> */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /** @param Builder<self> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /** Country, then city, then the editor's own order. */
    /** @param Builder<self> $query */
    public function scopeInListOrder(Builder $query): void
    {
        $query->orderBy('country_code')->orderBy('city')->orderBy('sort_order')->orderBy('id');
    }
}
