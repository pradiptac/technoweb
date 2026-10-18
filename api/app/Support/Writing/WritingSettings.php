<?php

namespace App\Support\Writing;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;

/**
 * Writing help's own settings (docs/ai-writing.md): its daily cap and the
 * house style. The switch, key and model are the SEO assistant's; the cap is
 * not, so a busy desk cannot spend the SEO team's day and the other way round.
 */
final class WritingSettings
{
    public const DEFAULT_CAP = 300;

    public const MAX_CAP = 10000;

    public const STYLE_MAX = 500;

    public const AVOID_LINES = 50;

    public const AVOID_LINE_MAX = 40;

    public static function dailyCap(): int
    {
        $value = trim((string) Setting::get('ai_writing_daily_cap', ''));

        return $value !== '' && ctype_digit($value) ? min((int) $value, self::MAX_CAP) : self::DEFAULT_CAP;
    }

    public static function style(): string
    {
        return mb_substr(trim((string) Setting::get('ai_writing_style', '')), 0, self::STYLE_MAX);
    }

    /** @return list<string> */
    public static function avoid(): array
    {
        $lines = preg_split('/\R/', (string) Setting::get('ai_writing_avoid', '')) ?: [];
        $out = [];
        foreach ($lines as $line) {
            $line = mb_strtolower(trim($line));
            if ($line !== '' && mb_strlen($line) <= self::AVOID_LINE_MAX && ! in_array($line, $out, true)) {
                $out[] = $line;
            }
        }

        return array_slice($out, 0, self::AVOID_LINES);
    }

    public static function runsToday(): int
    {
        return (int) Cache::get(self::counterKey(), 0);
    }

    public static function countRun(): void
    {
        Cache::put(self::counterKey(), self::runsToday() + 1, now()->endOfDay());
    }

    public static function underCap(): bool
    {
        $cap = self::dailyCap();

        return $cap > 0 && self::runsToday() < $cap;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'ai_writing_') || ! is_scalar($value) || trim((string) $value) === '') {
            return null;
        }

        $value = trim((string) $value);

        return match ($key) {
            'ai_writing_daily_cap' => ctype_digit($value) && (int) $value <= self::MAX_CAP
                ? null : 'A whole number of requests, 0 to 10,000. 0 switches writing help off.',
            'ai_writing_style' => mb_strlen($value) <= self::STYLE_MAX
                ? null : 'Keep the house style to 500 characters.',
            'ai_writing_avoid' => self::avoidRefusal($value),
            default => null,
        };
    }

    private static function avoidRefusal(string $value): ?string
    {
        $lines = array_values(array_filter(array_map('trim', preg_split('/\R/', $value) ?: []), fn ($l) => $l !== ''));
        if (count($lines) > self::AVOID_LINES) {
            return 'At most 50 words or phrases, one per line.';
        }
        foreach ($lines as $line) {
            if (mb_strlen($line) > self::AVOID_LINE_MAX) {
                return 'Each word or phrase to avoid is at most 40 characters.';
            }
        }

        return null;
    }

    private static function counterKey(): string
    {
        return 'ai:writing:runs:'.now()->toDateString();
    }
}
