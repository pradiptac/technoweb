<?php

namespace App\Models;

use App\Enums\WebhookEvent;
use App\Support\Webhooks\WebhookPayload;
use App\Support\Webhooks\Webhooks;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FormSubmission extends Model
{
    protected $fillable = ['form_id', 'form_slug', 'data', 'ip_address', 'read_at'];

    protected function casts(): array
    {
        return ['data' => 'array', 'read_at' => 'datetime'];
    }

    protected static function booted(): void
    {
        // `form.submitted` carries the raw answers; the lead made from them
        // announces itself separately as `lead.created`.
        static::created(function (self $submission) {
            Webhooks::emit(WebhookEvent::FormSubmitted, WebhookPayload::formSubmission($submission));
        });
    }

    /** @return BelongsTo<Form, $this> */
    public function form(): BelongsTo
    {
        return $this->belongsTo(Form::class);
    }
}
