<?php

namespace App\Models;

use App\Support\IndianStates;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A group of states and what delivery to them costs (0.142.0, docs/store.md
 * "Delivery charges and shipping zones").
 *
 * A zone is chosen by the delivery state alone. The one flagged `is_default`
 * is "Rest of India" and answers for every state no other active zone claims;
 * `ShippingQuote` is the only reader that matters.
 */
class ShippingZone extends Model
{
    protected $fillable = [
        'name', 'states', 'delivers', 'free_above_paise', 'extra_per_kg_paise',
        'is_default', 'sort_order', 'is_active',
    ];

    /**
     * In-memory defaults matching the columns.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'delivers' => true,
        'is_default' => false,
        'is_active' => true,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'states' => 'array',
            'delivers' => 'boolean',
            'free_above_paise' => 'integer',
            'extra_per_kg_paise' => 'integer',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    /** @return HasMany<ShippingRate, $this> */
    public function rates(): HasMany
    {
        return $this->hasMany(ShippingRate::class)->orderBy('up_to_grams');
    }

    /** @param  Builder<ShippingZone>  $query */
    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** The state codes this zone lists, cleaned: known codes only, no repeats. */
    public function stateCodes(): array
    {
        return array_values(array_unique(array_filter(
            (array) $this->states,
            fn ($code) => IndianStates::isCode((string) $code),
        )));
    }

    public function coversState(string $code): bool
    {
        return in_array($code, $this->stateCodes(), true);
    }
}
