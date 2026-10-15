<?php

namespace App\Models;

use App\Enums\DownloadAccess;
use App\Enums\DownloadSource;
use App\Enums\PublishStatus;
use App\Support\Downloads\DownloadFiles;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphToMany;

/**
 * One file in the downloads centre — a datasheet, a driver, a firmware image
 * (0.131.0, docs/downloads.md).
 *
 * No slug and no page of its own: it is a row on `/downloads` and on the
 * pages of the products it belongs to, the `Certification` reasoning. What
 * it *is* is its file, and the file is one of two things (`source`): a path
 * in the media library, or a private upload this model owns and deletes
 * with itself.
 *
 * **Two rules live here rather than in a controller**, so a seeder, the
 * console and an import all meet them:
 *
 *   - `canBeServed()` is the one answer to "is there a file behind this":
 *     the public list, the file route and the publish check all ask it.
 *   - `download_count` is never written through the model. It is bumped by
 *     the query builder (`DownloadFiles::count()`), so a download does not
 *     move `updated_at` — which is the sitemap's `lastmod` for the page.
 */
class Download extends Model
{
    protected $fillable = [
        'download_category_id', 'title', 'summary', 'version', 'released_on',
        'access', 'source', 'file_path', 'private_path', 'file_name', 'file_size',
        'file_mime', 'status', 'sort_order',
    ];

    // Mirrors the column defaults — see `Popup::$attributes`.
    protected $attributes = [
        'access' => 'public',
        'source' => 'library',
        'status' => 'draft',
        'sort_order' => 0,
        'download_count' => 0,
    ];

    protected function casts(): array
    {
        return [
            'access' => DownloadAccess::class,
            'source' => DownloadSource::class,
            'status' => PublishStatus::class,
            'released_on' => 'date',
            'file_size' => 'integer',
            'sort_order' => 'integer',
            'download_count' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        // The private file goes with the row: nothing else can reach it, so
        // left behind it is bytes nobody will ever find. A library file
        // stays — the library's own bin is where one is removed.
        static::deleted(function (self $download) {
            DownloadFiles::discard($download->private_path);
        });
    }

    /** @return BelongsTo<DownloadCategory, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(DownloadCategory::class, 'download_category_id');
    }

    /** @return MorphToMany<Product, $this> */
    public function products(): MorphToMany
    {
        return $this->morphedByMany(Product::class, 'downloadable');
    }

    /** @return MorphToMany<StoreProduct, $this> */
    public function storeProducts(): MorphToMany
    {
        return $this->morphedByMany(StoreProduct::class, 'downloadable');
    }

    /**
     * Published, with a file behind it, on a shelf that is not switched off.
     *
     * The file half is in the query on purpose: a published row whose file
     * was never uploaded would otherwise be a row on the public page with a
     * button that 404s.
     *
     * @param  Builder<self>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('downloads.status', PublishStatus::Published)
            ->where(fn (Builder $q) => $q
                ->where(fn (Builder $w) => $w->where('downloads.source', DownloadSource::Library)->whereNotNull('downloads.file_path'))
                ->orWhere(fn (Builder $w) => $w->where('downloads.source', DownloadSource::Upload)->whereNotNull('downloads.private_path')))
            ->where(fn (Builder $q) => $q
                ->whereNull('downloads.download_category_id')
                ->orWhereHas('category', fn (Builder $c) => $c->where('is_active', true)));
    }

    /** `%` and `_` match themselves, the rule every search here follows. */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $like = '%'.addcslashes($term, '%_\\').'%';

        return $query->where(fn (Builder $q) => $q
            ->where('downloads.title', 'like', $like)
            ->orWhere('downloads.summary', 'like', $like)
            ->orWhere('downloads.version', 'like', $like)
            ->orWhere('downloads.file_name', 'like', $like));
    }

    /**
     * The centre's own order: shelf by shelf (unfiled last), then the order
     * an editor set, then newest release first, then by title.
     *
     * @param  Builder<self>  $query
     */
    public function scopeShelved(Builder $query): void
    {
        $query
            ->leftJoin('download_categories as dc', 'dc.id', '=', 'downloads.download_category_id')
            ->select('downloads.*')
            ->orderByRaw('CASE WHEN dc.id IS NULL THEN 1 ELSE 0 END')
            ->orderBy('dc.sort_order')
            ->orderBy('dc.name')
            ->orderBy('downloads.sort_order')
            ->orderByDesc('downloads.released_on')
            ->orderBy('downloads.title')
            ->orderBy('downloads.id');
    }

    public function isPublished(): bool
    {
        return $this->status === PublishStatus::Published;
    }

    public function isLocked(): bool
    {
        return $this->access === DownloadAccess::Customers;
    }

    /** Whether there is a file to hand over. */
    public function hasFile(): bool
    {
        return $this->source === DownloadSource::Upload
            ? filled($this->private_path)
            : filled($this->file_path);
    }

    public function adminPath(): string
    {
        return "/admin/downloads/{$this->id}";
    }
}
