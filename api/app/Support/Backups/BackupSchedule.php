<?php

namespace App\Support\Backups;

use App\Models\Backup;
use Carbon\CarbonImmutable;

/**
 * Whether a scheduled backup is due, and which kind.
 *
 * The schedule is a set of **slots**: the backup time on the full day (or
 * every day), and, with incrementals on, every 6, 12 or 24 hours from the
 * backup time. The worker asks once a minute; a slot is due when it has
 * passed and no scheduled backup has been started since it. Only the latest
 * slot counts, so a server that was off for two days takes one backup when
 * it comes back, not eight.
 *
 * A full slot asks for a full. An incremental slot asks for `auto`, which
 * `BackupRunner::start()` turns into a full when there is nothing sound to
 * build on.
 */
final class BackupSchedule
{
    /** @return 'full'|'auto'|null */
    public static function due(?CarbonImmutable $now = null): ?string
    {
        if (! BackupSettings::enabled()) {
            return null;
        }

        $now ??= CarbonImmutable::now();
        $slot = self::latestSlot($now);

        if ($slot === null) {
            return null;
        }

        $taken = Backup::query()->where('trigger', 'schedule')->where('created_at', '>=', $slot['at'])->exists();

        return $taken ? null : ($slot['full'] ? 'full' : 'auto');
    }

    /** When the next slot is, for the screen. */
    public static function next(?CarbonImmutable $now = null): ?CarbonImmutable
    {
        if (! BackupSettings::enabled()) {
            return null;
        }

        $now ??= CarbonImmutable::now();

        foreach (self::slots($now->startOfDay(), 8) as $slot) {
            if ($slot['at']->greaterThan($now)) {
                return $slot['at'];
            }
        }

        return null;
    }

    /** @return array{at: CarbonImmutable, full: bool}|null */
    public static function latestSlot(CarbonImmutable $now): ?array
    {
        $latest = null;

        foreach (self::slots($now->subDays(7)->startOfDay(), 8) as $slot) {
            if ($slot['at']->lessThanOrEqualTo($now)) {
                $latest = $slot;
            }
        }

        return $latest;
    }

    /**
     * Every slot for `$days` days from `$from`, in order.
     *
     * @return list<array{at: CarbonImmutable, full: bool}>
     */
    private static function slots(CarbonImmutable $from, int $days): array
    {
        [$hour, $minute] = array_map('intval', explode(':', BackupSettings::time()));
        $fullDay = BackupSettings::fullDay();
        $every = BackupSettings::incrementalEvery();
        $slots = [];

        for ($d = 0; $d < $days; $d++) {
            $anchor = $from->addDays($d)->setTime($hour, $minute);
            $isFullDay = $fullDay === 'daily' || strtolower($anchor->format('D')) === $fullDay;

            if ($isFullDay) {
                $slots[] = ['at' => $anchor, 'full' => true];
            } elseif ($every !== null) {
                $slots[] = ['at' => $anchor, 'full' => false];
            }

            if ($every !== null) {
                for ($h = $every; $h < 24; $h += $every) {
                    $slots[] = ['at' => $anchor->addHours($h), 'full' => false];
                }
            }
        }

        usort($slots, fn ($a, $b) => $a['at'] <=> $b['at']);

        return $slots;
    }
}
