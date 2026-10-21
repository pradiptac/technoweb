<?php

namespace App\Support\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

/** Who a hit belongs to, for one day only (C3). */
final class Visitor
{
    /** The day's salt: made by the first hit of the day, gone at the end of that day in the app's timezone. */
    public static function salt(string $day): string
    {
        $key = "analytics:salt:{$day}";
        // add() is atomic, so two first hits at midnight settle on one salt.
        Cache::add($key, bin2hex(random_bytes(32)), Carbon::parse($day, (string) config('app.timezone'))->endOfDay());

        return (string) Cache::get($key);
    }

    public static function hash(string $ip, string $ua, string $day): string
    {
        return substr(hash('sha256', self::salt($day).'|'.$ip.'|'.$ua.'|'.parse_url((string) config('app.frontend_url'), PHP_URL_HOST), true), 0, 16);
    }

    /** The visitor's own browser: the Next server forwards it as X-Visitor-Agent, believed only from a trusted proxy. */
    public static function agent(Request $request): ?string
    {
        $forwarded = $request->header('X-Visitor-Agent');
        if (is_string($forwarded) && $forwarded !== '' && $request->isFromTrustedProxy()) {
            return mb_substr($forwarded, 0, 500);
        }

        return $request->userAgent();
    }
}
