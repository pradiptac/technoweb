<?php

namespace App\Models;

use App\Enums\EmploymentType;
use App\Enums\PublishStatus;
use App\Models\Concerns\HasSeo;
use App\Models\Concerns\Sluggable;
use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A vacancy.
 *
 * `Sluggable` because it has a URL of its own — `/careers/network-engineer` —
 * so a renamed role writes its 301 like every other slugged entity. That is the
 * test the sliders failed and why they do not use the trait.
 *
 * **Not `Job`, and the table is not `jobs`.** Laravel owns that name: `jobs` is
 * the database queue's table, and `QUEUE_CONNECTION=database` here means it is
 * in use. The collision is not theoretical — it is how this migration failed
 * the first time it ran.
 */
class JobOpening extends Model
{
    use HasSeo, Sluggable;

    protected $fillable = [
        'title', 'slug', 'department', 'location', 'employment_type', 'openings',
        'job_experience_level_id', 'salary_min', 'salary_max', 'salary_period', 'salary_currency',
        'summary', 'description', 'responsibilities', 'requirements',
        'status', 'published_at', 'closes_at', 'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'status' => PublishStatus::class,
            'employment_type' => EmploymentType::class,
            'responsibilities' => 'array',
            'requirements' => 'array',
            'published_at' => 'datetime',
            'closes_at' => 'date',
            'openings' => 'integer',
            'salary_min' => 'integer',
            'salary_max' => 'integer',
        ];
    }

    public function urlPrefix(): string
    {
        return '/careers';
    }

    public function defaultSeo(): array
    {
        $where = filled($this->location) ? " in {$this->location}" : '';

        return [
            'title' => $this->title.$where,
            'description' => str(HtmlSanitiser::toText($this->summary ?? $this->description ?? ''))->limit(155)->value(),
            'canonical_url' => config('app.frontend_url').'/careers/'.$this->slug,
            'og_image' => null,
            /*
             * `JobPosting`, which is what puts a vacancy into Google Jobs --
             * where people looking for work actually search. The frontend emits
             * the full block; this is the type the SEO layer records.
             */
            'schema_type' => 'JobPosting',
        ];
    }

    public function experienceLevel(): BelongsTo
    {
        return $this->belongsTo(JobExperienceLevel::class, 'job_experience_level_id');
    }

    public function qualifications(): BelongsToMany
    {
        return $this->belongsToMany(JobQualification::class);
    }

    public function applications(): HasMany
    {
        return $this->hasMany(JobApplication::class);
    }

    /**
     * Published, dated, and not past its closing date.
     *
     * The closing date is enforced here rather than left to whoever remembers
     * to archive the row. A careers page advertising a role that closed in March
     * is the usual way one starts lying, and it costs a candidate their time.
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query
            ->where('status', PublishStatus::Published)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->where(fn (Builder $q) => $q
                ->whereNull('closes_at')
                ->orWhere('closes_at', '>=', now()->toDateString()));
    }

    /** Whether this vacancy may still take an application. */
    public function isOpen(): bool
    {
        if ($this->status !== PublishStatus::Published || $this->published_at === null) {
            return false;
        }

        return $this->closes_at === null || ! $this->closes_at->isPast();
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        return $query->when($term, function (Builder $q) use ($term) {
            $like = '%'.$term.'%';
            $q->where(fn (Builder $inner) => $inner
                ->where('title', 'like', $like)
                ->orWhere('department', 'like', $like)
                ->orWhere('location', 'like', $like));
        });
    }

    /** Formatted for display, or null when the range was left blank. */
    public function salaryRange(): ?string
    {
        if (! $this->salary_min && ! $this->salary_max) {
            return null;
        }

        $fmt = fn (?int $n) => $n ? number_format($n) : null;
        $period = $this->salary_period === 'month' ? 'a month' : 'a year';

        if ($this->salary_min && $this->salary_max) {
            return "{$this->salary_currency} {$fmt($this->salary_min)}-{$fmt($this->salary_max)} {$period}";
        }

        $one = $fmt($this->salary_min ?: $this->salary_max);
        $lead = $this->salary_min ? 'From' : 'Up to';

        return "{$lead} {$this->salary_currency} {$one} {$period}";
    }
}
