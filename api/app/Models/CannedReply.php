<?php

namespace App\Models;

use App\Support\Mail\Placeholders;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A saved reply for the support desk.
 *
 * The body is plain text with `{{placeholders}}` in it, filled per ticket by
 * `fillFor()` through `Placeholders::fillText` — the same regex the email
 * templates use, and deliberately *not* `EmailRenderer::personalise()`, which
 * pre-seeds a subscriber's fields and turns a blank first name into "there".
 * A reply pasted into a ticket has a customer, not a subscriber.
 *
 * `PLACEHOLDERS` is the one list of what a reply may say: the fill reads it,
 * and the index publishes it as `meta.placeholders` so the management screen's
 * chips come from here rather than from a copy in TypeScript.
 */
class CannedReply extends Model
{
    protected $fillable = ['title', 'body', 'sort_order', 'created_by'];

    /** What a saved reply may refer to, with the line the console shows beside each chip. */
    public const PLACEHOLDERS = [
        'customer_name' => 'The customer\'s full name.',
        'first_name' => 'Their first name — the first word of it.',
        'company' => 'Their company, or blank.',
        'reference' => 'The ticket reference.',
        'subject' => 'The ticket subject.',
        'agent_name' => 'Your own name, as the signed-in staff member.',
    ];

    protected function casts(): array
    {
        return ['sort_order' => 'integer'];
    }

    /** @return BelongsTo<User, $this> */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The order the picker lists them in, and the list screen too. */
    public function scopeOrdered(Builder $query): Builder
    {
        return $query->orderBy('sort_order')->orderBy('title')->orderBy('id');
    }

    /**
     * The body with every placeholder filled for this ticket and this agent.
     *
     * Unknown names are stripped, not left in braces: a typo in a saved reply
     * should cost a word, never a `{{customer_nmae}}` in a customer's inbox.
     */
    public function fillFor(Ticket $ticket, User $agent): string
    {
        return Placeholders::fillText($this->body, self::values($ticket, $agent));
    }

    /** @return array<string, string> */
    public static function values(Ticket $ticket, User $agent): array
    {
        $name = trim((string) $ticket->customer?->name);

        return [
            'customer_name' => $name,
            'first_name' => (string) (preg_split('/\s+/', $name)[0] ?? ''),
            'company' => (string) $ticket->customer?->company,
            'reference' => $ticket->reference,
            'subject' => (string) $ticket->subject,
            'agent_name' => (string) $agent->name,
        ];
    }

    /** The list the index publishes, in the order the chips are shown. */
    public static function placeholders(): array
    {
        return collect(self::PLACEHOLDERS)
            ->map(fn (string $about, string $name) => ['name' => $name, 'about' => $about])
            ->values()
            ->all();
    }
}
