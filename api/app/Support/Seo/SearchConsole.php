<?php

namespace App\Support\Seo;

use App\Models\Setting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Google Search Console — what the site already ranks for, read into the
 * SEO screens.
 *
 * Everything on `/admin/seo` until now was scored from what is *stored*;
 * this is the one input that comes from the world. With a service account
 * granted access to the property (Settings → API keys), the overview shows
 * each record's clicks, impressions, CTR and position over the last 28
 * days and can list the records with impressions and no clicks — the
 * pages a search engine shows and nobody opens, which is the list worth
 * rewriting first — and the assistant is told the queries a page already
 * appears for, so an `improve` or a `keywords` run chases real demand
 * rather than a guess. `docs/seo-audit-2026-09-18.md`, §3a.5.
 *
 * **No SDK.** A service account signs its own JWT (RS256 through
 * `openssl_sign`) and trades it for an hour's access token at Google's
 * token endpoint; the Search Analytics query is one `POST`. That is forty
 * lines against the ~50MB `google/apiclient` would add to every deploy —
 * the `aws/aws-sdk-php` argument, made again. The credential is the JSON
 * key file's contents, stored encrypted like every other secret here and
 * never returned to a screen.
 *
 * **Cached, and quiet on failure.** The pages table is one call an hour
 * (Search Console's own data lags by two days, so fresher is pointless);
 * a page's queries are one call an hour each, asked only when the
 * assistant runs on that record. A Google refusal is logged at `warning`
 * with Google's own words and written to `gsc_error` — the `mail_error`
 * pattern — and the overview goes on rendering without the column rather
 * than failing; `test()` is the one path that surfaces the words, for the
 * settings screen's button.
 */
class SearchConsole
{
    public const DAYS = 28;

    private const TOKEN_URL = 'https://oauth2.googleapis.com/token';

    private const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

    public static function configured(): bool
    {
        return filled(Setting::get('gsc_service_account')) && self::siteUrl() !== '';
    }

    /**
     * The property, as Search Console names it: `sc-domain:technoware.in`
     * for a domain property, or the exact URL prefix for a URL property.
     * Derived from `FRONTEND_URL` as a domain property when unset, which is
     * what a fresh verification produces.
     */
    public static function siteUrl(): string
    {
        $stored = trim((string) Setting::get('gsc_site_url', ''));

        if ($stored !== '') {
            return $stored;
        }

        $host = parse_url((string) config('app.frontend_url'), PHP_URL_HOST);

        return $host ? 'sc-domain:'.preg_replace('/^www\./', '', $host) : '';
    }

    public static function lastError(): ?string
    {
        $error = Setting::get('gsc_error');

        return filled($error) ? (string) $error : null;
    }

    // ---- reads ----------------------------------------------------------------

    /**
     * Every page with any impressions over the window, keyed by site path.
     *
     * @return array<string, array{clicks: int, impressions: int, ctr: float, position: float}>
     */
    public static function pages(): array
    {
        if (! self::configured()) {
            return [];
        }

        return Cache::remember('seo:gsc:pages', now()->addHour(), function () {
            try {
                $rows = self::query(['page'], null, 5000);
            } catch (RuntimeException $e) {
                self::recordError($e->getMessage());

                return [];
            }

            self::clearError();
            $out = [];

            foreach ($rows as $row) {
                $path = self::pathOf((string) ($row['keys'][0] ?? ''));

                if ($path === null) {
                    continue;
                }

                $out[$path] = [
                    'clicks' => (int) ($row['clicks'] ?? 0),
                    'impressions' => (int) ($row['impressions'] ?? 0),
                    'ctr' => round((float) ($row['ctr'] ?? 0), 4),
                    'position' => round((float) ($row['position'] ?? 0), 1),
                ];
            }

            return $out;
        });
    }

    /**
     * The queries one page appears for, best first.
     *
     * @return array<int, array{query: string, clicks: int, impressions: int, position: float}>
     */
    public static function queriesFor(string $path, int $limit = 10): array
    {
        if (! self::configured()) {
            return [];
        }

        $url = rtrim((string) config('app.frontend_url'), '/').'/'.ltrim($path, '/');

        return Cache::remember('seo:gsc:queries:'.md5($url), now()->addHour(), function () use ($url, $limit) {
            try {
                $rows = self::query(['query'], $url, $limit);
            } catch (RuntimeException $e) {
                self::recordError($e->getMessage());

                return [];
            }

            return array_values(array_map(fn ($row) => [
                'query' => (string) ($row['keys'][0] ?? ''),
                'clicks' => (int) ($row['clicks'] ?? 0),
                'impressions' => (int) ($row['impressions'] ?? 0),
                'position' => round((float) ($row['position'] ?? 0), 1),
            ], $rows));
        });
    }

    /**
     * Prove the credential, for the settings screen: one real query, the
     * count of pages that came back, and Google's own words on refusal.
     *
     * @return array{site: string, days: int, pages: int}
     */
    public static function test(): array
    {
        $rows = self::query(['page'], null, 5000);

        self::clearError();
        Cache::forget('seo:gsc:pages');

        return ['site' => self::siteUrl(), 'days' => self::DAYS, 'pages' => count($rows)];
    }

    // ---- the wire ---------------------------------------------------------------

    /**
     * @param  array<int, string>  $dimensions
     * @return array<int, array<string, mixed>>
     */
    private static function query(array $dimensions, ?string $pageUrl, int $limit): array
    {
        $body = [
            'startDate' => now()->subDays(self::DAYS + 2)->toDateString(),
            'endDate' => now()->subDays(2)->toDateString(),
            'dimensions' => $dimensions,
            'rowLimit' => $limit,
        ];

        if ($pageUrl !== null) {
            $body['dimensionFilterGroups'] = [[
                'filters' => [['dimension' => 'page', 'operator' => 'equals', 'expression' => $pageUrl]],
            ]];
        }

        $res = Http::withToken(self::accessToken())
            ->acceptJson()
            ->timeout(15)
            ->post('https://searchconsole.googleapis.com/webmasters/v3/sites/'.rawurlencode(self::siteUrl()).'/searchAnalytics/query', $body);

        if (! $res->ok()) {
            throw new RuntimeException(self::googleWords($res->json(), $res->status()));
        }

        return $res->json('rows') ?? [];
    }

    /** An hour's access token for the service account, cached for fifty minutes. */
    private static function accessToken(): string
    {
        return Cache::remember('seo:gsc:token', now()->addMinutes(50), function () {
            $account = json_decode((string) Setting::get('gsc_service_account'), true);

            if (! is_array($account) || empty($account['client_email']) || empty($account['private_key'])) {
                throw new RuntimeException('The service account key is not the JSON file Google issued: it needs client_email and private_key.');
            }

            $now = time();
            $encode = fn (array $part) => rtrim(strtr(base64_encode(json_encode($part, JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
            $unsigned = $encode(['alg' => 'RS256', 'typ' => 'JWT']).'.'.$encode([
                'iss' => $account['client_email'],
                'scope' => self::SCOPE,
                'aud' => self::TOKEN_URL,
                'iat' => $now,
                'exp' => $now + 3600,
            ]);

            $signature = '';
            $key = openssl_pkey_get_private((string) $account['private_key']);

            if ($key === false || ! openssl_sign($unsigned, $signature, $key, OPENSSL_ALGO_SHA256)) {
                throw new RuntimeException('The private key in the service account file could not be read.');
            }

            $jwt = $unsigned.'.'.rtrim(strtr(base64_encode($signature), '+/', '-_'), '=');

            $res = Http::asForm()->acceptJson()->timeout(15)->post(self::TOKEN_URL, [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $jwt,
            ]);

            if (! $res->ok() || ! filled($res->json('access_token'))) {
                throw new RuntimeException(self::googleWords($res->json(), $res->status()));
            }

            return (string) $res->json('access_token');
        });
    }

    /** Google's own sentence, which says what to fix — a property the account cannot see, an expired key. */
    private static function googleWords(mixed $json, int $status): string
    {
        $message = is_array($json) ? ($json['error']['message'] ?? $json['error_description'] ?? $json['error'] ?? null) : null;

        return is_string($message) && $message !== '' ? "Google answered {$status}: {$message}" : "Google answered {$status}.";
    }

    /** A Search Console page URL as a site path, or null when it is not this site's. */
    private static function pathOf(string $url): ?string
    {
        $path = parse_url($url, PHP_URL_PATH);

        if (! is_string($path) || $path === '') {
            return null;
        }

        $path = '/'.trim($path, '/');

        return $path === '/' ? '/' : $path;
    }

    private static function recordError(string $message): void
    {
        Log::warning('Search Console refused a query', ['error' => $message]);
        Setting::query()->updateOrCreate(['key' => 'gsc_error'], ['group' => 'integrations', 'value' => mb_substr($message, 0, 500), 'type' => 'string']);
        Setting::flushCache();
    }

    private static function clearError(): void
    {
        if (self::lastError() !== null) {
            Setting::query()->where('key', 'gsc_error')->update(['value' => null]);
            Setting::flushCache();
        }
    }
}
