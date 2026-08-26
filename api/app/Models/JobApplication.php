<?php

namespace App\Models;

use App\Enums\ApplicationStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

/**
 * Somebody's application to a vacancy.
 *
 * The most sensitive personal data in the product: a name, a phone number, an
 * employment history and a CV, given by someone who is not a customer and has
 * no account. Two rules follow from that and are enforced here rather than
 * remembered at call sites:
 *
 *   - **The CV never has a public URL.** It lives on the private disk and is
 *     streamed through an authorised controller, exactly like a ticket
 *     attachment.
 *   - **Deleting the record deletes the file.** A pruned application that
 *     leaves a CV on disk has not been deleted, it has been hidden.
 */
class JobApplication extends Model
{
    protected $fillable = [
        'job_opening_id', 'job_title', 'name', 'email', 'phone', 'current_company',
        'experience_years', 'cover_letter', 'portfolio_url',
        'cv_disk', 'cv_path', 'cv_filename', 'cv_mime', 'cv_size',
        'status', 'status_note', 'reviewed_by', 'reviewed_at', 'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'status' => ApplicationStatus::class,
            'reviewed_at' => 'datetime',
            'experience_years' => 'integer',
            'cv_size' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        /*
         * The file goes with the row.
         *
         * On the model rather than in the prune command, so it holds however
         * the record is removed — the nightly prune, a staff deletion, or a
         * cascade nobody thought about yet.
         */
        static::deleting(function (self $application) {
            $application->deleteCv();
        });
    }

    public function opening(): BelongsTo
    {
        return $this->belongsTo(JobOpening::class, 'job_opening_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function hasCv(): bool
    {
        return filled($this->cv_path);
    }

    public function deleteCv(): void
    {
        if (! $this->hasCv()) {
            return;
        }

        // Swallowed: a file already gone must not stop the row going.
        try {
            Storage::disk($this->cv_disk ?? 'local')->delete($this->cv_path);
        } catch (\Throwable) {
        }
    }

    public function scopeStatus(Builder $query, ?string $status): Builder
    {
        return $query->when($status, fn (Builder $q) => $q->where('status', $status));
    }

    public function scopeForOpening(Builder $query, ?int $openingId): Builder
    {
        return $query->when($openingId, fn (Builder $q) => $q->where('job_opening_id', $openingId));
    }

    public function scopeSearch(Builder $query, ?string $term): Builder
    {
        return $query->when($term, function (Builder $q) use ($term) {
            $like = '%'.$term.'%';
            $q->where(fn (Builder $inner) => $inner
                ->where('name', 'like', $like)
                ->orWhere('email', 'like', $like)
                ->orWhere('current_company', 'like', $like)
                ->orWhere('job_title', 'like', $like));
        });
    }
}
