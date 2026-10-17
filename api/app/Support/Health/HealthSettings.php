<?php

namespace App\Support\Health;

use App\Models\Setting;

/**
 * The private `health` group (docs/health.md): the external-link switch and
 * the stale threshold per kind, in months, 0 meaning never stale. The one
 * reader, with a per-field fallback, and the write check `SettingController`
 * calls.
 */
final class HealthSettings
{
    /** alias => months. Certifications, events and vacancies have rules of their own as well. */
    public const STALE_DEFAULTS = [
        'page' => 18, 'solution' => 18, 'service' => 18, 'product' => 18, 'store_product' => 18,
        'knowledge_article' => 12, 'landing_page' => 12, 'event' => 12,
        'blog_post' => 0, 'case_study' => 0, 'tender' => 0, 'job_opening' => 0, 'entry' => 0,
    ];

    public static function staleMonths(string $alias): int
    {
        $default = self::STALE_DEFAULTS[$alias] ?? 0;
        $value = Setting::get('health_stale_'.$alias);

        return is_numeric($value) && (int) $value >= 0 && (int) $value <= 60 ? (int) $value : $default;
    }

    public static function externalOn(): bool
    {
        // A boolean row: Setting::get answers true/false, or null when unseeded (on, the default).
        return Setting::get('health_external_links') !== false;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'health_stale_') || ! is_string($value) || trim($value) === '') {
            return null;
        }

        return ctype_digit(trim($value)) && (int) $value <= 60 ? null : 'A whole number of months, 0 to 60.';
    }
}
