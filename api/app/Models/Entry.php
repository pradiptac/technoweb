<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\CustomFields\EntryTargets;
use App\Support\HtmlSanitiser;
use App\Support\MediaUrl;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Str;

/**
 * One record of a custom content type (docs/custom-content.md).
 *
 * It lives at `/{type-slug}/{slug}`, so `urlPrefix()` is the type's slug and
 * `Sluggable`'s 301-on-rename works as it does for every other record. What
 * differs is uniqueness: a slug is unique **within its type** — the index is
 * `(content_type_id, slug)` — so `generateUniqueSlug()` is overridden to ask
 * only its own type, and the request's rule says the same.
 *
 * The type is read through `typeSlug()`, never `$this->contentType->slug`
 * from anywhere that might run without the relation: `preventLazyLoading` is
 * on, and the SEO overview, IndexNow and the redirect hook all reach this
 * model from places that did not eager-load it.
 */
class Entry extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasCustomFields, HasSeo, Sluggable;

    protected $fillable = [
        'content_type_id', 'title', 'slug', 'summary', 'body', 'image_path',
        'status', 'published_at', 'sort_order',
    ];

    private ?string $typeSlugCache = null;

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'published_at' => 'datetime',
            'sort_order' => 'integer',
        ];
    }

    /** @return BelongsTo<ContentType, $this> */
    public function contentType(): BelongsTo
    {
        return $this->belongsTo(ContentType::class);
    }

    /** @return MorphMany<Faq, $this> */
    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    /**
     * Published, dated no later than now, and of a type that is switched on
     * — the one definition the archive, the detail read, the sitemap and
     * search all use.
     *
     * @param  Builder<Entry>  $query
     * @return Builder<Entry>
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published)
            ->where(fn ($q) => $q->whereNull('published_at')->orWhere('published_at', '<=', now()))
            ->whereHas('contentType', fn ($q) => $q->where('is_active', true));
    }

    public function isPublic(): bool
    {
        return $this->status === PublishStatus::Published
            && ($this->published_at === null || $this->published_at->lte(now()));
    }

    /** The type's slug, from the loaded relation or one query — never a lazy load. */
    public function typeSlug(): string
    {
        if ($this->relationLoaded('contentType') && $this->contentType !== null) {
            return (string) $this->contentType->slug;
        }

        return $this->typeSlugCache ??= (string) ContentType::query()->whereKey($this->content_type_id)->value('slug');
    }

    public function urlPrefix(): string
    {
        return '/'.$this->typeSlug();
    }

    public function customFieldTarget(): string
    {
        return EntryTargets::PREFIX.$this->typeSlug();
    }

    /** The console route, which is per type rather than one prefix. */
    public function adminPath(): string
    {
        return '/admin/content/'.$this->typeSlug().'/'.$this->id;
    }

    /**
     * Unique within the type, not the table: `/events/launch` and
     * `/downloads/launch` are two different pages.
     */
    public function generateUniqueSlug(string $source): string
    {
        $slug = Str::slug($source) ?: 'entry';
        $candidate = $slug;
        $i = 2;

        while (
            static::query()
                ->where('content_type_id', $this->content_type_id)
                ->where('slug', $candidate)
                ->when($this->exists, fn ($q) => $q->whereKeyNot($this->getKey()))
                ->exists()
        ) {
            $candidate = $slug.'-'.$i++;
        }

        return $candidate;
    }

    public function defaultSeo(): array
    {
        $schema = $this->relationLoaded('contentType') && $this->contentType
            ? $this->contentType->schema_type
            : ContentType::query()->whereKey($this->content_type_id)->value('schema_type');

        return [
            'title' => $this->title,
            'description' => str(HtmlSanitiser::toText($this->summary ?: ($this->body ?? '')))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').$this->publicPath(),
            'og_image' => $this->image_path ? MediaUrl::for($this->image_path) : null,
            'schema_type' => in_array($schema, ContentType::SCHEMA_TYPES, true) ? $schema : 'Article',
        ];
    }
}
