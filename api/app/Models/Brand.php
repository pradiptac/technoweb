<?php

namespace App\Models;

use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\RepathsLandingPages;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Brand extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, RepathsLandingPages, Sluggable;

    protected $fillable = ['name', 'slug', 'logo_path', 'description', 'sort_order', 'is_featured', 'partner_tier'];

    protected function casts(): array
    {
        return ['is_featured' => 'boolean'];
    }

    protected function slugSource(): string
    {
        return 'name';
    }

    public function urlPrefix(): string
    {
        return '/brands';
    }

    /** @return HasMany<Product, $this> */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** Renaming a brand moves every landing page composed from it. See the trait. */
    public static function landingPageKeyColumn(): string
    {
        return 'brand_id';
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
