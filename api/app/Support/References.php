<?php

namespace App\Support;

use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The prefixes on the numbers people read out: tickets, engineer visits,
 * online meetings and orders.
 *
 * `PREFIX-YYYY-NNNNN` — `TW-2026-00042`. The prefix used to be a literal in
 * each model, the original product's initials, which a white-label install
 * cannot carry. It is a setting now (System → Settings, the Reference numbers
 * tab under Identity — the `references` group), checked for shape on write and again here on read,
 * so one bad row can never mint a number nothing can parse. A changed prefix
 * applies to new numbers only; every existing one keeps its own.
 */
final class References
{
    public const PATTERN = '/^[A-Z][A-Z0-9]{1,5}$/';

    public const DEFAULTS = [
        'ticket_reference_prefix' => 'TW',
        'visit_reference_prefix' => 'TV',
        'meeting_reference_prefix' => 'MT',
        'order_number_prefix' => 'ORD',
    ];

    public static function ticket(): string
    {
        return self::prefix('ticket_reference_prefix');
    }

    public static function visit(): string
    {
        return self::prefix('visit_reference_prefix');
    }

    public static function meeting(): string
    {
        return self::prefix('meeting_reference_prefix');
    }

    public static function order(): string
    {
        return self::prefix('order_number_prefix');
    }

    /** A setting's prefix, upper-cased, or its default when the row is missing or malformed. */
    public static function prefix(string $key): string
    {
        $default = self::DEFAULTS[$key];

        try {
            $value = strtoupper(trim((string) Setting::get($key, $default)));
        } catch (\Throwable) {
            return $default;
        }

        return preg_match(self::PATTERN, $value) === 1 ? $value : $default;
    }

    /**
     * Every prefix a ticket reference may start with: today's, and every one
     * already on a ticket.
     *
     * The email-to-ticket reader matches these by name rather than any
     * `LETTERS-YYYY-NNNNN` shape — a generic pattern would take an order
     * number in a customer's email for a ticket — and a reply quoting a
     * number from before the prefix changed must still land on its ticket.
     *
     * @return list<string>
     */
    public static function ticketPrefixes(): array
    {
        $prefixes = [self::ticket()];

        try {
            if (Schema::hasTable('tickets')) {
                $existing = DB::table('tickets')
                    ->selectRaw("DISTINCT SUBSTRING_INDEX(reference, '-', 1) AS prefix")
                    ->pluck('prefix')
                    ->all();

                foreach ($existing as $prefix) {
                    $prefix = strtoupper((string) $prefix);

                    if (preg_match(self::PATTERN, $prefix) === 1) {
                        $prefixes[] = $prefix;
                    }
                }
            }
        } catch (\Throwable) {
            // Unreadable: today's prefix alone is still a working answer.
        }

        return array_values(array_unique($prefixes));
    }

    /**
     * The prefix a fresh install starts with: the company's initials, two to
     * four letters (`Acme Networks` → `AN`), or `TK` when the name gives fewer
     * than two.
     */
    public static function initialsOf(string $company): string
    {
        preg_match_all('/\b[\p{L}\p{N}]/u', $company, $m);
        $letters = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', implode('', $m[0])) ?? '');
        $letters = substr(ltrim($letters, '0123456789'), 0, 4);

        return strlen($letters) >= 2 ? $letters : 'TK';
    }
}
