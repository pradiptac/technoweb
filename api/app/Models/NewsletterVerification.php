<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One call to Hunter about one address — the verification ledger.
 *
 * Append-only and never edited: the monthly cap is a count of these rows,
 * and a count anybody can change is not a cap. Written for every request
 * that got an answer, including a refusal, so a bad afternoon is readable
 * afterwards; only the rows that *reached* Hunter count against the
 * allowance (see `usedThisMonth()`).
 */
class NewsletterVerification extends Model
{
    public const CREATED_AT = 'created_at';

    public const UPDATED_AT = null;

    /** The responses Hunter bills for: an answer, or a "still checking". */
    public const BILLED = [200, 202, 222];

    protected $fillable = [
        'newsletter_subscriber_id', 'email', 'http_status', 'status', 'score', 'source', 'created_at',
    ];

    protected function casts(): array
    {
        return [
            'http_status' => 'integer',
            'score' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function subscriber(): BelongsTo
    {
        return $this->belongsTo(NewsletterSubscriber::class, 'newsletter_subscriber_id');
    }

    /**
     * How much of the month's allowance has gone.
     *
     * A 202 or 222 is counted although it settled nothing, because Hunter
     * counts it — the cap here is a bound on the bill, and a bound that
     * undercounts is not one. A 401, a 429 or a transport failure cost
     * nothing and are not counted.
     */
    public static function usedThisMonth(): int
    {
        return static::query()
            ->where('created_at', '>=', now()->startOfMonth())
            ->whereIn('http_status', self::BILLED)
            // A verdict copied from an earlier row made no call.
            ->where('source', '!=', 'ledger')
            ->count();
    }

    /**
     * The last settled verdict for an address, whoever the subscriber was.
     *
     * A row deleted and re-imported from a spreadsheet must not be paid for
     * again: the address was checked, and the mailbox has not changed because
     * the row did. `unknown` is deliberately not a settled verdict.
     */
    public static function lastFinalFor(string $email): ?self
    {
        return static::query()
            ->where('email', mb_strtolower(trim($email)))
            ->where('http_status', 200)
            ->whereNotNull('status')
            ->where('status', '!=', 'unknown')
            ->latest('id')
            ->first();
    }
}
