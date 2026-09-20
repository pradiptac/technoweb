<?php

namespace App\Models;

use App\Enums\CampaignStatus;
use App\Enums\SequenceStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * An automation sequence: a series of steps sent to each subscriber on a
 * schedule from the day they are enrolled.
 *
 * The steps are `NewsletterCampaign` rows at status `automation`, ordered
 * by `sequence_position`, each with its own `delay_days` — so a step has the
 * block editor, health checks, tracking and a report without a second
 * implementation of any of them. What this row owns is the trigger (a group,
 * or none for every new subscriber), the sender and whether it is running.
 */
class NewsletterSequence extends Model
{
    protected $fillable = [
        'name', 'status', 'newsletter_group_id', 'from_name', 'from_email', 'reply_to', 'created_by',
    ];

    protected function casts(): array
    {
        return [
            'status' => SequenceStatus::class,
            'newsletter_group_id' => 'integer',
        ];
    }

    public function isActive(): bool
    {
        return $this->status === SequenceStatus::Active;
    }

    /**
     * The steps, in the order they are sent.
     *
     * @return HasMany<NewsletterCampaign, $this>
     */
    public function steps(): HasMany
    {
        return $this->hasMany(NewsletterCampaign::class, 'sequence_id')
            ->where('status', CampaignStatus::Automation->value)
            ->orderBy('sequence_position');
    }

    /** @return HasMany<NewsletterSequenceEnrolment, $this> */
    public function enrolments(): HasMany
    {
        return $this->hasMany(NewsletterSequenceEnrolment::class, 'newsletter_sequence_id');
    }

    /**
     * The group whose new members are enrolled; null means every new subscriber.
     *
     * @return BelongsTo<NewsletterGroup, $this>
     */
    public function group(): BelongsTo
    {
        return $this->belongsTo(NewsletterGroup::class, 'newsletter_group_id');
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
