<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only. Every rate in the module is counted from these rows rather than
 * read off a column, so a figure in a report can be checked against the events
 * behind it — and an `opened_at` that is overwritten can never answer "how many
 * times".
 */
class NewsletterEvent extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'newsletter_campaign_id', 'newsletter_subscriber_id', 'newsletter_link_id',
        'event_type', 'ip_address', 'user_agent',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(NewsletterCampaign::class, 'newsletter_campaign_id');
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'newsletter_subscriber_id');
    }
}
