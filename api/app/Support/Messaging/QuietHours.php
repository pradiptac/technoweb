<?php

namespace App\Support\Messaging;

use App\Models\Setting;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * When a promotional message may go out: 9am to 9pm in the app's timezone
 * (IST) unless `messaging_promo_start` / `messaging_promo_end` say otherwise.
 *
 * Transactional messages — an order update, a ticket reply — go at any hour;
 * a basket reminder or a price-drop note does not, and one that falls due
 * outside the window waits for `nextOpening()` rather than being dropped.
 * The same window governs the reminder emails, so a person is not mailed at
 * 3am by one channel while another politely waits.
 */
final class QuietHours
{
    public const DEFAULT_START = '09:00';

    public const DEFAULT_END = '21:00';

    public static function allows(?CarbonInterface $at = null): bool
    {
        $at = CarbonImmutable::instance($at ?? now())->setTimezone(config('app.timezone'));
        [$start, $end] = self::window($at);

        return $at->betweenIncluded($start, $end->subSecond());
    }

    /** The moment the window next opens — `$at` itself when it is open now. */
    public static function nextOpening(?CarbonInterface $at = null): CarbonImmutable
    {
        $at = CarbonImmutable::instance($at ?? now())->setTimezone(config('app.timezone'));

        if (self::allows($at)) {
            return $at;
        }

        [$start] = self::window($at);

        return $at->lessThan($start) ? $start : $start->addDay();
    }

    /** @return array{CarbonImmutable, CarbonImmutable} */
    private static function window(CarbonImmutable $day): array
    {
        $start = self::time((string) Setting::get('messaging_promo_start', self::DEFAULT_START), self::DEFAULT_START);
        $end = self::time((string) Setting::get('messaging_promo_end', self::DEFAULT_END), self::DEFAULT_END);

        if ($end <= $start) {
            [$start, $end] = [self::DEFAULT_START, self::DEFAULT_END];
        }

        return [
            $day->setTimeFromTimeString($start),
            $day->setTimeFromTimeString($end),
        ];
    }

    private static function time(string $value, string $fallback): string
    {
        return preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $value) === 1 ? $value : $fallback;
    }
}
