<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One weight slab of a shipping zone: up to this many grams costs this much. */
class ShippingRate extends Model
{
    protected $fillable = ['shipping_zone_id', 'up_to_grams', 'charge_paise'];

    protected function casts(): array
    {
        return [
            'up_to_grams' => 'integer',
            'charge_paise' => 'integer',
        ];
    }

    /** @return BelongsTo<ShippingZone, $this> */
    public function zone(): BelongsTo
    {
        return $this->belongsTo(ShippingZone::class, 'shipping_zone_id');
    }
}
