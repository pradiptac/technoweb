<?php

namespace App\Support\Analytics;

/** A user agent that is not a person (C3). A list of patterns, case-insensitive; no agent at all is a bot. */
final class Bots
{
    private const PATTERN = '/bot|crawl|spider|slurp|fetch|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python-|httpclient|okhttp|java\/|go-http|axios|node-fetch|scrapy|facebookexternalhit|embedly|preview|validator|phantomjs|selenium|playwright|puppeteer/i';

    public static function is(?string $ua): bool
    {
        return $ua === null || trim($ua) === '' || preg_match(self::PATTERN, $ua) === 1;
    }
}
