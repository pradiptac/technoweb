<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\RepathsLandingPages;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Solution extends Model
{
    use HasSeo, RepathsLandingPages, Sluggable;

    protected $fillable = [
        'title', 'slug', 'summary', 'problem_statement', 'overview',
        'benefits', 'technologies', 'icon', 'hero_image_path', 'status', 'sort_order',
        'show_in_menu',
    ];

    protected function casts(): array
    {
        return [
            'show_in_menu' => 'boolean',
            'benefits' => 'array',
            'technologies' => 'array',
            'status' => PublishStatus::class,
        ];
    }

    public function urlPrefix(): string
    {
        return '/solutions';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class);
    }

    public function industries(): BelongsToMany
    {
        return $this->belongsToMany(Industry::class);
    }

    /**
     * Where this is offered.
     *
     * The inverse of `Location::services()`. It is what `areaServed` in the
     * structured data is built from — a list somebody ticked rather than the
     * company address repeated, which is the difference between a coverage
     * claim a search engine can use and one it should ignore.
     */
    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(Location::class);
    }

    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    public function defaultSeo(): array
    {
        return [
            // No brand suffix: the frontend's metadata template already
            // appends "| Technoware", and adding it here too put the name
            // in the <title> twice. Descriptive qualifiers stay — they say
            // what kind of page it is, which the template does not.
            'title' => $this->title,
            'description' => str(HtmlSanitiser::toText($this->summary ?? $this->overview ?? ''))
                ->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/solutions/'.$this->slug,
            'og_image' => $this->hero_image_path ? asset('storage/'.$this->hero_image_path) : null,
            'schema_type' => 'Service',
        ];
    }

    /** Renaming this moves every landing page composed from it. See the trait. */
    public static function landingPageKeyColumn(): string
    {
        return 'solution_id';
    }
}
