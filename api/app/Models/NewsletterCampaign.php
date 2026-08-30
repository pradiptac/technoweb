<?php

namespace App\Models;

use App\Enums\CampaignStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class NewsletterCampaign extends Model
{
    protected $fillable = [
        'newsletter_template_id', 'created_by', 'name', 'subject', 'preheader',
        'from_name', 'from_email', 'reply_to', 'blocks', 'html_content',
        'text_content', 'status', 'scheduled_at', 'started_at', 'completed_at',
        'recipient_count', 'health_score', 'test_sent_at',
        'attachment_path', 'attachment_name', 'attachment_bytes',
    ];

    protected function casts(): array
    {
        return [
            'blocks' => 'array',
            'status' => CampaignStatus::class,
            'scheduled_at' => 'datetime',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'test_sent_at' => 'datetime',
            'recipient_count' => 'integer',
            'health_score' => 'integer',
            'attachment_bytes' => 'integer',
        ];
    }

    public function template(): BelongsTo
    {
        return $this->belongsTo(NewsletterTemplate::class, 'newsletter_template_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function groups(): BelongsToMany
    {
        return $this->belongsToMany(
            NewsletterGroup::class,
            'newsletter_campaign_groups',
            'newsletter_campaign_id',
            'newsletter_group_id',
        );
    }

    public function recipients(): HasMany
    {
        return $this->hasMany(NewsletterCampaignRecipient::class, 'newsletter_campaign_id');
    }

    public function links(): HasMany
    {
        return $this->hasMany(NewsletterLink::class, 'newsletter_campaign_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(NewsletterEvent::class, 'newsletter_campaign_id');
    }
}
