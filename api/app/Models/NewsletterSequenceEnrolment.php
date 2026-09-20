<?php

namespace App\Models;

use App\Enums\EnrolmentStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One subscriber's place in one sequence: which step is next, and when.
 *
 * Unique per (sequence, subscriber) — see the migration. The cursor is a
 * *position*, not a step id: if a step is removed or the steps reordered,
 * the enrolment gets whatever now sits at that position rather than
 * pointing at a row that has gone.
 */
class NewsletterSequenceEnrolment extends Model
{
    protected $fillable = [
        'newsletter_sequence_id', 'newsletter_subscriber_id', 'next_position', 'next_at',
        'status', 'enrolled_at', 'completed_at', 'cancelled_reason',
    ];

    protected function casts(): array
    {
        return [
            'status' => EnrolmentStatus::class,
            'next_position' => 'integer',
            'next_at' => 'datetime',
            'enrolled_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<NewsletterSequence, $this> */
    public function sequence(): BelongsTo
    {
        return $this->belongsTo(NewsletterSequence::class, 'newsletter_sequence_id');
    }

    /** @return BelongsTo<NewsletterSubscriber, $this> */
    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'newsletter_subscriber_id');
    }
}
