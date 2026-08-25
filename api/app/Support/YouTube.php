<?php

namespace App\Support;

/**
 * Turns whatever an editor pasted into a video id, or nothing.
 *
 * The id is what gets stored, because it is what ends up in an iframe src.
 * Keeping the URL and trusting it later is the mistake the map-embed
 * validation already exists to prevent: an unchecked src is another site
 * rendered inside this origin, with this origin's referrer.
 *
 * Accepts the four forms people actually paste — watch links, short links,
 * embed links and /v/ links — and refuses everything else, including a
 * youtube.com URL that is not a video and a lookalike host such as
 * `youtube.com.evil.test`, which is why the host is compared exactly rather
 * than with `str_contains`.
 */
class YouTube
{
    private const HOSTS = [
        'youtube.com', 'www.youtube.com', 'm.youtube.com',
        'youtube-nocookie.com', 'www.youtube-nocookie.com',
        'youtu.be', 'www.youtu.be',
    ];

    public static function id(?string $input): ?string
    {
        $input = trim((string) $input);
        if ($input === '') {
            return null;
        }

        // A bare id, which is what this method returns — so a round trip
        // through a form does not have to be re-parsed from a URL.
        if (preg_match('/^[A-Za-z0-9_-]{11}$/', $input)) {
            return $input;
        }

        $url = parse_url($input);
        if (! $url || empty($url['host'])) {
            return null;
        }

        $host = strtolower($url['host']);
        if (! in_array($host, self::HOSTS, true)) {
            return null;
        }

        $path = trim($url['path'] ?? '', '/');
        parse_str($url['query'] ?? '', $query);

        $candidate = match (true) {
            str_ends_with($host, 'youtu.be') => $path,
            $path === 'watch' => $query['v'] ?? '',
            str_starts_with($path, 'embed/') => substr($path, 6),
            str_starts_with($path, 'shorts/') => substr($path, 7),
            str_starts_with($path, 'v/') => substr($path, 2),
            default => '',
        };

        // A path can carry more segments — /embed/ID/something — and only the
        // first is the id.
        $candidate = explode('/', (string) $candidate)[0];

        return preg_match('/^[A-Za-z0-9_-]{11}$/', $candidate) ? $candidate : null;
    }
}
