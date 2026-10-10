<?php

namespace App\Models;

use App\Casts\SpecSheet;
use App\Enums\ProductCondition;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Jobs\SendWishlistPriceDrops;
use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasRevisions;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\HtmlSanitiser;
use App\Support\MediaUrl;
use App\Support\Store\SpecIndex;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

/**
 * Something the store sells.
 *
 * Deliberately not `Product`. See the migration: what the store sells is
 * maintained separately from what the site advertises, because the catalogue
 * exists to be found by somebody researching a project and most of it is quoted
 * per site rather than bought from a page.
 *
 * It reuses `Brand` — a manufacturer is a fact, not an editorial decision — and
 * has its own categories, because how a listing is arranged is precisely the
 * thing being maintained separately.
 */
class StoreProduct extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasCustomFields, HasRevisions, HasSeo, Sluggable;

    protected $fillable = [
        'store_category_id', 'brand_id', 'name', 'slug', 'sku', 'gtin', 'mpn', 'type',
        'short_description', 'description', 'images', 'videos', 'specifications', 'features',
        'warranty', 'applications',
        'activation_procedure', 'activation_pdf_path',
        'price_paise', 'compare_at_paise', 'track_stock', 'stock', 'allow_oversell', 'returnable',
        'condition', 'google_product_category', 'weight_grams', 'feed_include',
        'status', 'is_featured', 'sort_order',
        'body_layout', 'blocks',
    ];

    /**
     * Defaults that match the columns, so an unsaved model answers what a
     * saved one would. Without it `allow_oversell` is **null** until the row
     * is read back, and null is neither of the two answers this question
     * has — it reads as "off" through a boolean cast and as a missing value
     * in a resource, which is two behaviours for one unset field.
     *
     * **Every boolean with a column default, not just one.** The first cut
     * declared `allow_oversell` alone, and `track_stock` — `default(true)` in
     * the column — was null on an unsaved model. `inStock()` opens with
     * `if (! $this->track_stock)`, so a product created and asked about in
     * the same breath called itself in stock whatever its shelf held, which
     * is the wrong answer arrived at for a reason nothing would report.
     */
    protected $attributes = [
        'track_stock' => true,
        'allow_oversell' => false,
        'returnable' => true,
        'is_featured' => false,
        'feed_include' => true,
        'condition' => 'new',
        'rating_count' => 0,
        // The page draws the written description until sections are chosen.
        'body_layout' => 'body',
    ];

    protected function casts(): array
    {
        return [
            // Not a plain array cast: MySQL JSON does not preserve object key
            // order, so the sheet is stored as an ordered list of pairs.
            'specifications' => SpecSheet::class,
            'features' => 'array',
            'images' => 'array',
            // A list, so the plain array cast keeps its order (MySQL reorders
            // object keys, never list items). See `App\Support\Store\ProductVideos`.
            'videos' => 'array',
            'blocks' => 'array',
            'type' => ProductType::class,
            'condition' => ProductCondition::class,
            'weight_grams' => 'integer',
            'feed_include' => 'boolean',
            'status' => PublishStatus::class,
            'price_paise' => 'integer',
            'compare_at_paise' => 'integer',
            'track_stock' => 'boolean',
            'stock' => 'integer',
            'allow_oversell' => 'boolean',
            'returnable' => 'boolean',
            'is_featured' => 'boolean',
            // Written only by `ReviewSummary`; read by every card.
            'rating_average' => 'decimal:1',
            'rating_count' => 'integer',
            // Stamped the first time tags are decided; see `Tags::autoTag()`.
            'tags_set_at' => 'datetime',
            'tags_auto' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        /*
         * A price that came down is news to whoever saved this (2026-09-25).
         * Here rather than in the product form, because the form, the import
         * and anything written later all save through the model; the job
         * re-reads every line and decides who is owed a message.
         */
        static::updated(function (self $product) {
            if ($product->wasChanged('price_paise') && (int) $product->price_paise < (int) $product->getOriginal('price_paise')) {
                SendWishlistPriceDrops::watch($product->id);
            }
        });

        /*
         * The spec filter's index (2026-09-26). A new product or a changed
         * sheet is rebuilt after the transaction commits, so the variations
         * the same save writes are read too — see `SpecIndex::queue()`. A
         * deleted product's rows cascade; the version moves so the facet
         * cache does not go on counting it.
         */
        static::saved(function (self $product) {
            if ($product->wasRecentlyCreated || $product->wasChanged('specifications')) {
                SpecIndex::queue((int) $product->id);
            }
        });
        static::deleted(fn () => SpecIndex::touch());
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/store/products';
    }

    /**
     * Products that cannot be sold right now.
     *
     * The query half of `inStock()`, and it has to agree with it — a product
     * with variations answers for the **set**, so its own counter is not the
     * answer and a plain `stock <= 0` reports a 48-port switch as unavailable
     * because the 24-port ran out.
     *
     * It exists because the dashboard counts these and then links to the list
     * that shows them. Two spellings of one rule is a tile reading "3 out of
     * stock" that opens a list of five, which is worse than not linking at all.
     */
    public function scopeOutOfStock(Builder $query): Builder
    {
        return $query->where('track_stock', true)->where(function (Builder $q) {
            // `allow_oversell` on both sides, or the tile counting "out of
            // stock" and the listing offering a Buy button disagree — which is
            // the drift `scopeOutOfStock` exists to prevent between the
            // dashboard's figure and the list it links to.
            $q->where(fn (Builder $q) => $q->whereDoesntHave('variations')
                ->where('allow_oversell', false)->where('stock', '<=', 0))
                ->orWhere(fn (Builder $q) => $q
                    ->whereHas('variations')
                    ->whereDoesntHave('variations', fn (Builder $v) => $v->where('is_active', true)
                        ->where(fn (Builder $w) => $w->where('allow_oversell', true)->orWhere('stock', '>', 0))));
        });
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * Products that carry at least one video (0.140.0). The column is stored
     * as null when a form clears the list (`ProductVideos::normalise()`), but
     * an empty array is not impossible from older writes, so the test is the
     * JSON's length and not a null check alone. The one definition the
     * "shop the videos" shelf and the console's `?video=1` filter share.
     *
     * @param  Builder<StoreProduct>  $query
     * @return Builder<StoreProduct>
     */
    public function scopeWithVideos(Builder $query): Builder
    {
        return $query->whereNotNull('videos')->whereRaw('JSON_LENGTH(videos) > 0');
    }

    /**
     * Physical products whose weight nobody entered (0.142.0).
     *
     * They are weighed at the shop's default in a delivery quote, so a basket
     * of them rides a guess. A product counts as weighed when it has a weight
     * of its own or any of its options does; the shipping screen's count and
     * the products list's `?no_weight=1` are this one scope.
     */
    public function scopeWithoutWeight(Builder $query): Builder
    {
        return $query->where('type', ProductType::Physical)
            ->where(fn (Builder $q) => $q->whereNull('weight_grams')->orWhere('weight_grams', '<=', 0))
            ->whereDoesntHave('variations', fn (Builder $v) => $v->where('weight_grams', '>', 0));
    }

    /** @return BelongsTo<StoreCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(StoreCategory::class, 'store_category_id');
    }

    /** @return BelongsTo<Brand, $this> */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /**
     * The services that install, configure or support this product.
     *
     * A pivot of its own (`store_product_service`) rather than a reuse of
     * the catalogue's `product_solution`: the store's catalogue is not the
     * site's, and a product page that can point at "we install this" is the
     * one cross-link a shop listing can offer that is not more hardware.
     *
     * @return BelongsToMany<Service, $this>
     */
    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'store_product_service')->orderBy('sort_order');
    }

    /**
     * The shop tags (0.141.0), in the Tags screen's order. Written only
     * through `App\Support\Store\Tags`.
     *
     * @return BelongsToMany<StoreTag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(StoreTag::class, 'store_product_tag')
            // Curated tags (a sort order above 0) first, the rest by when they were made.
            ->orderByRaw('store_tags.sort_order = 0')->orderBy('store_tags.sort_order')->orderBy('store_tags.id');
    }

    /** @return HasMany<StoreProductVariation, $this> */
    public function variations(): HasMany
    {
        return $this->hasMany(StoreProductVariation::class)->orderBy('sort_order')->orderBy('id');
    }

    /**
     * The activation codes held for this product.
     *
     * Only meaningful for a digital one. Left as a plain relation rather than
     * guarded by type, because "a physical product with codes" is a data
     * mistake somebody should be able to *see* rather than one the model hides.
     */
    /** @return HasMany<DigitalCode, $this> */
    public function digitalCodes(): HasMany
    {
        return $this->hasMany(DigitalCode::class);
    }

    /**
     * The people waiting to hear this is back — every row, told or not.
     * `StockNotice::scopeWaiting()` narrows it, and is the one definition
     * of "waiting" the count, the filter and the dashboard share.
     *
     * @return HasMany<StockNotice, $this>
     */
    public function stockNotices(): HasMany
    {
        return $this->hasMany(StockNotice::class);
    }

    /**
     * Every review written about this product, in any state. `published()`
     * narrows it; `ReviewSummary` keeps the product's own two columns in
     * step with what that narrowing says.
     *
     * @return HasMany<ProductReview, $this>
     */
    public function reviews(): HasMany
    {
        return $this->hasMany(ProductReview::class);
    }

    /**
     * Whether there is anything to sell right now.
     *
     * A product with variations answers for the **set**: it is in stock while
     * any active variation is, because that is what the buyer experiences — the
     * 24-port being gone does not make the 48-port unavailable. The product's
     * own counter is not consulted in that case; the variation is the thing
     * with a shelf.
     *
     * The loaded relation when there is one, a query when there is not. Reading
     * `$this->variations` unloaded is a lazy load, which throws outside
     * production — and quietly answering from `$this->stock` instead would be
     * worse than throwing: the same product would report "in stock" on a page
     * that eager-loads and "out of stock" on one that does not, which is a bug
     * nobody would think to look for in a getter.
     */
    /**
     * May this be sold when there is none left?
     *
     * **The variation answers for itself when there is one**, and the
     * product's own flag applies when there are none — exactly how `stock`
     * works, because it is the same question about the same shelf. A product
     * with variations counts per variation, so a flag read off the parent
     * could not say "the 24-port is back-ordered and the 48-port is not",
     * which is the case somebody actually has.
     *
     * One method, called from five places — the checkout's gate, the cart's
     * available count, both `inStock()` answers, the out-of-stock scope and
     * settlement. Written out at each of those instead, it is five copies of
     * one sentence and the drift is silent in both directions: a checkout that
     * refuses what the listing offered, or a listing that offers what the
     * checkout refuses.
     *
     * An untracked product is not "overselling" — nobody is counting, so there
     * is no line to cross. That is `track_stock`, and it is a different
     * question answered elsewhere.
     */
    public function allowsOversell(?StoreProductVariation $variation = null): bool
    {
        return (bool) ($variation !== null ? $variation->allow_oversell : $this->allow_oversell);
    }

    public function inStock(): bool
    {
        if (! $this->track_stock) {
            return true;
        }

        $variations = $this->relationLoaded('variations')
            ? $this->variations
            : $this->variations()->get();

        if ($variations->isNotEmpty()) {
            // Any one sellable row makes the product sellable, and a
            // back-ordered row is sellable however empty its shelf.
            return $variations->contains(
                fn (StoreProductVariation $v) => $v->is_active && ($v->allow_oversell || $v->stock > 0),
            );
        }

        return $this->allow_oversell || $this->stock > 0;
    }

    /**
     * How many are on the shelf.
     *
     * The quantity counterpart of `inStock()`, and it has to make the same
     * distinction for the same reason: **a product with variations is counted
     * from its variations**, because that is what somebody can actually buy.
     * Its own `stock` column is a leftover for those — nothing reads it, and
     * nothing writes to it either once variations exist.
     *
     * That column was being shown as the answer on the products list and on the
     * edit form, so a product holding four 24-ports and two 48-ports read as
     * **4 in stock** on both, and 4 was a number left behind when the product
     * was created. Reported as "the total stock value showing is wrong", which
     * it was.
     *
     * Only **active** variations count: an inactive one cannot be bought, so
     * including it would report stock the shop will not sell.
     *
     * An untracked product returns null rather than zero. "Nobody is counting"
     * and "there are none" are opposite answers, and a service reading 0 on a
     * stock list is the one that sends somebody to reorder nothing.
     */
    public function stockOnHand(): ?int
    {
        if (! $this->track_stock) {
            return null;
        }

        $variations = $this->relationLoaded('variations')
            ? $this->variations
            : $this->variations()->get();

        if ($variations->isNotEmpty()) {
            return (int) $variations->where('is_active', true)->sum('stock');
        }

        return (int) $this->stock;
    }

    /**
     * Whether this can be had, in the three answers a shop actually has.
     *
     * `inStock()` is a boolean because that is what a Buy button needs. A feed
     * and a schema.org Offer need the third state: a product with an empty
     * shelf that the shop has agreed to back-order is **not** in stock, and
     * calling it so is a claim Merchant Center suspends accounts over — while
     * calling it out of stock would hide something that can be bought today.
     *
     * Derived from the same fields `inStock()` reads, in the same order, so
     * the listing and the feed cannot disagree about one shelf.
     */
    public function availability(?StoreProductVariation $variation = null): string
    {
        if ($variation !== null) {
            if (! $this->track_stock) {
                return 'in_stock';
            }

            return match (true) {
                $variation->stock > 0 => 'in_stock',
                (bool) $variation->allow_oversell => 'backorder',
                default => 'out_of_stock',
            };
        }

        if (! $this->track_stock) {
            return 'in_stock';
        }

        $variations = $this->relationLoaded('variations')
            ? $this->variations
            : $this->variations()->get();

        if ($variations->isNotEmpty()) {
            $active = $variations->where('is_active', true);

            if ($active->contains(fn (StoreProductVariation $v) => $v->stock > 0)) {
                return 'in_stock';
            }

            return $active->contains(fn (StoreProductVariation $v) => (bool) $v->allow_oversell)
                ? 'backorder'
                : 'out_of_stock';
        }

        return match (true) {
            $this->stock > 0 => 'in_stock',
            (bool) $this->allow_oversell => 'backorder',
            default => 'out_of_stock',
        };
    }

    /**
     * The manufacturer's identifiers, the variation answering for itself.
     *
     * Same shape as `allowsOversell()` and for the same reason: the 24-port and
     * the 48-port are two different parts with two different barcodes, so a
     * value read only off the parent could not tell them apart.
     *
     * **`identifier_exists` is not stored anywhere** — it is `false` exactly
     * when both of these come back blank, and a column for it would be a second
     * answer free to contradict the two that already settle it.
     *
     * `sku` is deliberately not a fallback for `mpn`. A SKU is this shop's own
     * filing code; an MPN is the manufacturer's. Offering one as the other is
     * how a feed comes to claim a part number no supplier has ever heard of.
     *
     * @return array{gtin: ?string, mpn: ?string}
     */
    public function identifiers(?StoreProductVariation $variation = null): array
    {
        return [
            'gtin' => ($variation?->gtin ?: null) ?: ($this->gtin ?: null),
            'mpn' => ($variation?->mpn ?: null) ?: ($this->mpn ?: null),
        ];
    }

    /**
     * Google's own category, inherited from the listing it sits in.
     *
     * Set once on "Network switches" and every product in it is categorised;
     * a product that sits oddly overrides. `?:` rather than `??`, the rule this
     * codebase keeps relearning: a field somebody opened and left blank stores
     * an empty string, and `??` would let that beat a perfectly good default.
     */
    public function googleCategory(): ?string
    {
        return ($this->google_product_category ?: null)
            ?: ($this->category?->google_product_category ?: null);
    }

    /** @return array<string, ?string> */
    public function defaultSeo(): array
    {
        return [
            'title' => $this->name,
            // `toText`, never `strip_tags`: that deletes a tag without leaving
            // anything in its place, so the end of one block runs into the
            // start of the next and a meta description reads "…asked for.Remote
            // supportWhen an engineer…".
            'description' => $this->short_description
                ?: mb_substr(HtmlSanitiser::toText($this->description ?? ''), 0, 160),
            'canonical_url' => rtrim((string) config('app.frontend_url'), '/').'/store/products/'.$this->slug,
            'og_image' => filled($this->images) ? MediaUrl::for($this->images[0]) : null,
        ];
    }

    /**
     * The files of the downloads centre attached to this product
     * (0.131.0, docs/downloads.md).
     *
     * @return MorphToMany<Download, $this>
     */
    public function downloads(): MorphToMany
    {
        return $this->morphToMany(Download::class, 'downloadable');
    }

    /**
     * The ones a visitor may be shown, in the order the centre lists them
     * within a shelf. What the product page loads.
     *
     * @return MorphToMany<Download, $this>
     */
    public function publishedDownloads(): MorphToMany
    {
        return $this->downloads()->published()
            ->orderBy('downloads.sort_order')
            ->orderByDesc('downloads.released_on')
            ->orderBy('downloads.title');
    }

    /**
     * Questions answered on this record's page, in order. Widened to this
     * model on 2026-09-21 (`docs/aeo-geo-contract.md`, section 2): the
     * FAQPage gate in `StructuredData::answerFaqs()` reads these beside the
     * `question` answer blocks.
     *
     * @return MorphMany<Faq, $this>
     */
    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }
}
