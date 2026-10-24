<?php

namespace App\Support\Social;

use App\Enums\SocialNetwork;

/** Length rules and the no-model fallback text for social posts. */
class SocialText
{
    public const X_LIMIT = 280;

    public const X_URL = 23;

    /** X's own count: every link, whatever its length, is 23. */
    public static function xLength(string $text): int
    {
        $bare = preg_replace('~https?://\S+~u', '', $text, -1, $links) ?? $text;

        return mb_strlen($bare) + $links * self::X_URL;
    }

    /** Whether the text plus a space and the link the site appends stays within 280. */
    public static function xFits(string $text, string $url): bool
    {
        return self::xLength($text) + ($url === '' ? 0 : 1 + self::X_URL) <= self::X_LIMIT;
    }

    /** LinkedIn gets no link in the text: the post attaches it as the article card. */
    public static function fallback(SocialNetwork $network, string $title, string $summary, string $url): string
    {
        $title = trim($title);
        $summary = trim($summary);

        if ($network === SocialNetwork::LinkedIn) {
            return implode("\n\n", array_filter([$title, $summary], fn ($p) => $p !== ''));
        }

        $text = $summary === '' ? $title : $title.' — '.$summary;
        if (self::xFits($text, $url)) {
            return $text;
        }

        $words = preg_split('/\s+/u', $text) ?: [];
        while ($words !== []) {
            array_pop($words);
            $candidate = preg_replace('/[\s,;:—\-.]+$/u', '', implode(' ', $words)).'…';
            if (self::xFits($candidate, $url)) {
                return $candidate;
            }
        }

        return '…';
    }
}
