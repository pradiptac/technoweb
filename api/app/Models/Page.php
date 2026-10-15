<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasRevisions;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Page extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasCustomFields, HasRevisions, HasSeo, Sluggable;

    protected $fillable = ['title', 'slug', 'body', 'blocks', 'template', 'status', 'published_at'];

    protected function casts(): array
    {
        return ['blocks' => 'array', 'status' => PublishStatus::class, 'published_at' => 'datetime'];
    }

    public function urlPrefix(): string
    {
        return '';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /** @return MorphMany<Faq, $this> */
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
            'description' => str(HtmlSanitiser::toText($this->body ?? ''))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/'.$this->slug,
            'og_image' => null,
            'schema_type' => 'WebPage',
        ];
    }
}
