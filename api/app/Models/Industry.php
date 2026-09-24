<?php

namespace App\Models;

use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Industry extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasSeo, Sluggable;

    protected $fillable = ['name', 'slug', 'summary', 'body', 'icon', 'sort_order', 'show_in_menu'];

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/industries';
    }

    /** @return BelongsToMany<Solution, $this> */
    public function solutions(): BelongsToMany
    {
        return $this->belongsToMany(Solution::class);
    }

    /** @return HasMany<CaseStudy, $this> */
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

    /**
     * Questions answered on this record's page, in order. Widened to this
     * model on 2026-09-21 (`docs/aeo-geo-contract.md`, section 2): the
     * FAQPage gate in `StructuredData::answerFaqs()` reads these beside the
     * `question` answer blocks.
     *
     * @return MorphMany<Faq, $this>
     */
    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }
}
