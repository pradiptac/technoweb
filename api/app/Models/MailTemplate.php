<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One editor's override for one of the system's emails.
 *
 * @property string $key
 * @property string|null $subject
 * @property string|null $body_html
 * @property string|null $body_text
 * @property bool $is_enabled
 */
class MailTemplate extends Model
{
    protected $fillable = [
        'key', 'subject', 'body_html', 'body_text', 'is_enabled', 'updated_by',
    ];

    protected function casts(): array
    {
        return ['is_enabled' => 'boolean'];
    }

    /**
     * Mirrors the column default.
     *
     * A database default only applies on the way *back*, so a row created and
     * asked about in the same breath reports null for a column that plainly
     * has one — which is how a store variation created in a test called itself
     * unsellable. Nothing in the application does that today and a test will.
     */
    protected $attributes = [
        'is_enabled' => true,
    ];

    public function editor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * Is there anything here worth sending?
     *
     * Three shapes of "no", and a single condition covering two of them looks
     * correct: switched off, no subject, no body. Each falls back to the
     * built-in message rather than sending half a template.
     */
    public function isUsable(): bool
    {
        return $this->is_enabled && filled($this->subject) && filled($this->body_html);
    }
}
