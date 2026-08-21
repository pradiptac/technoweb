<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CaseStudy extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'industry_id', 'title', 'slug', 'client_name', 'summary',
        'body', 'results', 'cover_image_path', 'status',
    ];

    protected function casts(): array
    {
        return ['results' => 'array', 'status' => PublishStatus::class];
    }

    public function urlPrefix(): string
    {
        return '/case-studies';
    }

    public function industry(): BelongsTo
    {
        return $this->belongsTo(Industry::class);
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function defaultSeo(): array
    {
        return [
            // No brand suffix: the frontend's metadata template already
            // appends "| Technoware", and adding it here too put the name
            // in the <title> twice. Descriptive qualifiers stay — they say
            // what kind of page it is, which the template does not.
            'title' => $this->title.' — case study',
            'description' => str($this->summary ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/case-studies/'.$this->slug,
            'og_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'schema_type' => 'Article',
        ];
    }
}
