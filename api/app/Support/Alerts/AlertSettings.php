<?php

namespace App\Support\Alerts;

use App\Models\Setting;

/**
 * The private `alerts` group (docs/digest-alerts.md): each rule's switch,
 * each threshold, and the digest new staff start with. The one reader, with a
 * per-field fallback, and the write check `SettingController` calls.
 */
final class AlertSettings
{
    /** key => [default, min, max]. */
    public const THRESHOLDS = [
        'alert_ticket_critical_minutes' => [30, 5, 1440],
        'alert_lead_hot_hours' => [2, 1, 168],
        'alert_order_dispatch_days' => [2, 1, 30],
        'alert_return_days' => [2, 1, 30],
        'alert_mail_minutes' => [10, 5, 1440],
        'alert_health_points' => [10, 1, 100],
    ];

    public const DIGESTS = ['off', 'daily', 'weekly'];

    public const DIGEST_OPTIONS = [
        ['value' => 'weekly', 'label' => 'Weekly', 'description' => 'Once a week, on Monday at 8 am.'],
        ['value' => 'daily', 'label' => 'Daily', 'description' => 'Every morning at 8 am.'],
        ['value' => 'off', 'label' => 'Off', 'description' => 'No digest until somebody chooses one.'],
    ];

    public static function threshold(string $key): int
    {
        [$default, $min, $max] = self::THRESHOLDS[$key];
        $value = Setting::get($key);

        return is_numeric($value) && (int) $value >= $min && (int) $value <= $max ? (int) $value : $default;
    }

    /** A boolean row: true/false, or null when unseeded (on). */
    public static function enabled(string $rule): bool
    {
        return Setting::get('alert_'.$rule.'_enabled') !== false;
    }

    public static function defaultDigest(): string
    {
        $value = Setting::get('alerts_default_digest');

        return in_array($value, self::DIGESTS, true) ? $value : 'weekly';
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if ($key === 'alerts_default_digest') {
            return in_array($value, self::DIGESTS, true) ? null : 'Choose off, daily or weekly.';
        }
        if (! isset(self::THRESHOLDS[$key])) {
            return null;
        }
        [, $min, $max] = self::THRESHOLDS[$key];
        $text = is_scalar($value) ? trim((string) $value) : '';

        return ctype_digit($text) && (int) $text >= $min && (int) $text <= $max
            ? null : "A whole number from {$min} to {$max}.";
    }
}
