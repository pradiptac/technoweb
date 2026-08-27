<?php

namespace App\Http\Resources;

use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A landing page, as the public site renders it.
 *
 * `products` is the part that matters. A page about Cisco switches whose body
 * is three paragraphs and nothing else is the thin page this module was built
 * to avoid — what makes it worth indexing is that it lists the eleven switches
 * it is about, each linking to its own page. The written intro is the reason
 * the page is not a duplicate; the products are the reason it is useful.
 *
 * `evidence` is deliberately **not** exposed. It is a record of why the page was
 * proposed, for whoever asks in six months, and publishing internal counts to
 * anyone who curls the endpoint tells them how the site is assembled.
 */
class LandingPageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'path' => $this->path,
            'kind' => $this->kind?->value,
            'title' => $this->title,
            'heading' => $this->heading,
            'intro' => $this->intro,
            'body' => $this->body,
            'brand' => new BrandResource($this->whenLoaded('brand')),
            'category' => new ProductCategoryResource($this->whenLoaded('category')),
            'solution' => new SolutionResource($this->whenLoaded('solution')),
            'service' => new ServiceResource($this->whenLoaded('service')),
            'location' => new LocationResource($this->whenLoaded('location')),
            'products' => ProductResource::collection($this->whenLoaded('relatedProducts')),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),
            'seo' => new SeoResource($this->resolvedSeo()),
            /*
             * A CollectionPage for a catalogue page, a LocalBusiness for a place.
             *
             * Not `Product` for the catalogue ones, however tempting: they list
             * hardware rather than being one item, and marking a listing up as a
             * single product is the structured-data equivalent of the thin page
             * this whole module exists to prevent.
             */
            'schema' => StructuredData::landingPage($this->resource),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
