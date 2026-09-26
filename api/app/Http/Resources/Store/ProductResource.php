<?php

namespace App\Http\Resources\Store;

use App\Http\Resources\BrandResource;
use App\Http\Resources\Concerns\IncludesAnswerContent;
use App\Http\Resources\Concerns\IncludesCustomFields;
use App\Http\Resources\Concerns\IncludesSchema;
use App\Http\Resources\SeoResource;
use App\Models\StoreProduct;
use App\Support\MediaMeta;
use App\Support\Store\Fulfilment;
use App\Support\Store\ProductVideos;
use App\Support\Store\ReviewSummary;
use App\Support\StructuredData;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What the storefront sees.
 *
 * **No stock count.** `in_stock` is the bit a shop needs, and an exact figure
 * on a public endpoint publishes what this business holds to anybody who curls
 * it — while being stale between the page and the checkout anyway. "Only 2
 * left" is a real pattern and this is deliberately not it.
 *
 * **No `compare_at_paise` unless it is genuinely higher.** A struck-through
 * price equal to or below the real one is either a mistake or a lie, and both
 * render as a discount that is not there.
 */
/** @mixin StoreProduct */
class ProductResource extends JsonResource
{
    use IncludesAnswerContent, IncludesCustomFields, IncludesSchema;

    public function toArray(Request $request): array
    {
        $detail = $request->routeIs('*.show');

        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            // The sitemap's `lastmod`: a record's own last change, never the build time. `docs/seo-audit-2026-09-18.md`, F2.
            'updated_at' => $this->updated_at?->toIso8601String(),
            'sku' => $this->sku,
            'type' => $this->type?->value,

            /*
             * Said on the page, because a term of the sale disclosed only on
             * the receipt is not a term anybody agreed to — the argument
             * `returnable` already makes below. Refurbished and used hardware
             * is a legitimate line for this business and an undisclosed one is
             * a complaint.
             *
             * The identifiers beside it in the database — GTIN and MPN — are
             * deliberately absent: nothing on the storefront renders them, and
             * they reach Google through the schema block and the feed, both of
             * which are built server-side.
             */
            'condition' => $this->condition?->value,
            'short_description' => $this->short_description,

            // Full body only on the detail endpoint — keeps list payloads small.
            'description' => $this->when($detail, $this->description),
            'specifications' => $this->when($detail, $this->specifications),
            'features' => $this->when($detail, $this->features),
            // Two buyer's questions, stated where they are asked. Detail
            // only, like the spec sheet; the graph quotes the same fields.
            'warranty' => $this->when($detail, $this->warranty),
            'applications' => $this->when($detail, $this->applications),
            // The services that install or support it — loaded by the
            // detail read alone, so a listing row carries no key.
            'services' => $this->whenLoaded('services', fn () => $this->services->map(fn ($s) => [
                'id' => $s->id, 'title' => $s->title, 'slug' => $s->slug,
            ])->values()),

            'images' => collect($this->images ?? [])->map(fn ($p) => asset('storage/'.$p))->all(),
            // Parallel to `images`, index for index: a gallery needs the
            // description that belongs to the picture it is showing.
            'image_alts' => MediaMeta::alts($this->images),
            // Parallel to `image_alts`, same order and length: the focal point of each, or null.
            'image_focuses' => MediaMeta::focuses($this->images),
            /*
             * The product's videos, after the pictures in its gallery
             * (2026-09-26). A YouTube video is its id and never a thumbnail
             * URL of YouTube's — the page draws its own poster and contacts
             * nobody until play is pressed. Detail only: a card has no player.
             */
            'videos' => $this->when($detail, fn () => ProductVideos::forPublic($this->videos)),

            'price_paise' => $this->price_paise,
            'compare_at_paise' => $this->when(
                $this->compare_at_paise > $this->price_paise,
                $this->compare_at_paise,
            ),
            'in_stock' => $this->inStock(),
            /*
             * The three-valued answer beside the boolean, so the page can say
             * "back-ordered" where `in_stock: true` would have it say "in
             * stock" for a shelf that is empty and a switch that is on. The
             * same `availability()` the feed and the Offer markup read, and
             * still no count. `handling_days` rides with it because that is
             * the number a back-order sentence needs.
             */
            'availability' => $this->availability(),
            'handling_days' => Fulfilment::handlingDays(),

            /*
             * Non-returnable is said before somebody pays, on the page, in the
             * cart and at the checkout. It is a term of the sale, and a term
             * disclosed only on the receipt is not a term anybody agreed to.
             */
            'returnable' => (bool) $this->returnable,

            'is_featured' => (bool) $this->is_featured,
            /*
             * The published reviews' summary, `{average, count}`, or null
             * when nobody has been published yet — read off the product's own
             * two columns (`ReviewSummary`), so a grid of cards never
             * aggregates per row. On the index and the detail alike: the card
             * draws the pill from it.
             */
            'rating' => ReviewSummary::publicShape($this->resource),
            // Unconditional, not detail-gated: the storefront's "New" ribbon
            // has to be computable from the listing grid, not only the PDP.
            'created_at' => $this->created_at?->toIso8601String(),
            'category' => new CategoryResource($this->whenLoaded('category')),
            'brand' => new BrandResource($this->whenLoaded('brand')),

            /*
             * The parent is attached to each child on the way out.
             *
             * A variation's price and stock are answered partly by its product
             * — a null price means the product's — and `preventLazyLoading` is
             * on, so a child reaching back up would throw. It is also twenty
             * queries for one row they all share. The product is right here.
             */
            'variations' => VariationResource::collection(
                $this->whenLoaded('variations', fn () => $this->variations->each(
                    fn ($variation) => $variation->setRelation('product', $this->resource),
                )),
            ),

            // relationLoaded, not whenLoaded: the latter short-circuits to null
            // when the relation is loaded but empty, and most records have no
            // override row — the derived defaults are still wanted for those.
            'faqs' => $this->publicFaqs(),
            // The published blocks, in order, with the heading each renders under.
            'answer_blocks' => $this->publicAnswerBlocks(),
            // What this record is connected to, on the page only (`EntityLinks`).
            'entity' => $this->entity(),
            // An FAQPage over the FAQs and question blocks; absent under two entries.
            'faq_schema' => $this->faqSchema(),
            // Custom fields (docs/custom-content.md) — see IncludesCustomFields.
            ...$this->publicCustomFields(),
            'seo' => $this->when(
                $this->resource->relationLoaded('seo'),
                fn () => new SeoResource($this->resolvedSeo()),
            ),

            /*
             * The page's JSON-LD, and the store had none at all until now.
             *
             * Every other detail route in the product has carried a graph since
             * the SEO work landed; the one part of the site that actually takes
             * money was the sole omission, so the shop published no price, no
             * availability and no offer to anything that reads a page. That is
             * also what Google Merchant Center reads to keep a listing current
             * between feed fetches.
             *
             * Gated on `withSchema()` rather than on the route, because a nested
             * resource inherits its parent's route name — every product in a
             * category listing would otherwise build its own graph and lazy-load
             * a brand. See the IncludesSchema trait.
             */
            'schema' => $this->schema(fn () => StructuredData::storeProduct($this->resource)),
        ];
    }
}
