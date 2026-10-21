<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsHit;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\IpUtils;
use Throwable;

/**
 * The one writer of analytics_hits (C3, docs/analytics.md). Never throws:
 * a count is never worth a failed page, order or form.
 */
final class Collector
{
    /** Paths never counted: the console, the portal, the API, and every page a secret addresses. */
    public const EXCLUDED = ['/admin', '/portal', '/api', '/_next', '/order/', '/newsletter/unsubscribe/', '/newsletter/rejoin/',
        '/store/notify/cancel/', '/meeting/', '/visit/', '/ticket-survey/', '/events/registration/', '/preview/'];

    private const PER_MINUTE = 120;

    public static function enabled(): bool
    {
        return Setting::get('native_analytics_enabled', true) !== false;
    }

    /** @param array{path?: ?string, referrer?: ?string, utm?: array<string, ?string>, width?: ?int, target?: ?string, results?: ?int, value_paise?: ?int, page?: ?array<string, ?string>} $data */
    public static function record(Request $request, string $kind, array $data): ?AnalyticsHit
    {
        try {
            if (! self::enabled() || ! Kinds::valid($kind)) {
                return null;
            }
            $conversion = in_array($kind, Kinds::CONVERSIONS, true);
            $ua = Visitor::agent($request);
            $ip = (string) $request->ip();
            // A conversion is a thing that happened, not a browser that looked: a bot-like agent does not unmake an order.
            if ((! $conversion && Bots::is($ua)) || self::excludedIp($ip) || self::isStaff($request)) {
                return null;
            }
            $path = self::path($data['path'] ?? ($data['page']['source_path'] ?? null));
            if ($kind === 'pageview' && $path === null) {
                return null;
            }

            // Per address, in the cache, so a flood is dropped silently and the endpoint still answers 204.
            $limit = 'analytics:collect:'.$ip;
            if (RateLimiter::tooManyAttempts($limit, self::PER_MINUTE)) {
                return null;
            }
            RateLimiter::hit($limit, 60);

            $visitor = Visitor::hash($ip, (string) $ua);
            $day = now()->setTimezone((string) config('app.timezone'))->toDateString();
            $first = AnalyticsHit::query()->where('day', $day)->where('visitor', $visitor)->where('entry', true)->first();
            $own = (string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST);
            $page = $data['page'] ?? null;
            $pageUtm = ['source' => $page['utm_source'] ?? null, 'medium' => $page['utm_medium'] ?? null, 'campaign' => $page['utm_campaign'] ?? null];
            // A conversion names its own source only when its page context carries one (R2); otherwise the visit's.
            $reuse = $first !== null && ($conversion
                ? empty($page['referrer']) && ! array_filter($pageUtm)
                : ($kind !== 'pageview' || empty($data['referrer'])));
            $source = $reuse
                ? $first->only(['channel', 'source', 'medium', 'campaign', 'referrer_host'])
                : Source::of($data['referrer'] ?? ($page['referrer'] ?? null), [
                    'source' => $data['utm']['source'] ?? $pageUtm['source'],
                    'medium' => $data['utm']['medium'] ?? $pageUtm['medium'],
                    'campaign' => $data['utm']['campaign'] ?? $pageUtm['campaign'],
                ], $own);
            $agent = AgentParser::parse($ua, isset($data['width']) ? (int) $data['width'] : null);

            return AnalyticsHit::create([
                'day' => $day,
                'at' => now(),
                'kind' => $kind,
                'path' => $path,
                'visitor' => $visitor,
                'entry' => $kind === 'pageview' && $first === null,
                ...$source,
                ...$agent,
                'country' => Geo::country($request),
                'target' => isset($data['target']) ? mb_substr((string) $data['target'], 0, 255) : null,
                'results' => $data['results'] ?? null,
                'value_paise' => $data['value_paise'] ?? null,
            ]);
        } catch (Throwable $e) {
            Log::warning('Analytics: a hit was not recorded', ['kind' => $kind, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /** A site path, without its query, or null for anything that is not one or is never counted. */
    public static function path(?string $raw): ?string
    {
        if (! is_string($raw) || $raw === '' || $raw[0] !== '/' || str_starts_with($raw, '//') || strlen($raw) > 255) {
            return null;
        }
        $path = (string) parse_url($raw, PHP_URL_PATH);
        foreach (self::EXCLUDED as $prefix) {
            if ($path === rtrim($prefix, '/') || str_starts_with($path, rtrim($prefix, '/').'/')) {
                return null;
            }
        }

        return $path === '' ? '/' : $path;
    }

    /** The settings screen's check on `native_analytics_exclude_ips`: one address or range per line. */
    public static function refusalFor(string $key, mixed $value): ?string
    {
        if ($key !== 'native_analytics_exclude_ips' || blank($value)) {
            return null;
        }
        foreach (preg_split('/\R/', (string) $value) ?: [] as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            [$address, $mask] = array_pad(explode('/', $line, 2), 2, null);
            $v4 = filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
            $ok = ($v4 || filter_var($address, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6) !== false)
                && ($mask === null || (ctype_digit($mask) && (int) $mask <= ($v4 ? 32 : 128)));
            if (! $ok) {
                return 'One address or range per line, such as 203.0.113.0/24.';
            }
        }

        return null;
    }

    private static function excludedIp(string $ip): bool
    {
        $ranges = preg_split('/\R/', (string) Setting::get('native_analytics_exclude_ips', '')) ?: [];
        $ranges = array_values(array_filter(array_map('trim', $ranges)));

        return $ranges !== [] && IpUtils::checkIp($ip, $ranges);
    }

    /** The Next server marks a signed-in staff member's request (R3); believed only from a trusted proxy, and only while staff are not counted. */
    private static function isStaff(Request $request): bool
    {
        return $request->header('X-Visitor-Staff') === '1'
            && $request->isFromTrustedProxy()
            && ! filter_var(Setting::get('native_analytics_count_staff', false), FILTER_VALIDATE_BOOLEAN);
    }
}
