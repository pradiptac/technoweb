<?php

namespace App\Support\Analytics;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** Who a hit belongs to, for one day only (C3). */
final class Visitor
{
    /** The day's salt, replaced at midnight in the app's timezone; the key expires a day later. */
    public static function salt(): string
    {
        $day = now()->setTimezone((string) config('app.timezone'))->format('Y-m-d');

        return Cache::remember("analytics:salt:{$day}", now()->addHours(26), fn () => bin2hex(random_bytes(32)));
    }

    public static function hash(string $ip, string $ua): string
    {
        return substr(hash('sha256', self::salt().'|'.$ip.'|'.$ua.'|'.parse_url((string) config('app.frontend_url'), PHP_URL_HOST), true), 0, 16);
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
