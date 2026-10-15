<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasRevisions;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * A notice inviting bids (0.174.0, `docs/tenders.md`): a reference, a scope
 * of work, the window it is open for, its documents and how to submit.
 *
 * It has a page at `/tenders/{slug}` and that is the whole of it — **nothing
 * is submitted here.** A bidder reads the notice, downloads its documents
 * and bids the way the notice says: by email, by post, or on whichever
 * portal the buyer named.
 *
 * **Status alone decides whether it is public** (the event's rule): there is
 * no `published_at`, because the dates here are `opens_at` and `closes_at`
 * and a third meaning "when this page went up" is one nobody would set.
 *
 * **A closed tender stays on the site.** It is read-only history — what this
 * company has invited bids for — and taking it down would break every link
 * to it and lose the only evidence the notice ever existed.
 *
 * Whether it is open right now is `App\Support\Tenders\TenderWindow`, and
 * nothing here duplicates it: `scopeOpen`/`scopeClosed` are its SQL twins
 * for a query that cannot build one per row, and `isOpen`/`isClosed` its PHP
 * twins. Three answers to "is this open" is how a deadline gets shown wrong.
 *
 * @property PublishStatus $status
 * @property Carbon $opens_at
 * @property Carbon $closes_at
 * @property Carbon|null $opening_at
 * @property Carbon|null $prebid_at
 * @property array<int, array<string, mixed>>|null $documents
 */
class Tender extends Model
{
    use HasRevisions, HasSeo, Sluggable;

    /**
     * How near the closing date counts as "closing soon".
     *
     * A constant and not a setting: it is one number, nobody will change it,
     * and a settings screen for it would be chrome on a module whose whole
     * point is that it is simple.
     */
    public const CLOSING_SOON_DAYS = 3;

    /** As many documents as a tender may carry. */
    public const MAX_DOCUMENTS = 10;

    protected $fillable = [
        'tender_category_id',
        'reference', 'title', 'slug', 'summary', 'description',
        'status', 'is_featured', 'sort_order',
        'opens_at', 'closes_at', 'opening_at', 'prebid_at', 'prebid_place',
        'fee_paise', 'emd_paise',
        'submission_email', 'submission_url', 'submission_address',
        'contact_name', 'contact_phone', 'contact_email',
        'documents',
    ];

    /**
     * The column defaults, in memory too — a tender created and asked about
     * in the same breath must not read `is_featured` as null (the bug the
     * store models were fixed for).
     */
    protected $attributes = [
        'status' => 'draft',
        'is_featured' => false,
        'sort_order' => 0,
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'is_featured' => 'boolean',
            'sort_order' => 'integer',
            'opens_at' => 'datetime',
            'closes_at' => 'datetime',
            'opening_at' => 'datetime',
            'prebid_at' => 'datetime',
            'fee_paise' => 'integer',
            'emd_paise' => 'integer',
            // A list, and JSON arrays keep their order — the editor's order
            // of the documents is content.
            'documents' => 'array',
        ];
    }

    public function urlPrefix(): string
    {
        return '/tenders';
    }

    /** A path, never a URL — see CLAUDE.md on `frontend_url` in the console. */
    public function adminPath(): string
    {
        return '/admin/tenders/'.$this->id;
    }

    /** The page, absolute, for an email. */
    public function publicUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->publicPath();
    }

    /** @return BelongsTo<TenderCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(TenderCategory::class, 'tender_category_id');
    }

    /**
     * On the public site: published, and not filed under a category
     * somebody has switched off.
     *
     * That last clause is how `is_active` on a category hides its tenders
     * without touching them — the downloads centre's rule. **A closed
     * tender is still published**, so it is not excluded here: the window is
     * a separate question, asked by `scopeOpen`/`scopeClosed`.
     *
     * @param  Builder<self>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('tenders.status', PublishStatus::Published)
            ->where(fn (Builder $q) => $q
                ->whereNull('tenders.tender_category_id')
                ->orWhereHas('category', fn (Builder $c) => $c->where('is_active', true)));
    }

    /**
     * Taking bids right now. The SQL twin of `isOpen()`.
     *
     * @param  Builder<self>  $query
     */
    public function scopeOpen(Builder $query, ?CarbonInterface $now = null): void
    {
        $now ??= now();

        $query->where('tenders.opens_at', '<=', $now)->where('tenders.closes_at', '>', $now);
    }

    /**
     * Past its closing date. The SQL twin of `isClosed()`.
     *
     * @param  Builder<self>  $query
     */
    public function scopeClosed(Builder $query, ?CarbonInterface $now = null): void
    {
        $query->where('tenders.closes_at', '<=', $now ?? now());
    }

    /**
     * Not open yet.
     *
     * @param  Builder<self>  $query
     */
    public function scopeUpcoming(Builder $query, ?CarbonInterface $now = null): void
    {
        $query->where('tenders.opens_at', '>', $now ?? now());
    }

    public function isOpen(?CarbonInterface $now = null): bool
    {
        $now ??= now();

        return $this->opens_at->lte($now) && $this->closes_at->gt($now);
    }

    public function isClosed(?CarbonInterface $now = null): bool
    {
        return $this->closes_at->lte($now ?? now());
    }

    public function isPublished(): bool
    {
        return $this->status === PublishStatus::Published;
    }

    /**
     * `%` and `_` match themselves, the rule every search here follows.
     *
     * Every column is qualified, because a caller may have joined the
     * category — an unqualified `title` would be ambiguous.
     *
     * The last clause is the knowledge base's: a reference is punctuated
     * (`TW/2026/01`) and nobody types the punctuation, so the stored
     * reference is compared with its own punctuation stripped out. Three
     * characters is the floor, or a two-letter fragment matches every
     * reference there is.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $query;
        }

        $like = '%'.addcslashes($term, '%_\\').'%';
        $compact = (string) preg_replace('/[^a-z0-9]/i', '', $term);

        return $query->where(function (Builder $q) use ($like, $compact) {
            $q->where('tenders.reference', 'like', $like)
                ->orWhere('tenders.title', 'like', $like)
                ->orWhere('tenders.summary', 'like', $like)
                ->orWhere('tenders.description', 'like', $like);

            if (strlen($compact) >= 3) {
                $q->orWhereRaw(
                    "REPLACE(REPLACE(REPLACE(REPLACE(LOWER(tenders.reference), '/', ''), '-', ''), ' ', ''), '.', '') LIKE ?",
                    ['%'.strtolower($compact).'%']
                );
            }
        });
    }

    /**
     * @return array<string, mixed>
     */
    public function defaultSeo(): array
    {
        return [
            'title' => $this->title,
            'description' => str(HtmlSanitiser::toText($this->summary ?: ($this->description ?? '')))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/tenders/'.$this->slug,
            'og_image' => null,
            // Schema.org has no tender type and Google has no tender rich
            // result, so the graph claims nothing more than that this is a
            // page. Nothing in a graph is guessed.
            'schema_type' => 'WebPage',
        ];
    }
}
