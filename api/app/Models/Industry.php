<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Industry extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = ['name', 'slug', 'summary', 'body', 'icon', 'sort_order'];

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/industries';
    }

    public function solutions(): BelongsToMany
    {
        return $this->belongsToMany(Solution::class);
    }

    public function caseStudies(): HasMany
    {
        return $this->hasMany(CaseStudy::class);
    }

    public function defaultSeo(): array
    {
        return [
            'title' => 'IT infrastructure for '.$this->name.' — Technoware',
            'description' => str($this->summary ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/industries/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'WebPage',
        ];
    }
}
