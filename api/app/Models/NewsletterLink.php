<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NewsletterLink extends Model
{
    protected $fillable = [
        'newsletter_campaign_id', 'url', 'label', 'hash', 'total_clicks', 'unique_clicks',
    ];

    protected function casts(): array
    {
        return ['total_clicks' => 'integer', 'unique_clicks' => 'integer'];
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(NewsletterCampaign::class, 'newsletter_campaign_id');
    }
}
