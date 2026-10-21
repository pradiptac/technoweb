<?php

namespace App\Support\Analytics;

/**
 * Where a visit came from (C3): UTM tags win; else the referrer's host,
 * named for the common ones and grouped into a channel. This site's own host
 * is direct.
 */
final class Source
{
    /** host suffix => [name, channel] */
    private const KNOWN = [
        'google.' => ['Google', 'search'], 'bing.com' => ['Bing', 'search'], 'duckduckgo.com' => ['DuckDuckGo', 'search'],
        'yahoo.' => ['Yahoo', 'search'], 'yandex.' => ['Yandex', 'search'], 'ecosia.org' => ['Ecosia', 'search'],
        'linkedin.com' => ['LinkedIn', 'social'], 'lnkd.in' => ['LinkedIn', 'social'],
        'facebook.com' => ['Facebook', 'social'], 'fb.me' => ['Facebook', 'social'], 'instagram.com' => ['Instagram', 'social'],
        't.co' => ['X', 'social'], 'twitter.com' => ['X', 'social'], 'x.com' => ['X', 'social'],
        'youtube.com' => ['YouTube', 'social'], 'youtu.be' => ['YouTube', 'social'], 'whatsapp.com' => ['WhatsApp', 'social'],
        'reddit.com' => ['Reddit', 'social'],
        'mail.google.com' => ['Gmail', 'email'], 'outlook.live.com' => ['Outlook', 'email'], 'outlook.office.com' => ['Outlook', 'email'],
        'mail.yahoo.com' => ['Yahoo Mail', 'email'],
    ];

    /**
     * @param  array{source?: ?string, medium?: ?string, campaign?: ?string}  $utm
     * @return array{channel: string, source: ?string, medium: ?string, campaign: ?string, referrer_host: ?string}
     */
    public static function of(?string $referrer, array $utm, string $ownHost): array
    {
        $host = $referrer ? strtolower((string) parse_url($referrer, PHP_URL_HOST)) : '';
        $host = preg_replace('/^www\./', '', $host) ?? '';
        $own = preg_replace('/^www\./', '', strtolower($ownHost)) ?? '';
        $referrerHost = $host !== '' && $host !== $own ? $host : null;

        $clip = fn (?string $v) => $v === null || trim($v) === '' ? null : mb_substr(trim($v), 0, 100);
        $utmSource = $clip($utm['source'] ?? null);
        $medium = $clip($utm['medium'] ?? null);
        $campaign = $clip($utm['campaign'] ?? null);

        if ($utmSource !== null) {
            $m = strtolower((string) $medium);
            $channel = match (true) {
                in_array($m, ['email', 'e-mail', 'newsletter'], true) => 'email',
                in_array($m, ['social', 'social-media', 'sm'], true) => 'social',
                in_array($m, ['organic'], true) => 'search',
                default => 'campaign',
            };

            return ['channel' => $channel, 'source' => $utmSource, 'medium' => $medium, 'campaign' => $campaign, 'referrer_host' => $referrerHost];
        }

        if ($referrerHost === null) {
            return ['channel' => 'direct', 'source' => null, 'medium' => null, 'campaign' => null, 'referrer_host' => null];
        }

        // The longest matching suffix wins, so mail.google.com beats google.
        $best = null;
        foreach (self::KNOWN as $suffix => $known) {
            $hit = str_ends_with($suffix, '.') ? str_contains('.'.$referrerHost.'.', '.'.$suffix) : ($referrerHost === $suffix || str_ends_with($referrerHost, '.'.$suffix));
            if ($hit && ($best === null || strlen($suffix) > strlen($best[0]))) {
                $best = [$suffix, $known];
            }
        }

        return $best === null
            ? ['channel' => 'referral', 'source' => $referrerHost, 'medium' => null, 'campaign' => null, 'referrer_host' => $referrerHost]
            : ['channel' => $best[1][1], 'source' => $best[1][0], 'medium' => null, 'campaign' => null, 'referrer_host' => $referrerHost];
    }
}
