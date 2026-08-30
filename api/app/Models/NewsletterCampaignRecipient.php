<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class NewsletterCampaignRecipient extends Model
{
    protected $fillable = [
        'newsletter_campaign_id', 'newsletter_subscriber_id', 'email', 'status',
        'sent_at', 'delivered_at', 'opened_at', 'clicked_at', 'bounced_at',
        'unsubscribed_at', 'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
            'delivered_at' => 'datetime',
            'opened_at' => 'datetime',
            'clicked_at' => 'datetime',
            'bounced_at' => 'datetime',
            'unsubscribed_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        // Minted here for the reason the subscriber's token is: a recipient
        // without one is a tracking pixel and a set of links that 404, and
        // nothing notices until the report is empty.
        static::creating(fn (self $r) => $r->token ??= Str::random(48));
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(NewsletterCampaign::class, 'newsletter_campaign_id');
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'newsletter_subscriber_id');
    }
}
