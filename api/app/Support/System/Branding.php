<?php

namespace App\Support\System;

use App\Models\Setting;
use App\Support\References;
use Illuminate\Support\Facades\DB;

/**
 * Make a fresh install the customer's own.
 *
 * `SettingsSeeder` carries the defaults this product was first built with —
 * a company name, contact addresses at its domain, a "Why <company>" heading,
 * a meta description naming it. On a customer's server every one of those is
 * somebody else's name, so the setup wizard calls this once, straight after
 * seeding: the contact addresses become the administrator's (every
 * notification needs somewhere to go on day one), the invented postal address
 * is cleared, and any other text naming the original company names this one.
 *
 * Only ever on an install that has just been seeded. The palette id
 * `technoware` is a key, not a name, and is left alone.
 */
final class Branding
{
    private const ORIGINAL = 'Technoware';

    /** The original company's site, which starter content links to. */
    private const ORIGINAL_SITE = 'https://www.technoware.in';

    /** Keys whose value is an identifier rather than words. */
    private const KEYS_NOT_WORDS = ['theme'];

    public static function apply(string $company, string $email, string $siteUrl): void
    {
        $set = fn (string $key, ?string $value) => Setting::query()->where('key', $key)->update(['value' => $value]);

        $set('company_name', $company);

        foreach (['support_email', 'sales_email', 'careers_email'] as $key) {
            $set($key, $email);
        }

        $set('address', null);

        // Ticket and visit numbers start with the company's initials rather
        // than the original product's (`Acme Networks` → AN-2026-00001, and
        // ANV- for a visit, ANM- for an online meeting). `ORD` names nobody and stays.
        $initials = References::initialsOf($company);
        $set('ticket_reference_prefix', $initials);
        $set('visit_reference_prefix', substr($initials.'V', 0, 6));
        $set('meeting_reference_prefix', substr($initials.'M', 0, 6));

        foreach (Setting::query()->where('is_secret', false)->whereNotIn('key', self::KEYS_NOT_WORDS)->get(['id', 'key', 'value']) as $row) {
            $value = $row->getRawOriginal('value');

            if (is_string($value) && (str_contains($value, self::ORIGINAL) || str_contains($value, self::ORIGINAL_SITE))) {
                Setting::query()->whereKey($row->id)->update(['value' => str_replace([self::ORIGINAL_SITE, self::ORIGINAL], [$siteUrl, $company], $value)]);
            }
        }

        Setting::flushCache();

        // The starter newsletter templates carry the name in their blocks (a
        // JSON column, so the name is written JSON-escaped there) and in the
        // HTML rendered from them.
        $inJson = substr((string) json_encode($company, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 1, -1);

        foreach (DB::table('newsletter_templates')->get(['id', 'blocks', 'html']) as $row) {
            DB::table('newsletter_templates')->where('id', $row->id)->update([
                'blocks' => str_replace([self::ORIGINAL_SITE, str_replace('/', '\/', self::ORIGINAL_SITE), self::ORIGINAL], [$siteUrl, str_replace('/', '\/', $siteUrl), $inJson], (string) $row->blocks),
                'html' => str_replace([self::ORIGINAL_SITE, self::ORIGINAL], [$siteUrl, htmlspecialchars($company, ENT_QUOTES)], (string) $row->html),
            ]);
        }
    }
}
