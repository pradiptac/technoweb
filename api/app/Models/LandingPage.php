<?php

namespace App\Models;

use App\Enums\LandingPageKind;
use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Collection;

/**
 * A page generated from a combination the catalogue already knows about.
 *
 * **`Sluggable` is deliberately not used here.** That trait derives one slug
 * and writes a 301 from `urlPrefix()/old` on every change — a shape that fits
 * a record owning a single-segment URL. A landing page's URL is composed from
 * two or three other records' slugs, none of which it owns, so its address can
 * change without anything on this row changing at all. `path` is therefore
 * recomputed from the relations and the redirect is written from the old path
 * to the new one, which is the same guarantee arrived at differently.
 *
 * **Publication is not a property of this model.** `status` is a column like
 * any other and nothing here stops it being set to published — the gate lives
 * in `App\Support\LandingPageQuality` and is enforced by the form request,
 * because the reasons a page is not publishable are a list a person has to
 * read and act on, and a model event can only throw. See that class for what
 * the bar is and why it is where it is.
 */
class LandingPage extends Model
{
    use HasSeo;

    protected $fillable = [
        'kind', 'brand_id', 'product_category_id', 'solution_id', 'service_id', 'location_id',
        'path', 'title', 'heading', 'intro', 'body', 'status', 'auto_generated',
        'evidence', 'published_at',
    ];

    protected function casts(): array
    {
        return [
            'kind' => LandingPageKind::class,
            'status' => PublishStatus::class,
            'auto_generated' => 'boolean',
            'evidence' => 'array',
            'published_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        /*
         * Keep the URL in step with what the page is about, and keep the old
         * one working.
         *
         * A landing page can be re-pointed — the same row moved from one
         * category to another — and its path is built from records it does not
         * own, so a brand rename moves it too. Recomputing here means there is
         * one answer to "where does this live"; writing the redirect means the
         * previous answer keeps resolving, which is the whole reason the
         * redirects table exists.
         */
        /*
         * Publishing without a date leaves the column null, and every "newest
         * first" ordering then puts the page last — the same rule every CMS
         * entity here follows.
         *
         * **In the model rather than in the controller**, which is where it
         * used to be: only on the *update* path, so a page created already
         * published went out with a null date and nothing said so. Here it
         * holds however a row is saved — both endpoints, the seeder, and
         * `technoware:landing-pages` — which is the same argument the
         * application's CV deletion makes for living on a model event rather
         * than in the command that triggers it.
         */
        static::saving(function (self $page) {
            if ($page->status === PublishStatus::Published && blank($page->published_at)) {
                $page->published_at = now();
            }

            $fresh = $page->buildPath();

            if ($fresh !== null && $fresh !== $page->path) {
                $was = $page->getOriginal('path');
                $page->path = $fresh;

                if (filled($was) && $page->exists) {
                    Redirect::updateOrCreate(
                        ['from_path' => $was],
                        ['to_path' => $fresh, 'status_code' => 301, 'is_active' => true, 'created_automatically' => true],
                    );
                }
            }
        });
    }

    /* ------------------------------------------------------------ relations */

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'product_category_id');
    }

    public function solution(): BelongsTo
    {
        return $this->belongsTo(Solution::class);
    }

    public function service(): BelongsTo
    {
        return $this->belongsTo(Service::class);
    }

    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    /* ------------------------------------------------------------- queries */

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /** Everything a page needs to render or to be judged, in one round trip. */
    public function scopeWithContext(Builder $query): Builder
    {
        return $query->with([
            'brand', 'category', 'solution', 'service', 'seo', 'faqs',
            // The place, and enough of the tree to render it. `preventLazyLoading`
            // is on outside production, so anything the resource touches has to
            // be named here — and a location page renders its children and the
            // work offered there, not just its own name.
            'location', 'location.children', 'location.services', 'location.solutions',
        ]);
    }

    /* ----------------------------------------------------------- the URL */

    /**
     * The public path, composed from whatever this page is about.
     *
     * Returns null when a required relation is missing rather than building a
     * path with a hole in it — a `/brands//switches` is worse than no path,
     * because it is a URL that looks resolvable.
     */
    public function buildPath(): ?string
    {
        $kind = $this->kind instanceof LandingPageKind
            ? $this->kind
            : LandingPageKind::tryFrom((string) $this->kind);

        if (! $kind) {
            return null;
        }

        $brand = $this->brand_id ? Brand::find($this->brand_id)?->slug : null;
        $location = $this->location_id ? Location::find($this->location_id)?->slug : null;
        $topic = match ($kind) {
            LandingPageKind::BrandCategory => $this->product_category_id
                ? ProductCategory::find($this->product_category_id)?->slug : null,
            LandingPageKind::BrandSolution, LandingPageKind::SolutionLocation => $this->solution_id
                ? Solution::find($this->solution_id)?->slug : null,
            LandingPageKind::ServiceLocation => $this->service_id
                ? Service::find($this->service_id)?->slug : null,
            default => null,
        };

        return match ($kind) {
            LandingPageKind::Brand => $brand ? "/brands/{$brand}" : null,
            LandingPageKind::BrandCategory,
            LandingPageKind::BrandSolution => $brand && $topic ? "/brands/{$brand}/{$topic}" : null,
            LandingPageKind::Location => $location ? "/locations/{$location}" : null,
            LandingPageKind::ServiceLocation,
            LandingPageKind::SolutionLocation => $location && $topic ? "/locations/{$location}/{$topic}" : null,
        };
    }

    /**
     * The products this page is actually about.
     *
     * A query rather than a relation, because which products belong here
     * depends on the kind — a brand page means everything that brand makes, a
     * brand-and-category page means the intersection — and Eloquent relations
     * cannot branch on a column of the row they hang off.
     *
     * Attached under `relatedProducts` by the controllers so the resource can
     * use `whenLoaded` like every other nested collection. It is what makes a
     * landing page worth indexing at all: the written intro is why the page is
     * not a duplicate, and this list is why somebody would want to read it.
     */
    public function evidenceProducts(int $limit = 24): Collection
    {
        $kind = $this->kind instanceof LandingPageKind ? $this->kind : LandingPageKind::tryFrom((string) $this->kind);

        if (! $kind || ! $kind->isCatalogue() || ! $this->brand_id) {
            return collect();
        }

        $query = Product::query()->published()
            ->where('brand_id', $this->brand_id)
            ->with(['brand', 'category']);

        if ($kind === LandingPageKind::BrandCategory) {
            $query->where('product_category_id', $this->product_category_id);
        }

        if ($kind === LandingPageKind::BrandSolution) {
            $query->whereHas('solutions', fn ($q) => $q->whereKey($this->solution_id));
        }

        return $query->orderByDesc('is_featured')->orderBy('sort_order')->orderBy('name')->limit($limit)->get();
    }

    /**
     * Where this lives. Stored whole rather than composed at the call site —
     * see `Sluggable::publicPath()`, which this mirrors for a record that has
     * no slug of its own.
     */
    public function publicPath(): string
    {
        return (string) $this->path;
    }

    /* --------------------------------------------------------------- SEO */

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title,
            // From the intro, which is the written part, and through toText
            // rather than strip_tags — the rule the other nine descriptions
            // follow, and the one that stopped "…asked for.Remote support…"
            // being published as a meta description.
            'description' => str(HtmlSanitiser::toText($this->intro))->limit(155)->value(),
            'canonical_url' => rtrim((string) config('app.frontend_url'), '/').$this->path,
            'og_image' => null,
            /*
             * A location page is a `LocalBusiness`, the rest are `CollectionPage`.
             *
             * Not `Product` for the catalogue pages, however tempting: they list
             * hardware rather than being one item, and marking a listing up as a
             * single product is the structured-data equivalent of the thin page
             * this whole module is built to avoid — a claim about the page that
             * the page does not support.
             */
            'schema_type' => $this->kind instanceof LandingPageKind && $this->kind->isLocal()
                ? 'LocalBusiness'
                : 'CollectionPage',
        ];
    }
}
