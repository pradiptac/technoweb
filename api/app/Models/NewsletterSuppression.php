<?php

namespace App\Models;

use App\Enums\SuppressionReason;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * The do-not-mail list.
 *
 * Keyed on the address and outliving every subscriber row, which is the whole
 * point: deleting somebody from the list and re-importing them from a
 * spreadsheet must not resurrect a subscription they withdrew. Every write
 * path in the module asks `has()` before creating or reactivating anything, so
 * there is one answer to "may we mail this person" rather than a check per
 * caller — the same argument that put `staff` on the admin group rather than at
 * 67 call sites.
 */
class NewsletterSuppression extends Model
{
    protected $fillable = ['email', 'reason', 'note', 'newsletter_campaign_id'];

    protected function casts(): array
    {
        return ['reason' => SuppressionReason::class];
    }

    protected static function booted(): void
    {
        static::saving(function (self $row) {
            $row->email = Str::lower(trim($row->email));
        });
    }

    public static function has(string $email): bool
    {
        return static::where('email', Str::lower(trim($email)))->exists();
    }

    /**
     * Suppress an address, idempotently.
     *
     * `firstOrCreate` rather than `create`: a hard bounce on a second campaign
     * for an address already suppressed is normal, and a unique-constraint
     * violation there would fail the send of an unrelated message.
     *
     * The **first** reason wins. Somebody who unsubscribed and later hard
     * bounces has still unsubscribed, and overwriting that would make their
     * decision look like a dead mailbox — which is the one thing staff are
     * allowed to undo.
     */
    public static function add(string $email, SuppressionReason $reason, ?string $note = null, ?int $campaignId = null): self
    {
        return static::firstOrCreate(
            ['email' => Str::lower(trim($email))],
            ['reason' => $reason, 'note' => $note, 'newsletter_campaign_id' => $campaignId],
        );
    }
}
