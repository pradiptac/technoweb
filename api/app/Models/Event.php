<?php

namespace App\Models;

use App\Enums\EventFormat;
use App\Enums\EventRegistrationMode;
use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Models\Contracts\Faqable;
use App\Support\Events\EventCounts;
use App\Support\HtmlSanitiser;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * Something with a date that people attend (0.118.0, `docs/events.md`): a
 * seminar, a webinar, a product demonstration, a stand at a trade show.
 *
 * It has a page at `/events/{slug}` and, when `registration_mode` is `open`,
 * a free registration with an optional capacity and waiting list. Nothing
 * here takes a payment and nothing recurs — each date is its own event.
 *
 * **Status alone decides whether it is public** (the case study's rule):
 * there is no `published_at`, because an event's date is `starts_at` and a
 * second date meaning "when this page went up" is one nobody would set.
 *
 * **`online_url` is the one column no public resource may carry.** It is the
 * join link, and it goes to people who registered — in the confirmation
 * email and its calendar file. `EventResource` and `EventDetailResource` do
 * not name it, and `EventTest` asserts the key is absent.
 *
 * @property PublishStatus $status
 * @property EventFormat $format
 * @property EventRegistrationMode $registration_mode
 * @property Carbon $starts_at
 * @property Carbon|null $ends_at
 * @property Carbon|null $registration_closes_at
 * @property array<int, array<string, mixed>>|null $speakers
 * @property array<int, array<string, mixed>>|null $agenda
 */
class Event extends Model implements Faqable
{
    use HasSeo, Sluggable;

    /**
     * Slugs the event's own routes already mean something by: the manage
     * page is `/events/registration/{token}` on the site and
     * `events/registrations/{token}` here, so an event called
     * "Registration" would be a page nobody could open.
     */
    public const RESERVED_SLUGS = ['registration', 'registrations'];

    public const MAX_SPEAKERS = 12;

    public const MAX_AGENDA = 30;

    /** How long an event with no end is drawn in a calendar. */
    public const DEFAULT_MINUTES = 60;

    /**
     * The seats taken and waiting, kept for the request.
     *
     * A plain property and deliberately **not** `setRelation()`: a queued
     * notification serialises its models with the names of their loaded
     * relations and `load()`s them again in the worker, and a "relation"
     * that is not one throws there — in a job, a minute later, far from
     * whatever set it.
     */
    private ?EventCounts $counts = null;

    protected $fillable = [
        'title', 'slug', 'summary', 'body', 'status', 'is_featured',
        'format', 'starts_at', 'ends_at',
        'venue_name', 'venue_city', 'venue_address', 'map_url', 'online_url',
        'cover_image_path', 'speakers', 'agenda',
        'registration_mode', 'external_url', 'capacity', 'waitlist_enabled', 'max_seats',
        'registration_closes_at',
    ];

    /**
     * The column defaults, in memory too — a model created and asked about
     * in the same breath must not read `waitlist_enabled` as null (the bug
     * the store models were fixed for).
     */
    protected $attributes = [
        'status' => 'draft',
        'is_featured' => false,
        'format' => 'in_person',
        'registration_mode' => 'none',
        'waitlist_enabled' => false,
        'max_seats' => 5,
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'format' => EventFormat::class,
            'registration_mode' => EventRegistrationMode::class,
            'is_featured' => 'boolean',
            'waitlist_enabled' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'registration_closes_at' => 'datetime',
            // Lists, and JSON arrays keep their order — the running order is content.
            'speakers' => 'array',
            'agenda' => 'array',
            'capacity' => 'integer',
            'max_seats' => 'integer',
        ];
    }

    public function urlPrefix(): string
    {
        return '/events';
    }

    /** A path, never a URL — see CLAUDE.md on `frontend_url` in the console. */
    public function adminPath(): string
    {
        return '/admin/events/'.$this->id;
    }

    /** The page, absolute, for an email or a calendar file. */
    public function publicUrl(): string
    {
        return rtrim((string) config('app.frontend_url'), '/').$this->publicPath();
    }

    /**
     * A free slug, never one of the reserved two. `Sluggable`'s own loop,
     * with "Registration" treated as taken.
     */
    public function generateUniqueSlug(string $source): string
    {
        $slug = Str::slug($source) ?: 'event';
        $candidate = $slug;
        $i = 2;

        while (
            in_array($candidate, self::RESERVED_SLUGS, true)
            || static::query()
                ->where('slug', $candidate)
                ->when($this->exists, fn ($q) => $q->whereKeyNot($this->getKey()))
                ->exists()
        ) {
            $candidate = $slug.'-'.$i++;
        }

        return $candidate;
    }

    /** @param  Builder<Event>  $query */
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', PublishStatus::Published);
    }

    /**
     * Still to come, or still going on.
     *
     * An event counts as upcoming until it **ends** — or, with no end, until
     * the end of the day it starts on. Somebody looking at "what's on" at
     * two in the afternoon wants the seminar that began at ten.
     *
     * @param  Builder<Event>  $query
     */
    public function scopeUpcoming(Builder $query, ?CarbonInterface $now = null): Builder
    {
        $now ??= now();

        return $query->where(fn (Builder $q) => $q
            ->where(fn (Builder $w) => $w->whereNotNull('ends_at')->where('ends_at', '>=', $now))
            ->orWhere(fn (Builder $w) => $w->whereNull('ends_at')->where('starts_at', '>=', $now->copy()->startOfDay())));
    }

    /** @param  Builder<Event>  $query */
    public function scopePast(Builder $query, ?CarbonInterface $now = null): Builder
    {
        $now ??= now();

        return $query->where(fn (Builder $q) => $q
            ->where(fn (Builder $w) => $w->whereNotNull('ends_at')->where('ends_at', '<', $now))
            ->orWhere(fn (Builder $w) => $w->whereNull('ends_at')->where('starts_at', '<', $now->copy()->startOfDay())));
    }

    /**
     * Title, summary, body and the place.
     *
     * @param  Builder<Event>  $query
     */
    public function scopeSearch(Builder $query, string $term): Builder
    {
        $like = '%'.addcslashes($term, '%_\\').'%';

        return $query->where(fn (Builder $q) => $q
            ->where('title', 'like', $like)
            ->orWhere('summary', 'like', $like)
            ->orWhere('body', 'like', $like)
            ->orWhere('venue_name', 'like', $like)
            ->orWhere('venue_city', 'like', $like));
    }

    public function isPublished(): bool
    {
        return $this->status === PublishStatus::Published;
    }

    /** The moment the doors open. After it, nobody registers and nobody cancels. */
    public function hasStarted(?CarbonInterface $now = null): bool
    {
        return $this->starts_at->lte($now ?? now());
    }

    /** The same rule `scopePast()` writes in SQL: over, or the day it started on is. */
    public function isPast(?CarbonInterface $now = null): bool
    {
        $now ??= now();

        return $this->ends_at !== null
            ? $this->ends_at->lt($now)
            : $this->starts_at->lt($now->copy()->startOfDay());
    }

    /** When a calendar should draw it ending: the end, else an hour after the start. */
    public function calendarEnd(): Carbon
    {
        return $this->ends_at ?? $this->starts_at->copy()->addMinutes(self::DEFAULT_MINUTES);
    }

    public function takesRegistrations(): bool
    {
        return $this->registration_mode === EventRegistrationMode::Open;
    }

    /**
     * The seats taken and waiting, counted once and kept on the model —
     * `EventCounts::load()` fills a page of events in one query, and a
     * single event asks for its own.
     */
    public function registrationCounts(): EventCounts
    {
        return $this->counts ??= EventCounts::for($this);
    }

    public function setRegistrationCounts(EventCounts $counts): static
    {
        $this->counts = $counts;

        return $this;
    }

    /** Drop the kept counts — after a write that changed them. */
    public function forgetRegistrationCounts(): static
    {
        $this->counts = null;

        return $this;
    }

    public function defaultSeo(): array
    {
        return [
            'title' => $this->title,
            'description' => str(HtmlSanitiser::toText($this->summary ?: ($this->body ?? '')))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/events/'.$this->slug,
            'og_image' => $this->cover_image_path ? asset('storage/'.$this->cover_image_path) : null,
            'schema_type' => 'Event',
        ];
    }

    /**
     * Questions answered on the event's page, in order — "is there
     * parking?", "will it be recorded?". Replaced wholesale by the form.
     *
     * @return MorphMany<Faq, $this>
     */
    public function faqs(): MorphMany
    {
        return $this->morphMany(Faq::class, 'faqable')->orderBy('sort_order');
    }

    /** @return HasMany<EventRegistration, $this> */
    public function registrations(): HasMany
    {
        return $this->hasMany(EventRegistration::class);
    }
}
