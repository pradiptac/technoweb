<?php

namespace App\Http\Resources\Store;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\SeoResource;
use App\Models\StoreTag;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A shop tag's page (0.157.0). `count` is published products only —
 * the controller counted it — and `indexable` is the rule the website acts
 * on: a page about fewer than {@see StoreTag::MIN_INDEXABLE} products is
 * `noindex, follow` and out of the sitemap.
 *
 * @mixin StoreTag
 */
class TagResource extends JsonResource
{
    use IncludesSchema;

    public function toArray(Request $request): array
    {
        $count = (int) $this->products_count;

        return [
            'name' => $this->name,
            'slug' => $this->slug,
            'heading' => $this->heading,
            'intro' => $this->intro,
            'count' => $count,
            'indexable' => $count >= StoreTag::MIN_INDEXABLE,
            'updated_at' => $this->updated_at?->toIso8601String(),
            'seo' => new SeoResource($this->resolvedSeo()),
            'schema' => $this->schema(fn () => StructuredData::storeTag($this->resource, $count)),
        ];
    }
}
