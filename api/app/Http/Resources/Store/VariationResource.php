<?php

namespace App\Http\Resources\Store;

use App\Support\MediaAlt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One buyable configuration, as the storefront needs it.
 *
 * `price_paise` is resolved here rather than sent as null-means-inherit. The
 * inheritance is a storage convenience — it stops one price being written twice
 * — and pushing it over the wire would make every consumer reimplement it,
 * which is exactly how two places end up disagreeing about what something
 * costs.
 *
 * No stock count, for the same reason the product carries none.
 */
class VariationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'sku' => $this->sku,
            // Ordered pairs -- [["RAM", "16 GB"], ...] -- so the storefront can
            // group them into one selector per option name.
            'options' => $this->options,
            'price_paise' => $this->pricePaise(),
            'in_stock' => $this->inStock(),
            'image_url' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'image_alt' => $this->image_path ? MediaAlt::for($this->image_path) : null,
        ];
    }
}
