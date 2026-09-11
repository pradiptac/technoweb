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
 * @property bool $is_enabled use the editor's wording (false = built-in text, still sent)
 * @property bool $sends send this message at all (false = nobody receives it)
 * @property array<int, string>|null $cc
 * @property array<int, string>|null $bcc
 * @property string|null $from_name
 * @property string|null $from_email
 */
class MailTemplate extends Model
{
    protected $fillable = [
        'key', 'subject', 'body_html', 'body_text', 'is_enabled',
        'sends', 'cc', 'bcc', 'from_name', 'from_email', 'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'sends' => 'boolean',
            'cc' => 'array',
            'bcc' => 'array',
        ];
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
        'sends' => true,
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

    /**
     * Has an editor written anything?
     *
     * A row used to exist only when it held wording, so "customised" and "a
     * row exists" were one question. A row can now be a switch and two address
     * lists over the built-in text, and calling that "customised" on the list
     * sends somebody to look for words that are not there.
     */
    public function hasWording(): bool
    {
        return filled($this->subject) || filled($this->body_html) || filled($this->body_text);
    }

    /**
     * Does anything here survive a reset of the wording?
     *
     * Reset clears the words. It must not switch a message back on, drop an
     * archive address or change who it comes from — those are different
     * decisions made on the same screen — so a row carrying any of them stays.
     */
    public function hasDeliverySettings(): bool
    {
        return ! $this->sends
            || filled($this->cc)
            || filled($this->bcc)
            || filled($this->from_name)
            || filled($this->from_email);
    }
}
