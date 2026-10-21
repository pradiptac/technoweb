<?php

namespace App\Support\Analytics;

use App\Support\Countries;

/** The words the console shows for a rolled-up key (C3). A blank key is "Unknown" or "Direct", never an empty cell. */
final class Labels
{
    private const DEVICES = ['desktop' => 'Desktop', 'tablet' => 'Tablet', 'phone' => 'Phone'];

    public static function of(string $dimension, string $key): string
    {
        return match ($dimension) {
            'channel' => Kinds::CHANNELS[$key] ?? 'Direct',
            'country' => ($key === '' ? null : Countries::name($key)) ?? 'Unknown',
            'source' => $key === '' ? 'Direct' : $key,
            'device' => self::DEVICES[$key] ?? 'Unknown',
            'browser', 'os' => $key === '' ? 'Unknown' : $key,
            default => $key === '' ? '(none)' : $key,
        };
    }
}
