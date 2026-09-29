<?php

namespace App\Models;

use App\Enums\PublishStatus;
use App\Models\Concerns\HasAnswerBlocks;
use App\Models\Concerns\HasCustomFields;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\RepathsLandingPages;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Answerable;
use App\Models\Contracts\Faqable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

class Service extends Model implements Answerable, Faqable
{
    use HasAnswerBlocks, HasCustomFields, HasSeo, RepathsLandingPages, Sluggable;

    protected $fillable = [
        'service_category_id', 'title', 'slug', 'summary', 'highlights', 'body', 'icon', 'image_path',
        'status', 'sort_order', 'show_in_menu',
    ];

    /** How many highlights a card draws, and how long one may be. */
    public const HIGHLIGHTS_MAX = 6;

    public const HIGHLIGHT_LENGTH = 40;

    protected function casts(): array
    {
        return ['status' => PublishStatus::class, 'show_in_menu' => 'boolean', 'highlights' => 'array'];
    }

    /**
     * The chips on the service's card, kept tidy on every write path — the
     * form, an import, a seeder: trimmed, blanks dropped, a repeat (in any
     * case) dropped, in the editor's order. An empty list is stored as null.
     *
     * @return Attribute<array<int, string>|null, mixed>
     */
    protected function highlights(): Attribute
    {
        return Attribute::make(
            set: function ($value) {
                $seen = [];
                $clean = [];

                foreach ((array) ($value ?? []) as $item) {
                    $text = trim((string) $item);
                    $key = mb_strtolower($text);

                    if ($text === '' || isset($seen[$key])) {
                        continue;
                    }

                    $seen[$key] = true;
                    $clean[] = $text;
                }

                return $clean === [] ? null : json_encode($clean, JSON_UNESCAPED_UNICODE);
            },
        );
    }

    public function urlPrefix(): string
    {
        return '/services';
    }

    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * The tab this service is drawn under. Null is "Other services": deleting
     * a category leaves its services here rather than taking them with it.
     *
     * @return BelongsTo<ServiceCategory, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ServiceCategory::class, 'service_category_id');
    }

    /**
     * Where this is offered.
     *
     * The inverse of `Location::services()`. It is what `areaServed` in the
     * structured data is built from — a list somebody ticked rather than the
     * company address repeated, which is the difference between a coverage
     * claim a search engine can use and one it should ignore.
     */
    /** @return BelongsToMany<Location, $this> */
    public function locations(): BelongsToMany
    {
        return $this->belongsToMany(Location::class);
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
            'description' => str(HtmlSanitiser::toText($this->summary ?? $this->body ?? ''))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/services/'.$this->slug,
            // The service's own picture, the rule a solution's hero follows.
            'og_image' => $this->image_path ? asset('storage/'.$this->image_path) : null,
            'schema_type' => 'Service',
        ];
    }

    /** Renaming this moves every landing page composed from it. See the trait. */
    public static function landingPageKeyColumn(): string
    {
        return 'service_id';
    }
}
