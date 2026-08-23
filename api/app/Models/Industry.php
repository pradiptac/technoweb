<?php

namespace App\Models;

use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
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
            // No brand suffix: the frontend's metadata template already
            // appends "| Technoware", and adding it here too put the name
            // in the <title> twice. Descriptive qualifiers stay — they say
            // what kind of page it is, which the template does not.
            'title' => 'IT infrastructure for '.$this->name,
            'description' => str(HtmlSanitiser::toText($this->summary ?? ''))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/industries/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'WebPage',
        ];
    }
}
