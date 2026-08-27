<?php

namespace App\Http\Resources;

use App\Http\Resources\Concerns\IncludesSchema;
use App\Support\MediaAlt;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SolutionResource extends JsonResource
{
    use IncludesSchema;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'summary' => $this->summary,
            'icon' => $this->icon,
            'hero_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'hero_image_alt' => MediaAlt::for($this->hero_image_path),
            'problem_statement' => $this->when($detail, $this->problem_statement),
            'overview' => $this->when($detail, $this->overview),
            'benefits' => $this->when($detail, $this->benefits),
            'technologies' => $this->when($detail, $this->technologies),
            'status' => $this->status?->value,
            'products' => ProductResource::collection($this->whenLoaded('products')),
            'industries' => IndustryResource::collection($this->whenLoaded('industries')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            // Present only when eager-loaded. Deliberately not keyed on the
            // route: a nested resource inherits the parent's route name, so
            // an industry rendered inside /solutions/{slug} used to think it
            // was a detail view and lazy-load its own SEO row.
            // relationLoaded, not whenLoaded: whenLoaded short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row — we still want the derived defaults for those.
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo())
            ),
            /*
             * The page's JSON-LD, built server-side.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — twenty products inside
             * /solutions/{slug} would each build a Product graph and lazy-load a
             * brand and a category. See the IncludesSchema trait.
             *
             * The frontend renders it through `JsonLd`, which escapes `<`. That
             * boundary stays there: JSON.stringify does not escape it, and a CMS
             * field containing `</script>` would close the block.
             */
            'schema' => $this->schema(fn () => StructuredData::service($this->resource)),
        ];
    }
}
