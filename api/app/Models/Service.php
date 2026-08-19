<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Service extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = ['title', 'slug', 'summary', 'body', 'icon', 'status', 'sort_order'];

    protected function casts(): array
    {
        return ['status' => PublishStatus::class];
    }

    public function urlPrefix(): string
    {
        return '/services';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title.' — Technoware',
            'description' => str($this->summary ?? $this->body ?? '')->stripTags()->squish()->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/services/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'Service',
        ];
    }
}
