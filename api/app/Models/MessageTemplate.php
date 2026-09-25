<?php

namespace App\Models;

use App\Enums\MessageChannel;
use App\Enums\TemplateApproval;
use App\Support\Mail\Placeholders;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * What is said on one channel: a body with `{{placeholders}}`, and the
 * channel's own trimmings — a WhatsApp header and buttons, an RCS picture
 * and suggestions, a push title, image and link.
 *
 * Plain text end to end. Nothing on these channels renders HTML, so the body
 * is filled with `Placeholders::fillText` and never escaped or sanitised:
 * there is no markup for anything to break out of.
 *
 * A WhatsApp template carries Meta's approval state, synced from whichever
 * provider carries the channel; `sendable()` is what `Messenger` asks.
 */
class MessageTemplate extends Model
{
    protected $fillable = [
        'channel', 'key', 'name', 'body', 'header_text', 'media_path', 'buttons',
        'push_title', 'push_link', 'category', 'language',
        'provider_template_name', 'provider_template_id',
        'approval_status', 'approval_reason', 'submitted_at', 'synced_at',
    ];

    /** WhatsApp's three template categories, as Meta spells them. */
    public const CATEGORIES = ['utility', 'marketing', 'authentication'];

    protected function casts(): array
    {
        return [
            'channel' => MessageChannel::class,
            'approval_status' => TemplateApproval::class,
            'buttons' => 'array',
            'submitted_at' => 'datetime',
            'synced_at' => 'datetime',
        ];
    }

    public function sendable(): bool
    {
        return $this->approval_status->sendable();
    }

    /** The body with the values filled in, unknown names removed. */
    public function render(array $vars): string
    {
        return Placeholders::fillText($this->body, $vars);
    }

    /**
     * The placeholder names the body uses, in order of first appearance —
     * which is the order a positional provider (Gupshup, Twilio) numbers
     * them `{{1}}`, `{{2}}`…
     *
     * @return list<string>
     */
    public function placeholderNames(): array
    {
        preg_match_all('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', $this->body, $m);

        return array_values(array_unique(array_map('strtolower', $m[1])));
    }

    /**
     * The body with each named placeholder replaced by its position, for
     * the providers whose templates are numbered rather than named.
     */
    public function positionalBody(): string
    {
        $names = $this->placeholderNames();

        return (string) preg_replace_callback('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', function (array $m) use ($names) {
            $i = array_search(strtolower($m[1]), $names, true);

            return $i === false ? $m[0] : '{{'.($i + 1).'}}';
        }, $this->body);
    }

    /**
     * The name the provider knows it by: what was synced or typed, else the
     * key — Meta allows lower case, digits and underscores, which a key is.
     */
    public function providerName(): string
    {
        return filled($this->provider_template_name) ? (string) $this->provider_template_name : $this->key;
    }

    public function mediaUrl(): ?string
    {
        return filled($this->media_path) ? asset('storage/'.$this->media_path) : null;
    }

    /** @return HasMany<MessageAutomation, $this> */
    public function automations(): HasMany
    {
        return $this->hasMany(MessageAutomation::class);
    }
}
