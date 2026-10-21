# Cookieless Native Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site counts its own visits — page views, visits, sources, devices, countries, conversions, search terms and outbound/download clicks — with no cookie and no third party, and staff read the figures in the console (0.188.0).

**Architecture:** A small beacon on the public site posts to a Next route handler, which forwards the visitor's address and browser to `POST /collect` on Laravel; Laravel derives the visit's attributes and writes one `analytics_hits` row, keyed to a hash of a salt replaced every midnight. Search terms and conversions are recorded server-side where they already happen. A nightly rollup turns closed days into `analytics_daily`, and one `Report` class answers every range by reading those totals plus today's raw rows.

**Tech Stack:** Laravel 13 / PHP 8.3 / MySQL 8 (API), Next.js 16 App Router / TypeScript / Tailwind v4 (console and site), the existing chart kit in `web/src/components/charts/`.

**Spec:** `docs/superpowers/specs/2026-10-21-native-analytics-design.md`

## Global Constraints

- No cookie, no `localStorage`, no fingerprint beyond `sha256(daily_salt . ip . user_agent . host)` truncated to 16 bytes; the raw address is never written to the database or a log.
- The salt is replaced at midnight in `APP_TIMEZONE`; yesterday's is not kept.
- Raw hits are kept **90 days**; daily totals for good.
- `POST /collect` answers **204 always**, including for a body it discards; it never fails a page.
- Never counted: the console, the portal, API routes, and every page a secret addresses — `/order/`, `/newsletter/unsubscribe/`, `/newsletter/rejoin/`, `/store/notify/cancel/`, `/meeting/`, `/visit/`, `/ticket-survey/`, `/events/registration/`, `/preview/` (the `Analytics` component's `SECRET_PATHS`, plus `/visit/`). Not counted: a browser sending DNT or GPC; a browser holding the staff cookie (`tw_admin_session`); a bot user agent.
- A conversion recorded never fails the request that caused it (the `Notifier` rule).
- Every label on the wire is the API's; a figure over no data is **null, never zero**.
- Roles: Analytics screen `role:admin,seo_manager,content_manager`; the store funnel `role:store_manager`; conversions by source on leads `role:sales_manager`.
- GA4 and the Meta Pixel stay optional and behind the consent banner; the console's own figures read native analytics, and fall back to GA4 only when native analytics is switched off.
- The country table is db-ip "IP to Country Lite", CC BY 4.0 — credited in the code and the manual.
- Never `npm run build` while a dev server is running. Never run two `php artisan test` at once.

## Review Focus

1. **A page view while an in-site navigation carries no referrer** must keep the visit's source, not turn into "direct" — the collector copies channel/source/campaign from that visitor's entry hit of the day. Pinned in Task 2 (`test_a_later_view_keeps_the_entry_source`).
2. **A search term that is an email address or a phone number** must never be stored. Pinned in Task 3 (`test_a_term_that_looks_personal_is_not_stored`).
3. **Today's figures** must appear in a report before the nightly rollup has run, and a day must never be counted twice once it has been rolled. Pinned in Task 4 (`test_today_is_merged_and_a_rolled_day_is_not_counted_twice`).
4. **A conversion when the collector is switched off or throws** must still let the order, form or booking succeed. Pinned in Task 3 (`test_a_conversion_failure_never_fails_the_request`).
5. **The console with native analytics switched off** must show a plain "switched off" state on the Analytics screen and fall back to GA4 on the SEO overview and the store funnel, never zeros. Pinned in Task 5 (`test_switched_off_reports_null_and_the_overview_falls_back`).

---

## File map

API (`api/`):
- `database/migrations/2026_10_27_100000_create_analytics_tables.php` — `analytics_hits`, `analytics_daily`.
- `app/Models/AnalyticsHit.php`, `app/Models/AnalyticsDaily.php`.
- `app/Support/Analytics/Bots.php` — user-agent bot test.
- `app/Support/Analytics/AgentParser.php` — device, browser and OS families.
- `app/Support/Analytics/Source.php` — channel, source, medium, campaign from referrer and UTM.
- `app/Support/Analytics/Geo.php` — country from the edge header or the vendored table.
- `scripts/build-geo.php` + `resources/geo/country-v4.bin`, `resources/geo/country-v6.bin`.
- `app/Support/Analytics/Visitor.php` — the daily salt, the hash, the forwarded user agent.
- `app/Support/Analytics/Collector.php` — the one writer of `analytics_hits`.
- `app/Support/Analytics/Kinds.php` — event kinds and conversion names, with labels.
- `app/Support/Analytics/Rollup.php` + `app/Console/Commands/AnalyticsRollup.php`, `PruneAnalyticsHits.php`.
- `app/Support/Analytics/Report.php` — every read.
- `app/Http/Controllers/Api/V1/CollectController.php`, `app/Http/Controllers/Api/V1/Admin/AnalyticsController.php`.
- Modify: `routes/api/public.php`, `routes/api/admin-*.php`, `routes/console.php`, `SettingsSeeder`, `PublicSettings`, `LeadIntake`, `Order` model, `SubscriberIntake`, `SearchController`, `StoreController`, `StoreMetrics`, `SeoController`, `Admin/LeadController`, `App\Support\Notifications\ScreenAccess`, `PageSeeder` (privacy paragraph).

Web (`web/`):
- `src/components/layout/analytics-beacon.tsx` — the beacon (client).
- `src/lib/analytics-beacon.ts` — its pure rules (path, referrer, link kind) + `scripts/analytics-beacon.check.mjs`.
- `src/app/api/collect/route.ts` — the route handler.
- Modify: `src/lib/client-ip.ts` (forward `X-Visitor-Agent`), `src/app/(marketing)/layout.tsx`.
- `src/types/analytics.ts`, `src/lib/admin/analytics.ts`.
- `src/app/admin/(app)/analytics/page.tsx` + `analytics-period.tsx` + `now-tile.tsx`.
- Modify: `nav-items.tsx`, store dashboard, leads screen, dashboard widgets, settings copy, help routes.
- `mock-api.mjs`, `scripts/probes/native-analytics.mjs`.

Docs: `docs/analytics.md`, `CLAUDE.md`, `API.md`, `manual/38-analytics.md`, `manual/00-README.md`, `VERSION.md`, `web/src/lib/version.ts`.

---

### Task 1: The attribute parsers and the country table

**Files:**
- Create: `api/app/Support/Analytics/Bots.php`, `AgentParser.php`, `Source.php`, `Geo.php`, `api/scripts/build-geo.php`, `api/resources/geo/country-v4.bin`, `api/resources/geo/country-v6.bin`
- Test: `api/tests/Unit/AnalyticsParsersTest.php`

**Interfaces:**
- Produces:
  - `Bots::is(?string $ua): bool`
  - `AgentParser::parse(?string $ua, ?int $width): array{device: string, browser: string, os: string}` — device `desktop|tablet|phone`; browser and OS family names (`Chrome`, `Safari`, `Firefox`, `Edge`, `Samsung Internet`, `Opera`, `Other`; `Windows`, `macOS`, `iOS`, `Android`, `Linux`, `ChromeOS`, `Other`).
  - `Source::of(?string $referrer, array $utm, string $ownHost): array{channel: string, source: ?string, medium: ?string, campaign: ?string, referrer_host: ?string}` — channel `search|social|email|referral|campaign|direct`.
  - `Geo::country(Request $request): ?string` — ISO alpha-2 upper case or null; `Geo::lookup(string $ip): ?string`; `Geo::pack(array $rows, int $bytes): string` (the builder's packer, shared with the test).

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Unit;

use App\Support\Analytics\AgentParser;
use App\Support\Analytics\Bots;
use App\Support\Analytics\Geo;
use App\Support\Analytics\Source;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class AnalyticsParsersTest extends TestCase
{
    public function test_bots_are_recognised_and_browsers_are_not(): void
    {
        foreach (['Googlebot/2.1 (+http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'curl/8.4.0', 'python-requests/2.31', 'HeadlessChrome/120', 'Mozilla/5.0 (compatible; AhrefsBot/7.0)', ''] as $ua) {
            $this->assertTrue(Bots::is($ua), $ua);
        }
        $this->assertTrue(Bots::is(null));
        $this->assertFalse(Bots::is('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'));
    }

    public function test_the_agent_parser_reads_families_and_device(): void
    {
        $iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
        $this->assertSame(['device' => 'phone', 'browser' => 'Safari', 'os' => 'iOS'], AgentParser::parse($iphone, 390));
        $edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0';
        $this->assertSame(['device' => 'desktop', 'browser' => 'Edge', 'os' => 'Windows'], AgentParser::parse($edge, 1440));
        $ipad = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
        $this->assertSame('tablet', AgentParser::parse($ipad, 820)['device']);
        $samsung = 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36';
        $this->assertSame(['device' => 'phone', 'browser' => 'Samsung Internet', 'os' => 'Android'], AgentParser::parse($samsung, 412));
        $this->assertSame('phone', AgentParser::parse('Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0', 360)['device'], 'a narrow window is a phone whatever the agent says');
    }

    /** @return array<string, array{0: ?string, 1: array<string, string>, 2: array<string, ?string>}> */
    public static function sources(): array
    {
        return [
            'google' => ['https://www.google.co.in/', [], ['channel' => 'search', 'source' => 'Google']],
            'bing' => ['https://www.bing.com/search?q=x', [], ['channel' => 'search', 'source' => 'Bing']],
            'linkedin' => ['https://www.linkedin.com/feed/', [], ['channel' => 'social', 'source' => 'LinkedIn']],
            'lnkd' => ['https://lnkd.in/abc', [], ['channel' => 'social', 'source' => 'LinkedIn']],
            'facebook mobile' => ['https://m.facebook.com/', [], ['channel' => 'social', 'source' => 'Facebook']],
            'x' => ['https://t.co/abc', [], ['channel' => 'social', 'source' => 'X']],
            'whatsapp' => ['https://web.whatsapp.com/', [], ['channel' => 'social', 'source' => 'WhatsApp']],
            'mail' => ['https://mail.google.com/', [], ['channel' => 'email', 'source' => 'Gmail']],
            'other site' => ['https://partner.example.com/page', [], ['channel' => 'referral', 'source' => 'partner.example.com']],
            'own site' => ['https://www.technoware.in/about', [], ['channel' => 'direct', 'source' => null]],
            'none' => [null, [], ['channel' => 'direct', 'source' => null]],
            'utm wins' => ['https://www.google.com/', ['source' => 'newsletter', 'medium' => 'email', 'campaign' => 'oct'], ['channel' => 'email', 'source' => 'newsletter']],
            'utm cpc' => [null, ['source' => 'google', 'medium' => 'cpc', 'campaign' => 'brand'], ['channel' => 'campaign', 'source' => 'google']],
        ];
    }

    /** @param array<string, string> $utm @param array<string, ?string> $want */
    #[DataProvider('sources')]
    public function test_source_and_channel(?string $referrer, array $utm, array $want): void
    {
        $got = Source::of($referrer, $utm, 'www.technoware.in');
        $this->assertSame($want['channel'], $got['channel']);
        $this->assertSame($want['source'], $got['source']);
    }

    public function test_the_edge_header_wins_and_the_table_answers_otherwise(): void
    {
        $request = \Illuminate\Http\Request::create('/', 'POST', server: ['HTTP_CF_IPCOUNTRY' => 'in', 'REMOTE_ADDR' => '8.8.8.8']);
        $this->assertSame('IN', Geo::country($request));
        $this->assertNull(Geo::country(\Illuminate\Http\Request::create('/', 'POST', server: ['HTTP_CF_IPCOUNTRY' => 'XX', 'REMOTE_ADDR' => '127.0.0.1'])), 'XX and a private address are unknown');

        $v4 = Geo::pack([['1.0.0.0', '1.0.0.255', 'AU'], ['1.0.1.0', '1.0.3.255', 'CN']], 4);
        $this->assertSame('CN', Geo::search($v4, inet_pton('1.0.2.9'), 4));
        $this->assertSame('AU', Geo::search($v4, inet_pton('1.0.0.1'), 4));
        $this->assertNull(Geo::search($v4, inet_pton('9.9.9.9'), 4));
    }

    public function test_the_committed_table_knows_a_well_known_address(): void
    {
        $this->assertSame('US', Geo::lookup('8.8.8.8'));
        $this->assertNotNull(Geo::lookup('2001:4860:4860::8888'));
    }
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=AnalyticsParsersTest`
Expected: FAIL — `Class "App\Support\Analytics\Bots" not found`.

- [ ] **Step 3: Write the parsers**

`Bots.php`:

```php
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
```

`AgentParser.php`:

```php
<?php

namespace App\Support\Analytics;

/** Device, browser and OS families from a user agent and the window's width (C3). Never a version. */
final class AgentParser
{
    /** @return array{device: string, browser: string, os: string} */
    public static function parse(?string $ua, ?int $width): array
    {
        $ua ??= '';

        $os = match (true) {
            (bool) preg_match('/iPhone|iPad|iPod/', $ua) => 'iOS',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'CrOS') => 'ChromeOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS X'), str_contains($ua, 'Macintosh') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'Other',
        };

        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'SamsungBrowser') => 'Samsung Internet',
            str_contains($ua, 'OPR/') || str_contains($ua, 'Opera') => 'Opera',
            str_contains($ua, 'Firefox/') || str_contains($ua, 'FxiOS') => 'Firefox',
            str_contains($ua, 'Chrome/') || str_contains($ua, 'CriOS') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => 'Other',
        };

        $tablet = (bool) preg_match('/iPad|Tablet|Android(?!.*Mobile)/', $ua);
        $mobile = (bool) preg_match('/Mobile|iPhone|iPod/', $ua);
        $device = match (true) {
            $width !== null && $width > 0 && $width < 640 => 'phone',
            $tablet => 'tablet',
            $mobile => 'phone',
            $width !== null && $width > 0 && $width < 1024 => 'tablet',
            default => 'desktop',
        };

        return ['device' => $device, 'browser' => $browser, 'os' => $os];
    }
}
```

`Source.php`:

```php
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
```

`Geo.php`:

```php
<?php

namespace App\Support\Analytics;

use Illuminate\Http\Request;

/**
 * A visitor's country (C3): the edge's own header when the site sits behind a
 * CDN, else the vendored table — db-ip "IP to Country Lite", CC BY 4.0
 * (https://db-ip.com), rebuilt by `php scripts/build-geo.php`. Each table is
 * sorted fixed-width records `start(n) end(n) country(2)` searched in place;
 * the address itself is never kept.
 */
final class Geo
{
    private const HEADERS = ['cf-ipcountry', 'cloudfront-viewer-country', 'x-vercel-ip-country'];

    public static function country(Request $request): ?string
    {
        foreach (self::HEADERS as $name) {
            $value = strtoupper(trim((string) $request->header($name)));
            if (preg_match('/^[A-Z]{2}$/', $value) === 1 && $value !== 'XX' && $value !== 'T1') {
                return $value;
            }
        }

        return self::lookup((string) $request->ip());
    }

    public static function lookup(string $ip): ?string
    {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return null;
        }
        $packed = inet_pton($ip);
        if ($packed === false) {
            return null;
        }
        $bytes = strlen($packed);
        $table = self::table($bytes === 4 ? 'country-v4.bin' : 'country-v6.bin');

        return $table === null ? null : self::search($table, $packed, $bytes);
    }

    /** Binary search over records of `$bytes * 2 + 2`. */
    public static function search(string $table, string $packed, int $bytes): ?string
    {
        $width = $bytes * 2 + 2;
        $lo = 0;
        $hi = intdiv(strlen($table), $width) - 1;
        while ($lo <= $hi) {
            $mid = intdiv($lo + $hi, 2);
            $start = substr($table, $mid * $width, $bytes);
            $end = substr($table, $mid * $width + $bytes, $bytes);
            if (strcmp($packed, $start) < 0) {
                $hi = $mid - 1;
            } elseif (strcmp($packed, $end) > 0) {
                $lo = $mid + 1;
            } else {
                return substr($table, $mid * $width + $bytes * 2, 2);
            }
        }

        return null;
    }

    /** @param list<array{0: string, 1: string, 2: string}> $rows sorted by start */
    public static function pack(array $rows, int $bytes): string
    {
        $out = '';
        foreach ($rows as [$start, $end, $country]) {
            $out .= inet_pton($start).inet_pton($end).strtoupper($country);
        }

        return $out;
    }

    private static function table(string $name): ?string
    {
        static $cache = [];
        if (! array_key_exists($name, $cache)) {
            $path = resource_path('geo/'.$name);
            $cache[$name] = is_file($path) ? (string) file_get_contents($path) : null;
        }

        return $cache[$name];
    }
}
```

`scripts/build-geo.php`:

```php
<?php

/*
 * Rebuilds resources/geo/country-v{4,6}.bin from db-ip "IP to Country Lite"
 * (CC BY 4.0, https://db-ip.com). Run from api/: php scripts/build-geo.php
 * [YYYY-MM]. Adjacent ranges of one country are merged; "ZZ" rows dropped.
 */
require __DIR__.'/../vendor/autoload.php';

$month = $argv[1] ?? date('Y-m');
$url = "https://download.db-ip.com/free/dbip-country-lite-{$month}.csv.gz";
$gz = @file_get_contents($url) ?: exit("Could not download {$url}\n");
$csv = gzdecode($gz) ?: exit("Not a gzip file\n");

$rows = [4 => [], 16 => []];
foreach (explode("\n", trim($csv)) as $line) {
    [$start, $end, $country] = str_getcsv($line, ',', '"', '') + [null, null, null];
    if (! $start || ! $end || ! preg_match('/^[A-Z]{2}$/', (string) $country) || $country === 'ZZ') {
        continue;
    }
    $bytes = strlen((string) inet_pton($start));
    $last = array_key_last($rows[$bytes]);
    if ($last !== null && $rows[$bytes][$last][2] === $country
        && gmp_cmp(gmp_import(inet_pton($start)), gmp_add(gmp_import(inet_pton($rows[$bytes][$last][1])), 1)) === 0) {
        $rows[$bytes][$last][1] = $end;
        continue;
    }
    $rows[$bytes][] = [$start, $end, $country];
}

@mkdir(__DIR__.'/../resources/geo', 0755, true);
foreach ([4 => 'country-v4.bin', 16 => 'country-v6.bin'] as $bytes => $file) {
    file_put_contents(__DIR__.'/../resources/geo/'.$file, App\Support\Analytics\Geo::pack($rows[$bytes], $bytes));
    printf("%s: %d ranges\n", $file, count($rows[$bytes]));
}
```

(If `gmp` is not loaded, compare the packed strings with `strcmp` after incrementing by hand: write a small `next(string $packed): string` that adds one with carry, and merge when `next(prevEnd) === start`. Use whichever this machine's PHP has.)

- [ ] **Step 4: Build the table**

Run (from `api/`): `php scripts/build-geo.php 2026-10`
Expected: two lines, e.g. `country-v4.bin: ~ 2xx,xxx ranges` and `country-v6.bin: …`; the files exist under `resources/geo/` and are a few MB.

- [ ] **Step 5: Run the tests — they pass**

Run: `php artisan test --filter=AnalyticsParsersTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/app/Support/Analytics api/scripts/build-geo.php api/resources/geo api/tests/Unit/AnalyticsParsersTest.php
git commit -m "Analytics: bots, agent families, sources and the country table"
```

---

### Task 2: The hits table, the visitor and `POST /collect`

**Files:**
- Create: `api/database/migrations/2026_10_27_100000_create_analytics_tables.php`, `api/app/Models/AnalyticsHit.php`, `api/app/Models/AnalyticsDaily.php`, `api/app/Support/Analytics/Visitor.php`, `api/app/Support/Analytics/Kinds.php`, `api/app/Support/Analytics/Collector.php`, `api/app/Http/Controllers/Api/V1/CollectController.php`
- Modify: `api/routes/api/public.php`, `api/database/seeders/SettingsSeeder.php`, `api/app/Support/PublicSettings.php` (nothing — `analytics` is already public; the new private group `native_analytics` stays out)
- Test: `api/tests/Feature/AnalyticsCollectTest.php`

**Interfaces:**
- Consumes: Task 1's parsers.
- Produces:
  - `Visitor::hash(string $ip, string $ua): string` (16 raw bytes), `Visitor::agent(Request $r): ?string` (the forwarded `X-Visitor-Agent` from a trusted proxy, else the request's own), `Visitor::salt(): string`.
  - `Kinds::EVENTS = ['pageview', 'outbound', 'download', 'contact', 'search']`, `Kinds::CONVERSIONS = ['enquiry', 'order_placed', 'order_paid', 'visit_requested', 'meeting_booked', 'event_registered', 'newsletter_signup']`, `Kinds::label(string $kind): string`, `Kinds::CHANNELS` (value => label).
  - `Collector::enabled(): bool`, `Collector::record(Request $r, string $kind, array $data): ?AnalyticsHit` — `$data` keys `path`, `referrer`, `utm` (array), `width`, `target`, `results`, `value_paise`, `page` (a `PageContext` array for conversions); never throws.
  - `POST /api/v1/collect` → 204.

Migration:

```php
Schema::create('analytics_hits', function (Blueprint $table) {
    $table->id();
    $table->date('day');
    $table->dateTime('at');
    $table->string('kind', 24);
    $table->string('path', 255)->nullable();
    $table->binary('visitor', 16)->nullable();
    $table->boolean('entry')->default(false);
    $table->string('channel', 16)->nullable();
    $table->string('source', 100)->nullable();
    $table->string('medium', 100)->nullable();
    $table->string('campaign', 100)->nullable();
    $table->string('referrer_host', 120)->nullable();
    $table->string('device', 8)->nullable();
    $table->string('browser', 24)->nullable();
    $table->string('os', 16)->nullable();
    $table->char('country', 2)->nullable();
    $table->string('target', 255)->nullable();
    $table->unsignedInteger('results')->nullable();
    $table->unsignedBigInteger('value_paise')->nullable();
    $table->index('day');
    $table->index(['day', 'kind']);
    $table->index(['day', 'visitor']);
    $table->index(['day', 'path']);
});

Schema::create('analytics_daily', function (Blueprint $table) {
    $table->id();
    $table->date('day');
    $table->string('dimension', 16);
    $table->string('key', 255)->default('');
    $table->string('kind', 24);
    $table->unsignedInteger('views')->default(0);
    $table->unsignedInteger('visitors')->default(0);
    $table->unsignedInteger('entries')->default(0);
    $table->unsignedInteger('bounces')->default(0);
    $table->unsignedBigInteger('value_paise')->default(0);
    $table->unique(['day', 'dimension', 'kind', 'key'], 'analytics_daily_unique');
    $table->index(['dimension', 'kind', 'day']);
});
```

(`key` at 255 inside a unique index with utf8mb4 is 1,020 bytes plus the rest — under InnoDB's 3,072-byte limit.)

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\AnalyticsHit;
use App\Models\Setting;
use App\Support\Analytics\Visitor;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsCollectTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function collect(array $body, string $ua = self::CHROME, string $ip = '203.0.113.7')
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->withHeader('User-Agent', $ua)->postJson('/api/v1/collect', $body);
    }

    public function test_a_page_view_is_one_row_and_the_address_is_never_stored(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/solutions/networking', 'r' => 'https://www.google.com/', 'w' => 1440])->assertNoContent();

        $hit = AnalyticsHit::sole();
        $this->assertSame('pageview', $hit->kind);
        $this->assertSame('/solutions/networking', $hit->path);
        $this->assertSame('search', $hit->channel);
        $this->assertSame('Google', $hit->source);
        $this->assertSame('desktop', $hit->device);
        $this->assertTrue($hit->entry);
        $this->assertSame(16, strlen($hit->visitor));
        foreach ($hit->getAttributes() as $value) {
            $this->assertStringNotContainsString('203.0.113.7', (string) $value);
        }
    }

    public function test_a_later_view_keeps_the_entry_source(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/feed/', 'w' => 1440]);
        $this->collect(['k' => 'pageview', 'p' => '/about', 'r' => '', 'w' => 1440]);

        $second = AnalyticsHit::orderBy('id')->get()[1];
        $this->assertFalse($second->entry);
        $this->assertSame('social', $second->channel);
        $this->assertSame('LinkedIn', $second->source);
    }

    public function test_the_visitor_changes_at_midnight(): void
    {
        $this->travelTo(now()->setTimezone(config('app.timezone'))->setTime(23, 59));
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440]);
        $this->travelTo(now()->addMinutes(2));
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440]);

        [$a, $b] = AnalyticsHit::orderBy('id')->get()->all();
        $this->assertNotSame($a->visitor, $b->visitor);
        $this->assertTrue($b->entry, 'a new day is a new visit');
    }

    public function test_bots_bad_paths_excluded_addresses_and_oversized_bodies_write_nothing(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/'], 'Googlebot/2.1')->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => 'https://evil.example/x'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/admin/pages'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/order/ORD-2026-00001'])->assertNoContent();
        $this->collect(['k' => 'nonsense', 'p' => '/'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/'.str_repeat('a', 3000)])->assertNoContent();
        Setting::query()->where('key', 'native_analytics_exclude_ips')->update(['value' => "203.0.113.0/24"]);
        Setting::flushCache();
        $this->collect(['k' => 'pageview', 'p' => '/'])->assertNoContent();

        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_switched_off_writes_nothing(): void
    {
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->collect(['k' => 'pageview', 'p' => '/'])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_events_carry_their_target(): void
    {
        $this->collect(['k' => 'outbound', 'p' => '/contact', 't' => 'https://maps.google.com/x'])->assertNoContent();
        $this->collect(['k' => 'contact', 'p' => '/contact', 't' => 'tel:+919876543210'])->assertNoContent();
        $this->assertSame(['https://maps.google.com/x', 'tel'], AnalyticsHit::orderBy('id')->pluck('target')->all(), 'a phone number is never stored — only that it was a call');
    }

    public function test_a_forwarded_agent_is_believed_only_from_a_trusted_proxy(): void
    {
        $request = \Illuminate\Http\Request::create('/', 'POST', server: ['REMOTE_ADDR' => '127.0.0.1', 'HTTP_USER_AGENT' => 'node', 'HTTP_X_VISITOR_AGENT' => self::CHROME]);
        $this->app->instance('request', $request);
        $this->assertSame(self::CHROME, Visitor::agent($request));

        $direct = \Illuminate\Http\Request::create('/', 'POST', server: ['REMOTE_ADDR' => '198.51.100.9', 'HTTP_USER_AGENT' => 'real', 'HTTP_X_VISITOR_AGENT' => 'forged']);
        $this->assertSame('real', Visitor::agent($direct));
    }

    public function test_it_is_throttled_and_still_answers_204(): void
    {
        for ($i = 0; $i < 130; $i++) {
            $res = $this->collect(['k' => 'pageview', 'p' => '/p'.$i]);
        }
        $res->assertNoContent();
        $this->assertLessThan(130, AnalyticsHit::count());
    }
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=AnalyticsCollectTest`
Expected: FAIL — 404 on `/api/v1/collect` (and missing class).

- [ ] **Step 3: Write the visitor, kinds, collector and route**

`Visitor.php`:

```php
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
```

`Kinds.php`:

```php
<?php

namespace App\Support\Analytics;

/** The kinds a hit may be, and what the console calls them (C3). */
final class Kinds
{
    public const EVENTS = ['pageview', 'outbound', 'download', 'contact', 'search'];

    public const CONVERSIONS = ['enquiry', 'order_placed', 'order_paid', 'visit_requested', 'meeting_booked', 'event_registered', 'newsletter_signup'];

    public const CHANNELS = ['search' => 'Search', 'social' => 'Social', 'email' => 'Email', 'referral' => 'Other websites', 'campaign' => 'Campaigns', 'direct' => 'Direct'];

    private const LABELS = [
        'pageview' => 'Page views', 'outbound' => 'Links to other sites', 'download' => 'Downloads', 'contact' => 'Calls, emails and WhatsApp',
        'search' => 'Searches', 'enquiry' => 'Enquiries', 'order_placed' => 'Orders placed', 'order_paid' => 'Orders paid',
        'visit_requested' => 'Visits requested', 'meeting_booked' => 'Meetings booked', 'event_registered' => 'Event registrations',
        'newsletter_signup' => 'Newsletter sign-ups',
    ];

    public static function label(string $kind): string
    {
        return self::LABELS[$kind] ?? $kind;
    }

    public static function valid(string $kind): bool
    {
        return in_array($kind, self::EVENTS, true) || in_array($kind, self::CONVERSIONS, true);
    }
}
```

`Collector.php`:

```php
<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsHit;
use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\IpUtils;
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
            $ua = Visitor::agent($request);
            $ip = (string) $request->ip();
            if (Bots::is($ua) || self::excludedIp($ip)) {
                return null;
            }
            $path = self::path($data['path'] ?? ($data['page']['source_path'] ?? null));
            if ($kind === 'pageview' && $path === null) {
                return null;
            }

            $visitor = Visitor::hash($ip, (string) $ua);
            $day = now()->setTimezone((string) config('app.timezone'))->toDateString();
            $first = AnalyticsHit::query()->where('day', $day)->where('visitor', $visitor)->where('entry', true)->first();
            $own = (string) parse_url((string) config('app.frontend_url'), PHP_URL_HOST);
            $page = $data['page'] ?? null;
            $source = $first !== null && ($kind !== 'pageview' || empty($data['referrer']))
                ? $first->only(['channel', 'source', 'medium', 'campaign', 'referrer_host'])
                : Source::of($data['referrer'] ?? ($page['referrer'] ?? null), [
                    'source' => $data['utm']['source'] ?? ($page['utm_source'] ?? null),
                    'medium' => $data['utm']['medium'] ?? ($page['utm_medium'] ?? null),
                    'campaign' => $data['utm']['campaign'] ?? ($page['utm_campaign'] ?? null),
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

    private static function excludedIp(string $ip): bool
    {
        $ranges = preg_split('/\R/', (string) Setting::get('native_analytics_exclude_ips', '')) ?: [];
        $ranges = array_values(array_filter(array_map('trim', $ranges)));

        return $ranges !== [] && IpUtils::checkIp($ip, $ranges);
    }
}
```

`CollectController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Analytics\Collector;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The beacon's door (C3): 204 always — a beacon has nobody to tell. */
class CollectController extends Controller
{
    private const BEACON_KINDS = ['pageview', 'outbound', 'download', 'contact'];

    public function __invoke(Request $request): Response
    {
        $raw = $request->getContent();
        $body = strlen($raw) <= 2048 ? json_decode($raw, true) : null;

        if (is_array($body) && in_array($body['k'] ?? null, self::BEACON_KINDS, true)) {
            $kind = $body['k'];
            $target = is_string($body['t'] ?? null) ? $body['t'] : null;
            // A call, an email or a WhatsApp chat is recorded as its kind of link, never the number or the address.
            if ($kind === 'contact' && $target !== null) {
                $target = match (true) { str_starts_with($target, 'tel:') => 'tel', str_starts_with($target, 'mailto:') => 'mailto', default => 'whatsapp' };
            }
            Collector::record($request, $kind, [
                'path' => is_string($body['p'] ?? null) ? $body['p'] : null,
                'referrer' => is_string($body['r'] ?? null) ? mb_substr($body['r'], 0, 2048) : null,
                'utm' => is_array($body['u'] ?? null) ? array_map(fn ($v) => is_string($v) ? $v : null, array_intersect_key($body['u'], array_flip(['source', 'medium', 'campaign']))) : [],
                'width' => is_int($body['w'] ?? null) ? $body['w'] : null,
                'target' => $target,
            ]);
        }

        return response()->noContent();
    }
}
```

Route in `routes/api/public.php`, beside `not-found`:

```php
// Native analytics (C3, docs/analytics.md): the beacon's one door, 204 always.
Route::post('collect', CollectController::class)->middleware('throttle:120,1')->name('collect');
```

`SettingsSeeder` — in the `analytics` group: `['key' => 'native_analytics_enabled', 'value' => '1', 'type' => 'boolean']`; a new private group `native_analytics`: `native_analytics_exclude_ips` (`text`, null), `native_analytics_count_staff` (`boolean`, `'0'`). Add `native_analytics` to the settings screen's copy in Task 7. `PATCH /admin/settings` validates `native_analytics_exclude_ips`: every non-blank line must be a valid IP or CIDR (`IpUtils::checkIp('0.0.0.0', [$line])` throws or returns for a malformed one — use `filter_var` on the address part and `0..32`/`0..128` on the mask), else a 422 on the row "One address or range per line, such as 203.0.113.0/24.".

Models: `AnalyticsHit` (`$timestamps = false`, `$guarded = []`, casts `entry` boolean, `day` date, `at` datetime); `AnalyticsDaily` (`$table = 'analytics_daily'`, `$timestamps = false`, `$guarded = []`, cast `day` date).

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="AnalyticsCollectTest|AnalyticsParsersTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/database/migrations api/app/Models/AnalyticsHit.php api/app/Models/AnalyticsDaily.php api/app/Support/Analytics api/app/Http/Controllers/Api/V1/CollectController.php api/routes/api/public.php api/database/seeders/SettingsSeeder.php api/app/Http/Controllers/Api/V1/Admin/SettingController.php api/tests/Feature/AnalyticsCollectTest.php
git commit -m "Analytics: the hits table, the day's visitor and POST /collect"
```

---

### Task 3: Search terms and conversions, server-side

**Files:**
- Modify: `api/app/Http/Controllers/Api/V1/SearchController.php`, `api/app/Http/Controllers/Api/V1/StoreController.php` (`products()` with `q`), `api/app/Support/Crm/LeadIntake.php` (`create()`), `api/app/Models/Order.php` (`booted()`), `api/app/Support/Newsletter/SubscriberIntake.php`
- Create: `api/app/Support/Analytics/Conversions.php`
- Test: `api/tests/Feature/AnalyticsConversionsTest.php`

**Interfaces:**
- Consumes: `Collector::record` (Task 2).
- Produces: `Conversions::record(string $kind, ?array $page, ?int $valuePaise = null, ?string $reference = null): void` — reads the current request; `Conversions::search(Request $r, string $scope, string $term, int $results): void`.

Lead channel → conversion: `visit` → `visit_requested`, `meeting` → `meeting_booked`, `event` → `event_registered`, anything else → `enquiry`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\AnalyticsHit;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Analytics\Conversions;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AnalyticsConversionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36');
    }

    public function test_an_enquiry_is_a_conversion_attributed_to_the_page_that_sent_it(): void
    {
        $this->postJson('/api/v1/enquiries', [
            'name' => 'Priya', 'email' => 'priya@meridian.test', 'message' => 'We need twenty access points for two floors.',
            '_source_url' => 'https://www.technoware.in/solutions/wifi', '_utm_source' => 'linkedin', '_utm_medium' => 'social',
        ])->assertSuccessful();

        $hit = AnalyticsHit::where('kind', 'enquiry')->sole();
        $this->assertSame('/solutions/wifi', $hit->path);
        $this->assertSame('social', $hit->channel);
        $this->assertSame('linkedin', $hit->source);
    }

    public function test_an_order_placed_and_paid_are_two_conversions_with_a_value(): void
    {
        $order = Order::create(['status' => 'pending_payment', 'subtotal_paise' => 118000, 'taxable_paise' => 100000, 'gst_paise' => 18000, 'total_paise' => 118000, 'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now()]);
        $order->update(['paid_at' => now(), 'status' => 'paid']);

        $this->assertSame(['order_placed', 'order_paid'], AnalyticsHit::orderBy('id')->pluck('kind')->all());
        $this->assertSame(118000, (int) AnalyticsHit::where('kind', 'order_paid')->value('value_paise'));
        $this->assertSame($order->order_number, AnalyticsHit::where('kind', 'order_paid')->value('target'));
    }

    public function test_a_site_search_records_the_term_and_the_result_count(): void
    {
        $this->getJson('/api/v1/search?q=Firewall+Rental')->assertOk();
        $hit = AnalyticsHit::where('kind', 'search')->sole();
        $this->assertSame('firewall rental', $hit->target);
        $this->assertSame('site', $hit->path === '/search' ? 'site' : 'shop');
        $this->assertSame(0, $hit->results);
    }

    public function test_a_term_that_looks_personal_is_not_stored(): void
    {
        $this->getJson('/api/v1/search?q=priya@meridian.test')->assertOk();
        $this->getJson('/api/v1/search?q=%2B91+98765+43210')->assertOk();
        $this->assertSame(0, AnalyticsHit::where('kind', 'search')->count());
    }

    public function test_a_conversion_failure_never_fails_the_request(): void
    {
        \Illuminate\Support\Facades\Schema::drop('analytics_hits');
        $this->postJson('/api/v1/enquiries', ['name' => 'P', 'email' => 'p@example.test', 'message' => 'Twenty access points, please, for two floors.'])->assertSuccessful();
        Conversions::record('order_paid', null, 100);
        $this->assertTrue(true, 'nothing was thrown');
    }

    public function test_switched_off_records_no_conversion(): void
    {
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->postJson('/api/v1/enquiries', ['name' => 'P', 'email' => 'p@example.test', 'message' => 'Twenty access points, please, for two floors.'])->assertSuccessful();
        $this->assertSame(0, AnalyticsHit::count());
    }
}
```

(The enquiry payload must satisfy `StoreEnquiryRequest`; read it and add any required field the test lacks — `phone`, `subject` — before running.)

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=AnalyticsConversionsTest`
Expected: FAIL (no hits written).

- [ ] **Step 3: Write `Conversions` and the hooks**

```php
<?php

namespace App\Support\Analytics;

use Illuminate\Http\Request;
use Throwable;

/** Search terms and conversions, recorded where they happen (C3). Never throws. */
final class Conversions
{
    /** @param array<string, ?string>|null $page a PageContext array, when the request carried one */
    public static function record(string $kind, ?array $page, ?int $valuePaise = null, ?string $reference = null): void
    {
        try {
            $request = app()->bound('request') ? request() : null;
            if (! $request instanceof Request || app()->runningInConsole() && ! app()->runningUnitTests()) {
                return; // A conversion made by a command or a worker has no visitor to attribute it to.
            }
            Collector::record($request, $kind, [
                'page' => $page,
                'path' => $page['source_path'] ?? null,
                'target' => $reference,
                'value_paise' => $valuePaise,
            ]);
        } catch (Throwable) {
            // Collector already logs; nothing reaches the caller.
        }
    }

    public static function search(Request $request, string $scope, string $term, int $results): void
    {
        $term = mb_strtolower(trim(preg_replace('/\s+/', ' ', $term) ?? ''));
        if ($term === '' || mb_strlen($term) > 100 || self::personal($term)) {
            return;
        }
        Collector::record($request, 'search', ['path' => $scope === 'shop' ? '/store' : '/search', 'target' => $term, 'results' => $results]);
    }

    /** An email address or something with seven or more digits — a phone number, an order number with a person behind it. */
    private static function personal(string $term): bool
    {
        return str_contains($term, '@') || preg_match_all('/\d/', $term) >= 7;
    }
}
```

Hooks:
- `LeadIntake::create()` — after `Lead::create(...)` succeeds, before `return`:
  ```php
  Conversions::record(match ($channel) { 'visit' => 'visit_requested', 'meeting' => 'meeting_booked', 'event' => 'event_registered', default => 'enquiry' }, $page);
  ```
  (Assign the created lead to `$lead` first, then record, then `return $lead;`.)
- `Order::booted()` — a `static::created` closure: `Conversions::record('order_placed', null, (int) $order->total_paise, $order->order_number);`; inside the existing `updated` closure, in the `paid_at` null→set branch beside the webhook: `Conversions::record('order_paid', null, (int) $order->total_paise, $order->order_number);`.
- `SubscriberIntake` — where a public signup adds a new active subscriber (read the class: the method the public `/newsletter/subscribe` calls), after the add: `Conversions::record('newsletter_signup', PageContext::from(request()));`. Not for imports or the customer group sync.
- `SearchController::__invoke` — after the groups are built, when `$term` reached the search: `Conversions::search($request, 'site', $term, (int) $groups->sum('total'));`.
- `StoreController::products()` — when `q` is filled, after the paginator: `Conversions::search($request, 'shop', (string) $request->string('q'), $page->total());`.

Fix the test's scope assertion when writing it: assert `$hit->path === '/search'`.

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="AnalyticsConversionsTest|LeadTest|CheckoutTest|NewsletterTest|SearchTest|StoreCatalogueTest"` (use the real class names `ls api/tests/Feature` shows)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Analytics/Conversions.php api/app/Support/Crm/LeadIntake.php api/app/Models/Order.php api/app/Support/Newsletter/SubscriberIntake.php api/app/Http/Controllers/Api/V1/SearchController.php api/app/Http/Controllers/Api/V1/StoreController.php api/tests/Feature/AnalyticsConversionsTest.php
git commit -m "Analytics: search terms and conversions where they happen"
```

---

### Task 4: The rollup, the prune and the report

**Files:**
- Create: `api/app/Support/Analytics/Rollup.php`, `api/app/Support/Analytics/Report.php`, `api/app/Console/Commands/AnalyticsRollup.php`, `api/app/Console/Commands/PruneAnalyticsHits.php`
- Modify: `api/routes/console.php`
- Test: `api/tests/Feature/AnalyticsReportTest.php`

**Interfaces:**
- Produces:
  - `Rollup::rows(string $day): list<array{day, dimension, key, kind, views, visitors, entries, bounces, value_paise}>` (from raw hits, any day); `Rollup::day(string $day): void` (rebuilds that day's daily rows in one transaction).
  - `Report::summary(Carbon $from, Carbon $to, string $compare): array`, `Report::breakdown(string $dimension, Carbon $from, Carbon $to, string $kind = 'pageview', int $limit = 10): list<array{key, label, views, visitors, value_paise}>`, `Report::series(Carbon $from, Carbon $to, string $kind = 'pageview'): list<array{day, views, visitors}>`, `Report::search(Carbon $from, Carbon $to, ?string $scope): array{terms, nothing}`, `Report::now(): array{views, pages}`, `Report::pages(int $days = 28): array<string, array{views: int, users: int}>` (the SEO overview's shape), `Report::productViews(Carbon $from, Carbon $to): ?int`.
- Dimensions: `total`, `page`, `entry`, `channel`, `source`, `campaign`, `device`, `browser`, `os`, `country`, `target`.

Rules the rollup computes per day (all from `analytics_hits` where `day = ?`):
- `total` / `''` / `pageview`: views = count, visitors = distinct visitor, entries = count where entry, bounces = visitors whose only pageview that day is one.
- `page` / path / `pageview`: views, distinct visitors; `entry` / path / `pageview`: entries and bounces of visits that entered there.
- `channel|source|campaign|device|browser|os|country` / value / `pageview`: views and distinct visitors.
- For each non-pageview kind present: `total` / `''` / kind (views = count, visitors = distinct, value = sum); `target` / target / kind; `channel` / channel / kind; `source` / source / kind (conversions only); `page` / path / kind.
- A null value is grouped under the key `''`, labelled "Unknown" (country, browser) or "Direct" (source) by `Report`.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Models\AnalyticsDaily;
use App\Models\AnalyticsHit;
use App\Support\Analytics\Report;
use App\Support\Analytics\Rollup;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AnalyticsReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Asia/Kolkata'));
    }

    private function hit(string $day, string $visitor, string $path, array $extra = []): void
    {
        AnalyticsHit::create(['day' => $day, 'at' => $day.' 10:00:00', 'kind' => 'pageview', 'path' => $path, 'visitor' => str_pad($visitor, 16, "\0"),
            'entry' => false, 'channel' => 'direct', 'device' => 'desktop', ...$extra]);
    }

    public function test_the_rollup_counts_views_visits_entries_and_bounces(): void
    {
        $this->hit('2026-10-20', 'a', '/', ['entry' => true, 'channel' => 'search', 'source' => 'Google']);
        $this->hit('2026-10-20', 'a', '/about');
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);

        Rollup::day('2026-10-20');
        $total = AnalyticsDaily::where(['day' => '2026-10-20', 'dimension' => 'total', 'kind' => 'pageview'])->sole();
        $this->assertSame([3, 2, 2, 1], [$total->views, $total->visitors, $total->entries, $total->bounces]);

        Rollup::day('2026-10-20');
        $this->assertSame(1, AnalyticsDaily::where(['day' => '2026-10-20', 'dimension' => 'total', 'kind' => 'pageview'])->count(), 'a rebuild replaces, never adds');
    }

    public function test_today_is_merged_and_a_rolled_day_is_not_counted_twice(): void
    {
        $this->hit('2026-10-20', 'a', '/', ['entry' => true]);
        Rollup::day('2026-10-20');
        $this->hit('2026-10-21', 'c', '/', ['entry' => true]);
        $this->hit('2026-10-21', 'c', '/x');

        $s = Report::summary(Carbon::parse('2026-10-20'), Carbon::parse('2026-10-21'), 'none');
        $this->assertSame(3, $s['views']['value']);
        $this->assertSame(2, $s['visits']['value']);
    }

    public function test_figures_over_no_data_are_null(): void
    {
        $s = Report::summary(Carbon::parse('2026-10-01'), Carbon::parse('2026-10-07'), 'previous');
        $this->assertSame(0, $s['views']['value']);
        $this->assertNull($s['bounce_share']['value']);
        $this->assertNull($s['views_per_visit']['value']);
        $this->assertNull($s['views']['change']);
    }

    public function test_the_comparison_is_the_same_length_before(): void
    {
        $this->hit('2026-10-13', 'a', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'c', '/', ['entry' => true]);
        Rollup::day('2026-10-13');
        Rollup::day('2026-10-20');

        $s = Report::summary(Carbon::parse('2026-10-15'), Carbon::parse('2026-10-21'), 'previous');
        $this->assertSame(2, $s['visits']['value']);
        $this->assertSame(1, $s['visits']['previous']);
        $this->assertSame(100.0, $s['visits']['change']);
    }

    public function test_the_prune_drops_raw_hits_after_ninety_days_and_keeps_totals(): void
    {
        $this->hit('2026-07-01', 'a', '/', ['entry' => true]);
        Rollup::day('2026-07-01');
        $this->artisan('technoware:prune-analytics-hits')->assertSuccessful();
        $this->assertSame(0, AnalyticsHit::count());
        $this->assertSame(1, AnalyticsDaily::where(['day' => '2026-07-01', 'dimension' => 'total'])->count());
    }

    public function test_the_rollup_command_rolls_every_closed_day_not_yet_rolled(): void
    {
        $this->hit('2026-10-19', 'a', '/', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/', ['entry' => true]);
        $this->hit('2026-10-21', 'c', '/', ['entry' => true]);
        $this->artisan('technoware:analytics-rollup')->assertSuccessful();
        $this->assertSame(['2026-10-19', '2026-10-20'], AnalyticsDaily::where('dimension', 'total')->orderBy('day')->pluck('day')->map->toDateString()->all());
    }

    public function test_pages_answer_in_the_seo_overviews_shape(): void
    {
        $this->hit('2026-10-20', 'a', '/solutions/wifi', ['entry' => true]);
        $this->hit('2026-10-20', 'b', '/solutions/wifi', ['entry' => true]);
        Rollup::day('2026-10-20');
        $this->assertSame(['views' => 2, 'users' => 2], Report::pages(28)['/solutions/wifi']);
    }
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=AnalyticsReportTest`
Expected: FAIL — missing classes.

- [ ] **Step 3: Write `Rollup`, `Report` and the commands**

`Rollup.php`:

```php
<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsDaily;
use Illuminate\Support\Facades\DB;

/** Daily totals from raw hits (C3). A day is rebuilt whole, so running it twice changes nothing. */
final class Rollup
{
    private const VISIT_DIMENSIONS = ['channel', 'source', 'campaign', 'device', 'browser', 'os', 'country'];

    /** @return list<array<string, mixed>> */
    public static function rows(string $day): array
    {
        $hits = fn () => DB::table('analytics_hits')->where('day', $day);
        $rows = [];
        $add = function (string $dimension, string $kind, iterable $groups) use ($day, &$rows) {
            foreach ($groups as $g) {
                $rows[] = ['day' => $day, 'dimension' => $dimension, 'key' => (string) ($g->k ?? ''), 'kind' => $kind,
                    'views' => (int) $g->views, 'visitors' => (int) ($g->visitors ?? 0), 'entries' => (int) ($g->entries ?? 0),
                    'bounces' => (int) ($g->bounces ?? 0), 'value_paise' => (int) ($g->value ?? 0)];
            }
        };

        // Visitors with exactly one page view that day: a bounce.
        $single = DB::table('analytics_hits')->select('visitor')->where('day', $day)->where('kind', 'pageview')
            ->groupBy('visitor')->havingRaw('COUNT(*) = 1');

        $add('total', 'pageview', $hits()->where('kind', 'pageview')->selectRaw(
            "'' as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(entry) as entries, (SELECT COUNT(*) FROM ({$single->toSql()}) s) as bounces",
            $single->getBindings(),
        )->get());
        $add('page', 'pageview', $hits()->where('kind', 'pageview')->groupBy('path')->selectRaw('path as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors')->get());
        $add('entry', 'pageview', $hits()->where('kind', 'pageview')->where('entry', true)->groupBy('path')->selectRaw(
            "path as k, COUNT(*) as views, COUNT(*) as entries, SUM(visitor IN (SELECT visitor FROM ({$single->toSql()}) s2)) as bounces",
            $single->getBindings(),
        )->get());
        foreach (self::VISIT_DIMENSIONS as $col) {
            $add($col, 'pageview', $hits()->where('kind', 'pageview')->groupBy($col)->selectRaw("COALESCE({$col}, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors")->get());
        }

        foreach ($hits()->where('kind', '!=', 'pageview')->distinct()->pluck('kind') as $kind) {
            $of = fn () => $hits()->where('kind', $kind);
            $add('total', $kind, $of()->selectRaw("'' as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            $add('target', $kind, $of()->groupBy('target')->selectRaw("COALESCE(target, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            $add('page', $kind, $of()->groupBy('path')->selectRaw("COALESCE(path, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            foreach (['channel', 'source'] as $col) {
                $add($col, $kind, $of()->groupBy($col)->selectRaw("COALESCE({$col}, '') as k, COUNT(*) as views, COUNT(DISTINCT visitor) as visitors, SUM(COALESCE(value_paise, 0)) as value")->get());
            }
        }

        return array_values(array_filter($rows, fn (array $r) => $r['views'] > 0));
    }

    public static function day(string $day): void
    {
        $rows = self::rows($day);
        DB::transaction(function () use ($day, $rows) {
            AnalyticsDaily::query()->where('day', $day)->delete();
            foreach (array_chunk($rows, 500) as $chunk) {
                AnalyticsDaily::query()->insert($chunk);
            }
        });
    }
}
```

(`SUM(entry)` relies on MySQL treating a boolean as 0/1, and SQLite does too. The `visitor IN (…)` sum counts, per entry page, the entries that were the visit's only view.)

`Report.php` — reads `analytics_daily` for days before today and `Rollup::rows(today)` for today, merged in PHP by `(dimension, key, kind)`:

```php
<?php

namespace App\Support\Analytics;

use App\Models\AnalyticsDaily;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/** Every read of native analytics (C3). Closed days from analytics_daily, today from the raw hits. */
final class Report
{
    /** @return Collection<int, array<string, mixed>> */
    public static function rows(Carbon $from, Carbon $to, ?string $dimension = null, ?string $kind = null): Collection
    {
        $tz = (string) config('app.timezone');
        $today = now()->setTimezone($tz)->toDateString();
        $f = $from->copy()->setTimezone($tz)->toDateString();
        $t = $to->copy()->setTimezone($tz)->toDateString();

        $closed = AnalyticsDaily::query()->whereBetween('day', [$f, min($t, now()->setTimezone($tz)->subDay()->toDateString())])
            ->when($dimension, fn ($q) => $q->where('dimension', $dimension))
            ->when($kind, fn ($q) => $q->where('kind', $kind))
            ->get()->map(fn (AnalyticsDaily $r) => [...$r->only(['dimension', 'key', 'kind', 'views', 'visitors', 'entries', 'bounces', 'value_paise']), 'day' => $r->day->toDateString()]);

        $live = $t >= $today && $f <= $today
            ? collect(Rollup::rows($today))->filter(fn ($r) => ($dimension === null || $r['dimension'] === $dimension) && ($kind === null || $r['kind'] === $kind))
            : collect();

        return $closed->concat($live)->values();
    }

    /** @return array<string, array{value: int|float|null, previous: int|float|null, change: float|null}> */
    public static function summary(Carbon $from, Carbon $to, string $compare): array
    {
        $now = self::totals($from, $to);
        [$pf, $pt] = self::comparison($from, $to, $compare);
        $before = $pf === null ? null : self::totals($pf, $pt);

        $out = [];
        foreach ($now as $key => $value) {
            $prev = $before[$key] ?? null;
            $out[$key] = ['value' => $value, 'previous' => $prev,
                'change' => $prev === null || $value === null || (float) $prev === 0.0 ? null : round(($value - $prev) / $prev * 100, 1)];
        }

        return $out;
    }

    /** @return array{views: int, visits: int, entries: int, bounce_share: ?float, views_per_visit: ?float, conversions: int, revenue_paise: int} */
    private static function totals(Carbon $from, Carbon $to): array
    {
        $rows = self::rows($from, $to, 'total');
        $pv = $rows->where('kind', 'pageview');
        $visits = (int) $pv->sum('visitors');
        $conv = $rows->whereIn('kind', Kinds::CONVERSIONS);

        return [
            'views' => (int) $pv->sum('views'),
            'visits' => $visits,
            'entries' => (int) $pv->sum('entries'),
            'bounce_share' => $visits > 0 ? round($pv->sum('bounces') / $visits * 100, 1) : null,
            'views_per_visit' => $visits > 0 ? round($pv->sum('views') / $visits, 2) : null,
            'conversions' => (int) $conv->sum('views'),
            'revenue_paise' => (int) $rows->where('kind', 'order_paid')->sum('value_paise'),
        ];
    }

    /** @return array{0: ?Carbon, 1: ?Carbon} */
    private static function comparison(Carbon $from, Carbon $to, string $compare): array
    {
        $days = (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1;

        return match ($compare) {
            'previous' => [$from->copy()->subDays($days), $from->copy()->subDay()],
            'year' => [$from->copy()->subYear(), $to->copy()->subYear()],
            default => [null, null],
        };
    }

    /** @return list<array{day: string, views: int, visitors: int}> */
    public static function series(Carbon $from, Carbon $to, string $kind = 'pageview'): array
    {
        $byDay = self::rows($from, $to, 'total', $kind)->groupBy('day');
        $out = [];
        for ($d = $from->copy()->startOfDay(); $d->lte($to); $d->addDay()) {
            $day = $d->toDateString();
            $out[] = ['day' => $day, 'views' => (int) ($byDay[$day] ?? collect())->sum('views'), 'visitors' => (int) ($byDay[$day] ?? collect())->sum('visitors')];
        }

        return $out;
    }

    /** @return list<array{key: string, label: string, views: int, visitors: int, value_paise: int}> */
    public static function breakdown(string $dimension, Carbon $from, Carbon $to, string $kind = 'pageview', int $limit = 10): array
    {
        return self::rows($from, $to, $dimension, $kind)->groupBy('key')
            ->map(fn (Collection $g, $key) => ['key' => (string) $key, 'label' => Labels::of($dimension, (string) $key),
                'views' => (int) $g->sum('views'), 'visitors' => (int) $g->sum('visitors'), 'value_paise' => (int) $g->sum('value_paise')])
            ->sortByDesc('views')->take($limit)->values()->all();
    }

    /** @return array{terms: list<array<string, mixed>>, nothing: list<array<string, mixed>>} */
    public static function search(Carbon $from, Carbon $to, ?string $scope): array
    {
        $raw = \App\Models\AnalyticsHit::query()->where('kind', 'search')
            ->whereBetween('day', [$from->toDateString(), $to->toDateString()])
            ->when($scope, fn ($q) => $q->where('path', $scope === 'shop' ? '/store' : '/search'))
            ->selectRaw('target, COUNT(*) as n, MAX(results) as best')->groupBy('target')->orderByDesc('n')->limit(100)->get();

        return [
            'terms' => $raw->take(25)->map(fn ($r) => ['term' => $r->target, 'searches' => (int) $r->n, 'results' => (int) $r->best])->values()->all(),
            'nothing' => $raw->where('best', 0)->take(25)->map(fn ($r) => ['term' => $r->target, 'searches' => (int) $r->n])->values()->all(),
        ];
    }

    /** @return array{views: int, pages: list<array{path: string, views: int}>} */
    public static function now(): array
    {
        $since = now()->subMinutes(30);
        $q = \App\Models\AnalyticsHit::query()->where('kind', 'pageview')->where('at', '>=', $since);

        return ['views' => (clone $q)->count(),
            'pages' => (clone $q)->selectRaw('path, COUNT(*) as n')->groupBy('path')->orderByDesc('n')->limit(5)->get()
                ->map(fn ($r) => ['path' => (string) $r->path, 'views' => (int) $r->n])->all()];
    }

    /** The SEO overview's shape: path => {views, users} over the last $days. @return array<string, array{views: int, users: int}> */
    public static function pages(int $days = 28): array
    {
        return self::rows(now()->subDays($days - 1), now(), 'page', 'pageview')->groupBy('key')
            ->map(fn (Collection $g) => ['views' => (int) $g->sum('views'), 'users' => (int) $g->sum('visitors')])->all();
    }

    public static function productViews(Carbon $from, Carbon $to): ?int
    {
        if (! Collector::enabled()) {
            return null;
        }

        return (int) self::rows($from, $to, 'page', 'pageview')->filter(fn ($r) => str_starts_with((string) $r['key'], '/store/products/'))->sum('views');
    }
}
```

Search reads raw hits (90 days), so its range is clamped to 90 days by the controller in Task 5.

`Labels.php` (add to `app/Support/Analytics/`): `Labels::of(string $dimension, string $key): string` — `channel` → `Kinds::CHANNELS[$key] ?? 'Direct'`; `country` → the country's English name from `App\Support\Countries` (the one country list) or "Unknown"; `source` blank → "Direct"; `browser`/`os`/`device` blank → "Unknown", `device` → `Desktop|Tablet|Phone`; `page`/`entry`/`target`/`campaign` → the key itself, blank → "(none)".

Commands:

```php
// AnalyticsRollup: every closed day with raw hits and no daily rows, oldest first, plus yesterday always (a late hit).
protected $signature = 'technoware:analytics-rollup';
public function handle(): int
{
    $tz = (string) config('app.timezone');
    $today = now()->setTimezone($tz)->toDateString();
    $rolled = \App\Models\AnalyticsDaily::query()->distinct()->pluck('day')->map(fn ($d) => \Illuminate\Support\Carbon::parse($d)->toDateString())->all();
    $days = \App\Models\AnalyticsHit::query()->where('day', '<', $today)->distinct()->pluck('day')->map(fn ($d) => \Illuminate\Support\Carbon::parse($d)->toDateString())
        ->filter(fn ($d) => ! in_array($d, $rolled, true) || $d === now()->setTimezone($tz)->subDay()->toDateString())->sort()->values();
    foreach ($days as $day) {
        \App\Support\Analytics\Rollup::day($day);
    }
    $this->info("Rolled {$days->count()} day(s).");

    return self::SUCCESS;
}

// PruneAnalyticsHits: raw hits older than 90 days, only once their day is rolled.
protected $signature = 'technoware:prune-analytics-hits';
public function handle(): int
{
    $cutoff = now()->setTimezone((string) config('app.timezone'))->subDays(90)->toDateString();
    \App\Models\AnalyticsHit::query()->where('day', '<', $cutoff)
        ->whereIn('day', \App\Models\AnalyticsDaily::query()->select('day'))->delete();

    return self::SUCCESS;
}
```

`routes/console.php`: `Schedule::command('technoware:analytics-rollup')->dailyAt('00:20')->withoutOverlapping();` and `Schedule::command('technoware:prune-analytics-hits')->dailyAt('03:55');` — written the way the file's other entries are (read it).

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="AnalyticsReportTest|AnalyticsCollectTest"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/app/Support/Analytics api/app/Console/Commands/AnalyticsRollup.php api/app/Console/Commands/PruneAnalyticsHits.php api/routes/console.php api/tests/Feature/AnalyticsReportTest.php
git commit -m "Analytics: the nightly rollup, the 90-day prune and the report"
```

---

### Task 5: The staff API, and the console's own figures switched to native

**Files:**
- Create: `api/app/Http/Controllers/Api/V1/Admin/AnalyticsController.php`
- Modify: `api/routes/api/admin-*.php` (a new `routes/api/admin-analytics.php` required by `routes/api.php` inside the admin group, `role:admin,seo_manager,content_manager`), `api/app/Support/Store/StoreMetrics.php` (`funnel()`), `api/app/Http/Controllers/Api/V1/Admin/SeoController.php` (`withAnalytics()`, the `no_views` filter, `meta.analytics`), `api/app/Http/Controllers/Api/V1/Admin/LeadController.php` (`sources()`), `api/routes/api/admin-sales-manager.php`
- Test: `api/tests/Feature/AnalyticsAdminTest.php`

**Interfaces:**
- Consumes: `Report` (Task 4).
- Produces: `GET /admin/analytics/summary`, `/breakdown`, `/pages`, `/search`, `/now`, `/export`; `GET /admin/leads/sources`.

Query rules shared by every endpoint (`AnalyticsController::range()`): `from`/`to` are `Y-m-d`; default the last 30 days ending today; `to` is clamped to today; a backwards range is swapped; a range over 400 days is a 422 on `from`; `compare` is `previous|year|none` (default `previous`). `dimension` must be one of the eleven or a 422; `kind` one of `Kinds::EVENTS + CONVERSIONS` or a 422; `limit` 1–100, default 10.

Response shapes:
- `summary` → `{data: {range: {from, to, label}, compare, views, visits, entries, bounce_share, views_per_visit, conversions, revenue_paise (each {value, previous, change}), series: [{day, label, views, visitors, previous_views}]}, meta: {enabled}}`. `label` is the API's (`Mon 21 Oct`).
- `breakdown` → `{data: [{key, label, views, visitors, value_paise, share}], meta: {dimension, kind, total}}` — `share` is views over the dimension's total, one decimal, null when the total is 0.
- `pages?path=` → `{data: {path, series, entries, sources: breakdown(source) for that path…}}` — the per-page view reads raw hits filtered by `path` for the range (clamped to 90 days).
- `search` → `{data: {terms, nothing}}` (range clamped to the last 90 days; `scope=site|shop|all`).
- `now` → `{data: {views, pages}}`, `Cache-Control: no-store`.
- `export` → CSV through the application's one CSV writer (`App\Support\Newsletter\Csv` — read its API), the breakdown's rows with a heading row; `?dimension=` required.
- `leads/sources` (`role:sales_manager`) → `{data: [{channel, label, enquiries, orders_paid, revenue_paise}]}` from `breakdown('channel', …, kind)` for `enquiry` and `order_paid`.

`StoreMetrics::funnel()`: `$views = Collector::enabled() ? Report::productViews($since, Carbon::today()) : GoogleAnalytics::productViews($since, Carbon::today());` and add `'views_source' => Collector::enabled() ? 'native' : (GoogleAnalytics::configured() ? 'ga4' : null)` to the funnel array (the store dashboard prints which).

`SeoController::withAnalytics()`: `$pages = Collector::enabled() ? Report::pages(28) : GoogleAnalytics::pages();` and the `no_views` filter's `GoogleAnalytics::configured()` check becomes `Collector::enabled() || GoogleAnalytics::configured()`; `meta.analytics` gains `source` (`native|ga4|null`) and `configured` is true when either is.

- [ ] **Step 1: Write the failing tests**

```php
<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\AnalyticsHit;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AnalyticsAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Asia/Kolkata'));
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = User::firstOrCreate(['email' => "{$role->value}-an-{$tag}@example.test"], ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function hit(string $path, string $visitor, array $extra = []): void
    {
        AnalyticsHit::create(['day' => '2026-10-21', 'at' => now(), 'kind' => 'pageview', 'path' => $path, 'visitor' => str_pad($visitor, 16, "\0"), 'entry' => true, 'channel' => 'search', 'source' => 'Google', 'device' => 'desktop', ...$extra]);
    }

    public function test_the_summary_and_a_breakdown_answer_for_the_owning_roles(): void
    {
        $this->hit('/', 'a');
        $this->hit('/about', 'b', ['channel' => 'social', 'source' => 'LinkedIn']);

        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/analytics/summary?from=2026-10-15&to=2026-10-21')
            ->assertOk()->assertJsonPath('data.views.value', 2)->assertJsonPath('data.visits.value', 2)->assertJsonCount(7, 'data.series');
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/analytics/breakdown?dimension=channel')
            ->assertOk()->assertJsonPath('data.0.label', 'Search')->assertJsonPath('data.0.share', 50.0);
    }

    public function test_other_roles_are_refused_and_bad_parameters_are_a_422(): void
    {
        $this->asStaff(RoleEnum::SupportEngineer)->getJson('/api/v1/admin/analytics/summary')->assertForbidden();
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/breakdown?dimension=planet')->assertStatus(422);
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/summary?from=2024-01-01&to=2026-10-21')->assertStatus(422);
    }

    public function test_switched_off_reports_null_and_the_overview_falls_back(): void
    {
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/summary')->assertOk()->assertJsonPath('meta.enabled', false);
        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/seo')->assertOk()->assertJsonPath('meta.analytics.source', null);
    }

    public function test_the_seo_overview_reads_native_views(): void
    {
        $this->hit('/about', 'a');
        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/seo')->assertOk()->assertJsonPath('meta.analytics.source', 'native');
    }

    public function test_the_export_is_a_csv(): void
    {
        $this->hit('/about', 'a');
        $res = $this->asStaff(RoleEnum::Admin)->get('/api/v1/admin/analytics/export?dimension=page');
        $res->assertOk();
        $this->assertStringContainsString('text/csv', (string) $res->headers->get('Content-Type'));
        $this->assertStringContainsString('/about', $res->streamedContent());
    }

    public function test_sales_sees_conversions_by_source(): void
    {
        AnalyticsHit::create(['day' => '2026-10-21', 'at' => now(), 'kind' => 'enquiry', 'path' => '/contact', 'visitor' => str_pad('x', 16, "\0"), 'channel' => 'email', 'source' => 'newsletter']);
        $this->asStaff(RoleEnum::SalesManager)->getJson('/api/v1/admin/leads/sources')->assertOk()->assertJsonPath('data.0.channel', 'email')->assertJsonPath('data.0.enquiries', 1);
    }
}
```

- [ ] **Step 2: Run them — they fail**

Run: `php artisan test --filter=AnalyticsAdminTest`
Expected: FAIL (404 routes).

- [ ] **Step 3: Write the controller, routes and the two switches**

Implement `AnalyticsController` with `summary`, `breakdown`, `pages`, `search`, `now`, `export` per the shapes above, a private `range(Request): array{0: Carbon, 1: Carbon}` and `meta.enabled = Collector::enabled()` on every answer (when off, `summary` still answers its zeros and nulls so the screen can say why). Day labels: `$day->locale('en')->isoFormat('ddd D MMM')`.

`routes/api/admin-analytics.php`:

```php
<?php

use App\Http\Controllers\Api\V1\Admin\AnalyticsController;
use Illuminate\Support\Facades\Route;

/* Native analytics (C3, docs/analytics.md). Required inside the admin group by routes/api.php. */
Route::middleware('role:admin,seo_manager,content_manager')->group(function () {
    Route::get('analytics/summary', [AnalyticsController::class, 'summary'])->name('analytics.summary');
    Route::get('analytics/breakdown', [AnalyticsController::class, 'breakdown'])->name('analytics.breakdown');
    Route::get('analytics/pages', [AnalyticsController::class, 'pages'])->name('analytics.pages');
    Route::get('analytics/search', [AnalyticsController::class, 'search'])->name('analytics.search');
    Route::get('analytics/now', [AnalyticsController::class, 'now'])->middleware('throttle:60,1')->name('analytics.now');
    Route::get('analytics/export', [AnalyticsController::class, 'export'])->name('analytics.export');
});
```

Add the `require` to `routes/api.php` beside the other role files (read how they are required). `leads/sources` goes in the sales-manager file, declared above `leads/{lead}`.

- [ ] **Step 4: Run the tests — they pass**

Run: `php artisan test --filter="AnalyticsAdminTest|SeoOverviewTest|StoreDashboardTest|LeadTest|GoogleAnalyticsTest"` (real class names from `ls api/tests/Feature`)
Expected: PASS. An existing GA4 test that expects GA4 figures in the overview must set `native_analytics_enabled` to `0` first — update it, with a comment, rather than weakening the new rule.

- [ ] **Step 5: Commit**

```bash
git add api/app/Http/Controllers/Api/V1/Admin/AnalyticsController.php api/routes api/app/Support/Store/StoreMetrics.php api/app/Http/Controllers/Api/V1/Admin/SeoController.php api/app/Http/Controllers/Api/V1/Admin/LeadController.php api/tests/Feature
git commit -m "Analytics: the staff API, and the console's own figures read native counts"
```

---

### Task 6: The beacon and its route handler

**Files:**
- Create: `web/src/lib/analytics-beacon.ts`, `web/scripts/analytics-beacon.check.mjs`, `web/src/components/layout/analytics-beacon.tsx`, `web/src/app/api/collect/route.ts`
- Modify: `web/src/lib/client-ip.ts` (`clientIpHeaders()` also forwards `X-Visitor-Agent`), `web/src/app/(marketing)/layout.tsx`

**Interfaces:**
- Produces: `collectable(path: string): boolean`, `linkKind(href: string, origin: string): "outbound" | "download" | "contact" | null`, `utmFrom(search: string): {source?: string, medium?: string, campaign?: string}` in `lib/analytics-beacon.ts`; `<AnalyticsBeacon enabled />`.

- [ ] **Step 1: Write the failing check**

```js
// node --experimental-strip-types scripts/analytics-beacon.check.mjs
// Pins the beacon's pure rules (C3, docs/analytics.md).
import { collectable, linkKind, utmFrom } from "../src/lib/analytics-beacon.ts";

let failed = 0;
const ok = (c, l) => { console.log(`${c ? "ok  " : "FAIL"} ${l}`); if (!c) failed++; };
const o = "https://www.technoware.in";

ok(collectable("/solutions/networking"), "a public page is counted");
for (const p of ["/admin", "/admin/pages/1", "/portal", "/api/collect", "/order/ORD-1", "/preview/abc", "/visit/TV-1", "/meeting/MT-1", "/ticket-survey/x", "/events/registration/x", "/newsletter/unsubscribe/x", "/store/notify/cancel/x"]) ok(!collectable(p), `${p} is never counted`);
ok(linkKind("https://partner.example.com/x", o) === "outbound", "another host is outbound");
ok(linkKind("/about", o) === null, "an in-site link is nothing");
ok(linkKind("https://www.technoware.in/about", o) === null, "our own absolute link is nothing");
ok(linkKind("/api/downloads/12", o) === "download", "a downloads-centre file is a download");
ok(linkKind("/storage/media/brochure.pdf", o) === "download", "a library PDF is a download");
ok(linkKind("tel:+919876543210", o) === "contact", "a phone link is contact");
ok(linkKind("mailto:sales@technoware.in", o) === "contact", "a mail link is contact");
ok(linkKind("https://wa.me/919876543210", o) === "contact", "WhatsApp is contact, not outbound");
ok(JSON.stringify(utmFrom("?utm_source=newsletter&utm_medium=email&utm_campaign=oct&x=1")) === JSON.stringify({ source: "newsletter", medium: "email", campaign: "oct" }), "UTM tags are read and nothing else");
ok(JSON.stringify(utmFrom("?page=2")) === "{}", "no tags is nothing");

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
```

Run: `node --experimental-strip-types scripts/analytics-beacon.check.mjs`
Expected: FAIL — `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Write the rules**

```ts
/*
 * The beacon's pure rules (C3, docs/analytics.md): which pages are counted,
 * which link is which kind of click, and the UTM tags. No directive: the
 * check script imports it under Node.
 */

/** Never counted: the console, the portal, the API, and every page a secret addresses. Mirrors Collector::EXCLUDED. */
export const NEVER = ["/admin", "/portal", "/api", "/_next", "/order/", "/newsletter/unsubscribe/", "/newsletter/rejoin/",
  "/store/notify/cancel/", "/meeting/", "/visit/", "/ticket-survey/", "/events/registration/", "/preview/"];

export function collectable(path: string): boolean {
  return !NEVER.some((p) => path === p.replace(/\/$/, "") || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

const FILES = /\.(pdf|zip|docx?|xlsx?|pptx?|csv|txt|dmg|exe|msi|apk|bin|iso|tar|gz|rar|7z)$/i;

export function linkKind(href: string, origin: string): "outbound" | "download" | "contact" | null {
  if (/^(tel|mailto):/i.test(href)) return "contact";
  let url: URL;
  try { url = new URL(href, origin); } catch { return null; }
  if (/(^|\.)wa\.me$|(^|\.)whatsapp\.com$/i.test(url.hostname)) return "contact";
  const own = new URL(origin).hostname.replace(/^www\./, "");
  if (url.hostname.replace(/^www\./, "") !== own) return url.protocol.startsWith("http") ? "outbound" : null;
  if (url.pathname.startsWith("/api/downloads/") || FILES.test(url.pathname)) return "download";
  return null;
}

export function utmFrom(search: string): { source?: string; medium?: string; campaign?: string } {
  const q = new URLSearchParams(search);
  const out: { source?: string; medium?: string; campaign?: string } = {};
  for (const k of ["source", "medium", "campaign"] as const) {
    const v = q.get(`utm_${k}`)?.trim();
    if (v) out[k] = v.slice(0, 100);
  }
  return out;
}
```

Run the check → `all passed`.

- [ ] **Step 3: The beacon, the route handler and the forwarded agent**

`components/layout/analytics-beacon.tsx`:

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { collectable, linkKind, utmFrom } from "@/lib/analytics-beacon";

/**
 * Native analytics' beacon (C3, docs/analytics.md): one sendBeacon per page
 * view — the first load and every App Router navigation — and one per click
 * on another site, a download, a phone, email or WhatsApp link. No cookie, no
 * storage. Silent for DNT/GPC and for a browser holding the staff cookie
 * (the layout decides that and passes `enabled`).
 */
export function AnalyticsBeacon({ enabled }: { enabled: boolean }) {
  const path = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (!enabled || !path || !collectable(path)) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    const send = (body: Record<string, unknown>) => navigator.sendBeacon?.("/api/collect", JSON.stringify(body));
    send({
      k: "pageview",
      p: path,
      r: first.current ? document.referrer : "",
      u: first.current ? utmFrom(location.search) : {},
      w: window.innerWidth,
    });
    first.current = false;
  }, [enabled, path]);

  useEffect(() => {
    if (!enabled) return;
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (nav.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !collectable(location.pathname)) return;
      const kind = a.hasAttribute("download") ? "download" : linkKind(a.getAttribute("href") ?? "", location.origin);
      if (kind) navigator.sendBeacon?.("/api/collect", JSON.stringify({ k: kind, p: location.pathname, t: a.href }));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled]);

  return null;
}
```

`app/api/collect/route.ts`:

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { API_BASE } from "@/lib/api"; // use the base the module already exports (read lib/api.ts)
import { ADMIN_COOKIE } from "@/lib/admin-cookie";
import { clientIpHeaders } from "@/lib/client-ip";

/**
 * The beacon's door (C3, docs/analytics.md): forwards the body, the visitor's
 * address and browser to the API, and answers 204 whatever happens, within
 * two seconds — a beacon has nobody to tell. A staff browser is not counted.
 */
export async function POST(request: Request) {
  const body = (await request.text()).slice(0, 2048);
  const staff = (await cookies()).has(ADMIN_COOKIE);
  const gpc = request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1";
  if (!staff && !gpc && body) {
    try {
      await fetch(`${API_BASE}/api/v1/collect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(await clientIpHeaders()) },
        body,
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
    } catch {
      // Nobody to tell.
    }
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
```

`lib/client-ip.ts` — `clientIpHeaders()` also returns `"X-Visitor-Agent": incoming.get("user-agent")` when present (one line, beside `X-Forwarded-For`; the header is believed by the API only from `TRUSTED_PROXIES`, like the address).

`(marketing)/layout.tsx` — beside `<Analytics settings={settings} />`: `<AnalyticsBeacon enabled={settingEnabled(settings.native_analytics_enabled) && !staffSignedIn} />`, where `staffSignedIn` is read the way the layout already reads the staff cookie for the coming-soon curtain — if the layout does not read cookies (it must not: the marketing pages are ISR), pass `enabled` from the setting only and let the route handler drop staff hits (it already does). Do **not** read `cookies()` in the layout.

- [ ] **Step 4: Verify**

Run (from `web/`): `node --experimental-strip-types scripts/analytics-beacon.check.mjs` → all passed; `npx tsc --noEmit` → 0; `npm run lint` → 0. With the API and `npm run dev` up, open `/` and `/about` in a fresh browser (not signed in) and check `SELECT kind, path, channel FROM analytics_hits ORDER BY id DESC LIMIT 3` in MySQL (through `php artisan tinker --execute=…`): two page views, the second keeping the first's channel. Then sign in to the console in the same browser and load `/` — no new row.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/analytics-beacon.ts web/scripts/analytics-beacon.check.mjs web/src/components/layout/analytics-beacon.tsx web/src/app/api/collect web/src/lib/client-ip.ts "web/src/app/(marketing)/layout.tsx"
git commit -m "Analytics: the beacon and its route handler"
```

---

### Task 7: The Analytics screen and the other screens' panels

**Files:**
- Create: `web/src/types/analytics.ts`, `web/src/lib/admin/analytics.ts`, `web/src/app/admin/(app)/analytics/page.tsx`, `web/src/app/admin/(app)/analytics/analytics-period.tsx`, `web/src/app/admin/(app)/analytics/now-tile.tsx`, `web/src/app/api/admin/analytics/now/route.ts`, `web/src/app/api/admin/analytics/export/route.ts`
- Modify: `web/src/app/admin/(app)/nav-items.tsx` (a row under Site), `api/app/Support/Notifications/ScreenAccess.php` (the same row — `AdminNavRolesTest` fails until both agree), the store dashboard page (the funnel's `views_source` line), the leads list page (a "Where enquiries came from" panel for sales), `web/src/lib/dashboard-view.ts` (`WIDGETS` gains `traffic`, default hidden) and the dashboard page, `web/src/app/admin/(app)/settings/settings-copy.ts` (`native_analytics_enabled`, the `native_analytics` group on Settings → Infrastructure), `web/src/lib/admin/index.ts`

**Interfaces:**
- Consumes: Task 5's API.
- Produces: types `AnalyticsSummary`, `AnalyticsBreakdownRow`, `AnalyticsSearch`, `AnalyticsNow`; `getAnalyticsSummary(range)`, `getAnalyticsBreakdown(dimension, range, kind?, limit?)`, `getAnalyticsSearch(range, scope)`, `getLeadSources(range)`.

The screen (`/admin/analytics`, server component, `await requireScreen()` first):
- `PageHeader` "Analytics" with an intro sentence: "Visits counted by this site itself, without cookies. Figures for today update as visitors arrive; earlier days are final."
- `AnalyticsPeriod` (client): links, not state — `?period=7|30|90|month|last-month` and `?compare=previous|year|none`, so the page stays server-rendered; a custom range is two date inputs submitting the same query.
- When `meta.enabled` is false: an `Alert tone="info" dismissible={false}` "Native analytics is switched off. Switch it on in Settings → Infrastructure." and nothing else.
- Tiles (`StatTile`): Visits, Page views, Views per visit, Bounce rate, Conversions, Revenue (paise through `formatPaise`), each with its change.
- `AreaChart`: views and visits by day with `previous` for the comparison.
- `BarList` panels in a two-column grid: Top pages, Entry pages, Channels, Sources, Campaigns, Devices, Browsers, Countries, Conversions by channel, Searches (terms), Searches that found nothing, Links to other sites, Downloads, Calls/emails/WhatsApp. Each panel heading has a "CSV" plain `<a download>` to `/api/admin/analytics/export?dimension=…` (a route handler — never `next/link`, which would prefetch it).
- `NowTile` (client): polls `/api/admin/analytics/now` once a minute while visible; null-safe (no number on failure).
- Empty data: each panel's `BarList` `empty` text "Nothing yet in this period."

Nav row (Site group, after Themes): `{ role: "admin,seo_manager,content_manager", href: "/admin/analytics", label: "Analytics", icon: IconChart }` — add `['/admin/analytics', 'admin,seo_manager,content_manager', false]` to `ScreenAccess::ROWS` in the same position.

- [ ] **Step 1: Write the failing check**

Run: `php artisan test --filter=AdminNavRolesTest` after adding the nav row but **before** the `ScreenAccess` row.
Expected: FAIL naming `/admin/analytics`. Then add the `ScreenAccess` row and re-run → PASS.

- [ ] **Step 2: Build the screen, the panels and the settings copy**

Write the files above. Use `formatDate` / `relativeTime` from `lib/dates.ts` for any date, `formatPaise` for money, and the API's labels everywhere else.

- [ ] **Step 3: Verify**

Run (from `web/`): `npx tsc --noEmit` → 0; `npm run lint` → 0. In the browser as an SEO manager: `/admin/analytics` shows the tiles and panels from the hits Task 6 recorded; switching the period changes the URL and the figures; a support engineer gets a 404 for the screen and no sidebar row; the store dashboard says "Product views counted by this site"; a sales manager sees "Where enquiries came from" on Leads.

- [ ] **Step 4: Commit**

```bash
git add web/src/types/analytics.ts web/src/lib/admin "web/src/app/admin/(app)" web/src/app/api/admin/analytics web/src/lib/dashboard-view.ts api/app/Support/Notifications/ScreenAccess.php
git commit -m "Console: the Analytics screen, and native figures on the store, leads and dashboard"
```

---

### Task 8: Mock, probe, audits, docs, manual and the release

**Files:**
- Modify: `web/mock-api.mjs`, `web/scripts/audit.mjs` and `web/scripts/mobile-audit.mjs` (add `/admin/analytics` to the console route lists), `web/src/lib/help-routes.ts`, `CLAUDE.md`, `API.md`, `manual/00-README.md`, `web/src/content/help.json` (regenerated), `VERSION.md`, `web/src/lib/version.ts`, `api/database/seeders/PageSeeder.php` (the privacy placeholder gains a "How we count visits" paragraph)
- Create: `web/scripts/probes/native-analytics.mjs`, `docs/analytics.md`, `manual/38-analytics.md`

- [ ] **Step 1: The mock**

In `web/mock-api.mjs`: `POST /collect` → 204; `GET /admin/analytics/summary` → a fixed 30-day summary (views 1,240, visits 610, …, a `series` of 30 days, `meta.enabled: true`); `/breakdown` → five rows for any dimension; `/search` → three terms and one in `nothing`; `/now` → `{views: 4, pages: [...]}`; `/export` → a two-line CSV; `/admin/leads/sources` → three channels; and `native_analytics_enabled: "1"` in the public settings map.

- [ ] **Step 2: The probe and the audits**

`web/scripts/probes/native-analytics.mjs` (docblock: what it measures, `BASE`, `API`; signs in only through `ADMIN_LOGIN_EMAIL`/`ADMIN_LOGIN_PASSWORD`, creates a throwaway SEO manager through `POST /admin/staff` and deletes it at the end):
1. In a fresh context (not signed in) open `/`, navigate in-site to `/about` and `/contact`, press an outbound link (or `page.evaluate` a click on an injected `<a href="https://example.com">`), and run a site search for `zzqqxx`.
2. Sign the SEO manager in, in another context; open `/admin/analytics?period=7`; assert the Visits tile reads at least 1, Top pages lists `/about`, and "Searches that found nothing" lists `zzqqxx`.
3. In the SEO manager's context open `/` — then assert, through the API, that no new hit was written for that load (count before/after).
Exit non-zero on any failure; close the browser before deleting the account.

Run (with the API and `npm run dev` up, credentials set):
- `MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/analytics /admin/store /admin/leads /` → exit 0
- `MSYS_NO_PATHCONV=1 node scripts/mobile-audit.mjs /admin/analytics` → exit 0
- `AUDIT_SCHEME=dark MSYS_NO_PATHCONV=1 node scripts/audit.mjs /admin/analytics` → exit 0
- `node scripts/probes/native-analytics.mjs` → exit 0

- [ ] **Step 3: Docs, manual, help, version**

- `docs/analytics.md`: the module note — what is counted and what never is; the visitor hash and why it needs no consent; the entry-source rule; search and conversions where they happen and the attribution order; the rollup and the prune; `Report` and today's merge; the console's figures and the GA4 fallback; the country table, its licence and `php scripts/build-geo.php`; the switches.
- `CLAUDE.md`: `### Native analytics — docs/analytics.md`, one line per rule, and the Contents entry.
- `API.md`: an "Analytics" section — `POST /collect`, the six admin routes and their shapes, `leads/sources`, the funnel's `views_source`, the SEO overview's `meta.analytics.source`, the settings.
- `manual/38-analytics.md` (plain words): reading the screen, what a visit is and why it resets at midnight, what is never counted, switching it off, excluding the office, GA4 alongside; the db-ip credit. Row in `manual/00-README.md`. `npm run help`; help-routes entry for `/admin/analytics`; `help-routes.check.mjs` and `build-help.mjs --check` pass.
- `VERSION.md`: 0.188.0 — 2026-10-21; `web/src/lib/version.ts` → `0.188.0`.

- [ ] **Step 4: The whole-suite gate**

From `api/`: `php artisan test > ../.superpowers/c3-suite.txt 2>&1; tail -5 ../.superpowers/c3-suite.txt` → 0 failed; `composer analyse` → "No errors"; `./vendor/bin/pint --test` on the touched files → clean. From `web/`: `npx tsc --noEmit` → 0; `npm run lint` → 0; `node --experimental-strip-types scripts/analytics-beacon.check.mjs` → all passed.

- [ ] **Step 5: Commit**

```bash
git add web/mock-api.mjs web/scripts docs/analytics.md manual CLAUDE.md API.md web/src/lib/help-routes.ts web/src/content/help.json VERSION.md web/src/lib/version.ts api/database/seeders/PageSeeder.php
git commit -m "0.188.0: cookieless native analytics"
```

---

## Self-review notes

- Spec coverage: beacon and exclusions → Task 6; route handler and the forwarded agent → Task 6; `POST /collect`, visitor, bots, device/browser/OS, country, source/channel → Tasks 1–2; search terms and conversions with attribution order → Task 3; storage, rollup, prune, report and today's merge → Task 4; staff API, store funnel, SEO overview, leads sources → Task 5; the console screen, nav, dashboard widget, settings → Task 7; privacy paragraph, docs, manual, mock, probe, audits, version → Task 8.
- Decisions taken while planning: (1) the console's own figures fall back to GA4 only when native is switched off, never side by side in one column; (2) a phone, email or WhatsApp link is stored as its kind (`tel`, `mailto`, `whatsapp`), never the number or address; (3) the search list reads raw hits, so it covers the last 90 days whatever range is chosen, and says so; (4) the marketing layout never reads a cookie (ISR) — the route handler drops staff hits; (5) conversions made by a command or a worker (a webhook-settled payment, an emailed ticket) are recorded with no visitor attribution; (6) the country table is committed as two packed binaries rebuilt by a script.
- Types: `Collector::record`, `Conversions::record/search`, `Rollup::rows/day`, `Report::summary/series/breakdown/search/now/pages/productViews`, `Labels::of`, `Kinds::*`, `collectable/linkKind/utmFrom` — each defined in its producing task with the same name.
