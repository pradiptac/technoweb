<?php

namespace App\Support\Seo;

use App\Models\Setting;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Google Analytics 4 — what visitors did with the pages, read into the SEO
 * overview and the store dashboard. Read only, and `SearchConsole`'s shape
 * rule for rule.
 *
 * Search Console says which pages Google shows; this says which pages
 * anybody opened. Beside each other on `/admin/seo` they answer the
 * question a search figure alone cannot — a page with impressions and no
 * views is one search shows and nobody chooses, the list worth rewriting
 * first — and on the store dashboard the product views over the window
 * give paid orders a denominator, which is the first figure a shop asks
 * for and the one nothing here could answer.
 *
 * **One credential.** The same service account Search Console reads
 * (`gsc_service_account`), added to the GA4 property as a Viewer; the only
 * setting of its own is the numeric property id, `ga4_property_id`.
 * `GoogleServiceAccount` signs the JWT and holds the token, per scope.
 *
 * **Cached, and quiet on failure.** The pages table is one `runReport` an
 * hour for the whole overview, never a call per row; the dashboard's
 * product views are one call per window, fifteen minutes. A refusal is
 * logged at `warning` with Google's own words and written to `ga4_error`
 * — the `mail_error` pattern — and the screens go on without the column;
 * `test()` is the one path that surfaces the words, for the settings
 * button.
 *
 * **Null, never zero, for what was not measured.** `productViews()` is
 * null when GA4 is not configured or Google refused, and a measured
 * nothing is `0`: "nobody looked" and "we cannot say" are different
 * claims, and a dashboard that renders the second as the first is one
 * people stop believing — the store's rule, held here too.
 */
class GoogleAnalytics
{
    /** The same window Search Console reads, so the two columns describe one period. */
    public const DAYS = SearchConsole::DAYS;

    private const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

    private const PRODUCT_PREFIX = '/store/products/';

    public static function configured(): bool
    {
        return GoogleServiceAccount::configured() && self::propertyId() !== '';
    }

    /** The numeric property id (Admin → Property details in GA4), or '' when unset. */
    public static function propertyId(): string
    {
        return trim((string) Setting::get('ga4_property_id', ''));
    }

    public static function lastError(): ?string
    {
        $error = Setting::get('ga4_error');

        return filled($error) ? (string) $error : null;
    }

    // ---- reads ----------------------------------------------------------------

    /**
     * Every page with a view over the window, keyed by site path.
     *
     * A query string is stripped and its rows added to the page's — GA4's
     * `pagePath` already excludes one, and a report that carried it would
     * split a page's figure across every campaign link that ever pointed
     * at it. `/` stays `/`.
     *
     * @return array<string, array{views: int, users: int}>
     */
    public static function pages(): array
    {
        if (! self::configured()) {
            return [];
        }

        return Cache::remember('seo:ga4:pages', now()->addHour(), function () {
            try {
                $rows = self::runReport([
                    'dateRanges' => [self::range(now()->subDays(self::DAYS), now()->subDay())],
                    'dimensions' => [['name' => 'pagePath']],
                    'metrics' => [['name' => 'screenPageViews'], ['name' => 'totalUsers']],
                    'limit' => 10000,
                ]);
            } catch (RuntimeException $e) {
                self::recordError($e->getMessage());

                return [];
            }

            self::clearError();
            $out = [];

            foreach ($rows as $row) {
                $path = self::pathOf((string) ($row['dimensionValues'][0]['value'] ?? ''));

                if ($path === null) {
                    continue;
                }

                $out[$path] ??= ['views' => 0, 'users' => 0];
                $out[$path]['views'] += (int) ($row['metricValues'][0]['value'] ?? 0);
                $out[$path]['users'] += (int) ($row['metricValues'][1]['value'] ?? 0);
            }

            return $out;
        });
    }

    /**
     * Views of the shop's product pages between two dates, inclusive — or
     * null when GA4 is not configured or Google refused, never zero for
     * either. One call per range, held for fifteen minutes.
     */
    public static function productViews(Carbon $from, Carbon $to): ?int
    {
        if (! self::configured()) {
            return null;
        }

        $range = self::range($from, $to);

        return Cache::remember('seo:ga4:product-views:'.$range['startDate'].':'.$range['endDate'], now()->addMinutes(15), function () use ($range) {
            try {
                $rows = self::runReport([
                    'dateRanges' => [$range],
                    'metrics' => [['name' => 'screenPageViews']],
                    'dimensionFilter' => [
                        'filter' => [
                            'fieldName' => 'pagePath',
                            'stringFilter' => ['matchType' => 'BEGINS_WITH', 'value' => self::PRODUCT_PREFIX],
                        ],
                    ],
                ]);
            } catch (RuntimeException $e) {
                self::recordError($e->getMessage());

                return null;
            }

            self::clearError();

            // No dimensions, so one row of totals — or none at all when nothing matched, which is a measured zero.
            return (int) ($rows[0]['metricValues'][0]['value'] ?? 0);
        });
    }

    /**
     * Prove the credential, for the settings screen: one real report for
     * yesterday, the count of pages that came back, and Google's own words
     * on refusal.
     *
     * @return array{property: string, days: int, pages: int}
     */
    public static function test(): array
    {
        $rows = self::runReport([
            'dateRanges' => [['startDate' => 'yesterday', 'endDate' => 'yesterday']],
            'dimensions' => [['name' => 'pagePath']],
            'metrics' => [['name' => 'screenPageViews']],
            'limit' => 10000,
        ]);

        self::clearError();
        Cache::forget('seo:ga4:pages');

        return ['property' => self::propertyId(), 'days' => 1, 'pages' => count($rows)];
    }

    // ---- the wire ---------------------------------------------------------------

    /**
     * @param  array<string, mixed>  $body
     * @return array<int, array<string, mixed>>
     */
    private static function runReport(array $body): array
    {
        $res = Http::withToken(GoogleServiceAccount::accessToken(self::SCOPE))
            ->acceptJson()
            ->timeout(15)
            ->post('https://analyticsdata.googleapis.com/v1beta/properties/'.rawurlencode(self::propertyId()).':runReport', $body);

        if (! $res->ok()) {
            throw new RuntimeException(GoogleServiceAccount::googleWords($res->json(), $res->status()));
        }

        return $res->json('rows') ?? [];
    }

    /** @return array{startDate: string, endDate: string} */
    private static function range(Carbon $from, Carbon $to): array
    {
        return ['startDate' => $from->toDateString(), 'endDate' => $to->toDateString()];
    }

    /** A GA4 page path as a site path, or null when it is not one. */
    private static function pathOf(string $value): ?string
    {
        $path = parse_url($value, PHP_URL_PATH);

        if (! is_string($path) || $path === '') {
            return null;
        }

        $path = '/'.trim($path, '/');

        return $path === '/' ? '/' : $path;
    }

    private static function recordError(string $message): void
    {
        Log::warning('Google Analytics refused a report', ['error' => $message]);
        Setting::query()->updateOrCreate(['key' => 'ga4_error'], ['group' => 'integrations', 'value' => mb_substr($message, 0, 500), 'type' => 'string']);
        Setting::flushCache();
    }

    private static function clearError(): void
    {
        if (self::lastError() !== null) {
            Setting::query()->where('key', 'ga4_error')->update(['value' => null]);
            Setting::flushCache();
        }
    }
}
