<?php

namespace App\Support\Analytics;

/** Device, browser and OS families from a user agent and the window's width (C3). Never a version. */
final class AgentParser
{
    /** @return array{device: string, browser: string, os: string} */
    public static function parse(?string $ua, ?int $width): array
    {
        $ua ??= '';

        $os = match (true) {
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'CrOS') => 'ChromeOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS X'), str_contains($ua, 'Macintosh') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'Other',
        };

        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'SamsungBrowser') => 'Samsung Internet',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'Firefox/') || str_contains($ua, 'FxiOS') => 'Firefox',
            str_contains($ua, 'Chrome/') || str_contains($ua, 'CriOS') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'Other',
        };

        $tablet = (bool) preg_match('/iPad|Tablet|Android(?!.*Mobile)/', $ua);
        $mobile = (bool) preg_match('/Mobile|iPhone|iPod/', $ua);
        $device = match (true) {
            $width !== null && $width > 0 && $width < 640 => 'phone',
            $tablet => 'tablet',
            $mobile => 'phone',
            $width !== null && $width > 0 && $width < 1024 => 'tablet',
            default => 'desktop',
        };

        return ['device' => $device, 'browser' => $browser, 'os' => $os];
    }
}
