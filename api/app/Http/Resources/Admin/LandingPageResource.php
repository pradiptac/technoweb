<?php

namespace App\Http\Resources\Admin;

use App\Http\Resources\FaqResource;
use App\Models\LandingPage;
use App\Support\LandingPageQuality;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A landing page as the console edits it.
 *
 * Carries the **gate result**, not just the status, and that is the point of
 * having a separate resource. A list of drafts where each row says only
 * "draft" tells an editor nothing about which one is three sentences away from
 * being publishable and which one is a duplicate that should be deleted. The
 * reasons travel with the record, the same way `SeoScore`'s failed checks
 * travel with a score rather than being a number on its own.
 *
 * The set to compare against is handed in through `compareAgainst()` rather
 * than through the constructor, and that is not a preference. `::collection()`
 * builds each item with `new static($resource)` and no second argument, so a
 * constructor parameter would silently default to an empty set on every list —
 * every row would report "nothing else to compare against" and the duplicate
 * check, which is the reason this module is safe, would be dark on the one
 * screen where somebody would notice a duplicate.
 *
 * The value is per-request state on a class that lives for one request. If a
 * caller forgets to set it the display degrades to "not compared" rather than
 * to a wrong answer, and the *publish* gate is unaffected — `LandingPageRequest`
 * fetches its own set and is what actually refuses.
 */
class LandingPageResource extends JsonResource
{
    /** @var iterable<int, LandingPage> */
    private static iterable $comparison = [];

    /** Call once per request, before rendering. See the class docblock. */
    public static function compareAgainst(iterable $others): void
    {
        self::$comparison = $others;
    }

    public function toArray(Request $request): array
    {
        $gate = LandingPageQuality::gate($this->resource, self::$comparison);

        return [
            'id' => $this->id,
            'kind' => $this->kind?->value,
            'kind_label' => $this->kind?->label(),
            'path' => $this->path,
            'title' => $this->title,
            'heading' => $this->heading,
            'intro' => $this->intro,
            'body' => $this->body,
            'status' => $this->status?->value,
            'auto_generated' => $this->auto_generated,
            'evidence' => $this->evidence,

            'brand_id' => $this->brand_id,
            'product_category_id' => $this->product_category_id,
            'solution_id' => $this->solution_id,
            'service_id' => $this->service_id,
            'location_id' => $this->location_id,

            'brand' => $this->whenLoaded('brand', fn () => ['id' => $this->brand->id, 'name' => $this->brand->name]),
            'category' => $this->whenLoaded('category', fn () => ['id' => $this->category->id, 'name' => $this->category->name]),
            'solution' => $this->whenLoaded('solution', fn () => ['id' => $this->solution->id, 'name' => $this->solution->title]),
            'service' => $this->whenLoaded('service', fn () => ['id' => $this->service->id, 'name' => $this->service->title]),
            'location' => $this->whenLoaded('location', fn () => ['id' => $this->location->id, 'name' => $this->location->name]),

            /*
             * Why this page can or cannot go live, in the words a person acts
             * on. Sent on the list as well as the form: the question "which of
             * these forty drafts is nearly ready" is asked of the list.
             */
            'publishable' => $gate['publishable'],
            'failures' => $gate['failures'],
            'checks' => $gate['checks'],

            'seo' => SeoOverrideArray::from($this->whenLoaded('seo') ?: null),
            'seo_defaults' => $this->resolvedSeo(),
            'faqs' => FaqResource::collection($this->whenLoaded('faqs')),

            // A path, not a URL. `frontend_url` is pinned to production so the
            // canonicals are right, which makes it exactly the wrong base for a
            // link somebody clicks from a console running on localhost.
            'public_path' => $this->path,
            'published_at' => $this->published_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
