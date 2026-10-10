<?php

namespace App\Support\System;

use App\Models\Media;
use App\Models\Setting;
use App\Support\MediaUrl;
use App\Support\QueueHealth;
use Composer\Autoload\ClassLoader;
use Illuminate\Support\Facades\DB;

/**
 * What on this install is slowing the site down, in words an owner can act on
 * (System → Status, "Speed"; docs/distribution.md "Speed suggestions").
 *
 * The `SchedulerSetup` rule again: every answer comes from the server that is
 * answering, and where the host does not let us look the answer is `unknown`
 * — "could not check" — never a guess dressed as a result. That is why every
 * check runs inside its own `try`: a host that disables `opcache_get_status`
 * or `proc_open` must cost one row on the screen, not the screen.
 *
 * Nothing here makes a network call (the website's health call is the status
 * endpoint's own, and only its timing is read) and nothing it prints is a
 * secret or a filesystem path: a snippet is a generic line, not this
 * server's `.env`.
 *
 * `state` is `good`, `attention`, `unknown` or `info` — a fact with nothing to
 * fix. The summary counts the first three; `info` is not a verdict.
 */
final class SpeedChecks
{
    /** Below this a framework that has to be compiled on every request is the first thing to fix (per-request PHP compile). */
    public const MEMORY_FREE_MIN_PERCENT = 10;

    /** OPcache cannot hold more scripts than its table has slots; this near the end is "nearly full". */
    public const FILES_NEAR_FULL_PERCENT = 90;

    /** A query against an idle local MySQL takes a fraction of a millisecond; this is "same machine". */
    public const DB_GOOD_MS = 5.0;

    /** Beyond this every page's handful of queries adds a visible delay. */
    public const DB_INFO_MS = 25.0;

    /** PHP's own default, 4M: a framework's file lookups no longer fit below it. */
    public const REALPATH_CACHE_MIN_BYTES = 4 * 1024 * 1024;

    /** A class map this large means `composer dump-autoload -o` ran; an unoptimised one holds a few hundred. */
    public const CLASSMAP_MIN = 1500;

    /** The website shrinks pictures for visitors, but the original is read on the first view of each size. */
    public const IMAGE_MAX_BYTES = 1_572_864;

    /** The widest variant the website produces is 2560px; anything wider is never shown. */
    public const IMAGE_MAX_WIDTH = 2560;

    /** Every third-party script is downloaded by every visitor who agrees to it. */
    public const THIRD_PARTY_ATTENTION = 4;

    /** @var array<string, mixed>|null OPcache's figures, read once per run. */
    private static ?array $opcache = null;

    /** @var float|null|false The database timing, read once per run; false until it has been. */
    private static float|null|false $databaseMs = false;

    /**
     * @param  array<string, array{0: string, 1: string, 2: callable(): ?array<string, mixed>, 3?: string}>  $extra  Further checks, `key => [group, impact, callable, label]` — the seam a test uses to prove that a probe which throws is reported `unknown`.
     * @return array{measured: array{boot_ms: ?int, db_ms: ?float, website_ms: ?int}, summary: array{good: int, attention: int, unknown: int}, checks: list<array{key: string, group: string, impact: string, state: string, label: string, detail: string, fix: string, snippet: ?string}>}
     */
    public static function run(?int $bootMs = null, ?int $websiteMs = null, array $extra = []): array
    {
        self::$opcache = null;
        self::$databaseMs = false;

        $checks = [];

        foreach (self::definitions() + $extra as $key => $def) {
            [$group, $impact, $probe] = $def;
            $label = $def[3] ?? self::LABELS[$key] ?? $key;

            try {
                $result = $probe();
            } catch (\Throwable) {
                $result = self::unknown('This could not be checked on this server.', 'The hosting does not let the website look at this. Ask your host, or leave it.');
            }

            if ($result === null) {
                continue;   // Does not apply here (OPcache off, so its memory is moot).
            }

            $checks[] = ['key' => $key, 'group' => $group, 'impact' => $impact, 'label' => $label] + $result + ['snippet' => null];
        }

        $summary = ['good' => 0, 'attention' => 0, 'unknown' => 0];

        foreach ($checks as $check) {
            if (isset($summary[$check['state']])) {
                $summary[$check['state']]++;
            }
        }

        return [
            'measured' => [
                'boot_ms' => $bootMs,
                'db_ms' => self::databaseMs(),
                'website_ms' => $websiteMs,
            ],
            'summary' => $summary,
            'checks' => $checks,
        ];
    }

    /** Milliseconds since the request began, or null where the entry point did not say. */
    public static function bootMs(): ?int
    {
        return defined('LARAVEL_START') ? (int) round((microtime(true) - LARAVEL_START) * 1000) : null;
    }

    private const LABELS = [
        'opcache' => 'OPcache is switched on',
        'opcache_memory' => 'OPcache has room for the whole application',
        'opcache_timestamps' => 'PHP checks files for changes on every request',
        'xdebug' => 'The Xdebug debugger is off',
        'optimize' => 'Configuration and routes are cached',
        'debug' => 'Debug mode is off',
        'cache_store' => 'The cache is kept in files or memory',
        'queue' => 'Mail and background jobs are not made to wait',
        'log_level' => 'The log records warnings, not every request',
        'autoloader' => 'The class loader is optimised',
        'database' => 'The database answers quickly',
        'realpath_cache' => 'PHP remembers where its files are',
        'php_version' => 'PHP version',
        'media_cdn' => 'A CDN serves videos and documents',
        'large_images' => 'Pictures in the library are a sensible size',
        'third_party' => 'Third-party scripts on the public site',
        'splash' => 'The first-visit splash',
    ];

    /**
     * The checks in the order they are shown: high impact first.
     *
     * @return array<string, array{0: string, 1: string, 2: \Closure(): ?array<string, mixed>}>
     */
    private static function definitions(): array
    {
        return [
            'opcache' => ['server', 'high', self::opcache(...)],
            'opcache_memory' => ['server', 'medium', self::opcacheMemory(...)],
            'opcache_timestamps' => ['server', 'low', self::opcacheTimestamps(...)],
            'xdebug' => ['server', 'high', self::xdebug(...)],
            'optimize' => ['app', 'high', self::optimize(...)],
            'debug' => ['app', 'high', self::debug(...)],
            'cache_store' => ['app', 'medium', self::cacheStore(...)],
            'queue' => ['app', 'medium', self::queue(...)],
            'log_level' => ['app', 'low', self::logLevel(...)],
            'autoloader' => ['app', 'low', self::autoloader(...)],
            'database' => ['server', 'medium', self::database(...)],
            'realpath_cache' => ['server', 'low', self::realpathCache(...)],
            'php_version' => ['server', 'low', self::phpVersion(...)],
            'media_cdn' => ['content', 'medium', self::mediaCdn(...)],
            'large_images' => ['content', 'medium', self::largeImages(...)],
            'third_party' => ['content', 'medium', self::thirdParty(...)],
            'splash' => ['content', 'low', self::splash(...)],
        ];
    }

    // ── Server ──────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function opcache(): array
    {
        $where = self::phpIniWhere();

        if (! extension_loaded('Zend OPcache')) {
            return self::attention(
                'OPcache is not installed on this PHP, so PHP reads and compiles the whole application again on every single request.',
                "Switch the \"opcache\" extension on in the PHP settings for this domain ({$where}).",
                'zend_extension=opcache',
            );
        }

        $enabled = filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN)
            && (PHP_SAPI !== 'cli' || filter_var(ini_get('opcache.enable_cli'), FILTER_VALIDATE_BOOLEAN));

        if (! $enabled) {
            return self::attention(
                'OPcache is switched off, so PHP reads and compiles the whole application again on every single request.',
                "Switch it on in the PHP settings for this domain ({$where}), then save.",
                'opcache.enable=1',
            );
        }

        $status = self::opcacheStatus();

        if ($status === null) {
            return self::unknown(
                'OPcache is switched on, but this server does not let the website read its figures.',
                'Nothing to do unless the site feels slow; your host can confirm it is working.',
            );
        }

        if (! ($status['opcache_enabled'] ?? false)) {
            return self::attention(
                'OPcache is installed but not running (it was switched on after PHP started, or it ran out of memory and stopped).',
                'Restart PHP for this domain from the hosting panel.',
            );
        }

        $stats = $status['opcache_statistics'] ?? [];
        $detail = 'OPcache is on';

        if (isset($stats['opcache_hit_rate'])) {
            $detail .= sprintf(' and %s%% of requests for a file are answered from it', number_format((float) $stats['opcache_hit_rate'], 1));
        }

        return self::good($detail.'.');
    }

    /** @return ?array<string, mixed> */
    private static function opcacheMemory(): ?array
    {
        $status = self::opcacheStatus();

        if ($status === null || ! ($status['opcache_enabled'] ?? false)) {
            return null;
        }

        $memory = $status['memory_usage'] ?? [];
        $total = (float) (($memory['used_memory'] ?? 0) + ($memory['free_memory'] ?? 0) + ($memory['wasted_memory'] ?? 0));
        $freePercent = $total > 0 ? (float) ($memory['free_memory'] ?? 0) / $total * 100 : null;
        $stats = $status['opcache_statistics'] ?? [];
        $slots = (int) ($stats['max_cached_keys'] ?? 0);
        $cached = (int) ($stats['num_cached_scripts'] ?? 0);
        $mb = (int) ini_get('opcache.memory_consumption');

        if (($status['cache_full'] ?? false) || ($freePercent !== null && $freePercent < self::MEMORY_FREE_MIN_PERCENT)) {
            return self::attention(
                'OPcache\'s memory is '.($freePercent === null ? 'full' : 'almost full ('.number_format($freePercent, 1).'% free)')
                    .', so some files are compiled again on every request.',
                'Give OPcache more memory in the PHP settings for this domain, then restart PHP.',
                'opcache.memory_consumption='.max(256, $mb * 2),
            );
        }

        if ($slots > 0 && $cached / $slots * 100 >= self::FILES_NEAR_FULL_PERCENT) {
            return self::attention(
                "OPcache holds {$cached} of the {$slots} files it has room for, so new files will soon push others out.",
                'Raise the number of files OPcache may hold in the PHP settings for this domain, then restart PHP.',
                'opcache.max_accelerated_files=20000',
            );
        }

        return self::good($freePercent === null ? 'OPcache has room to spare.' : 'OPcache has room to spare ('.number_format($freePercent, 0).'% of its memory is free).');
    }

    /** @return ?array<string, mixed> */
    private static function opcacheTimestamps(): ?array
    {
        if (! extension_loaded('Zend OPcache') || ! filter_var(ini_get('opcache.enable'), FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }

        if (! filter_var(ini_get('opcache.validate_timestamps'), FILTER_VALIDATE_BOOLEAN)) {
            return self::good('PHP does not look for changed files on each request. After an update, restart PHP for this domain so it notices the new code.');
        }

        return self::info(
            'PHP looks at every file on each request to see whether it changed, which costs a little time.',
            'You can leave it. Switching it off is a little faster, but then PHP has to be restarted from the hosting panel after every update.',
            'opcache.validate_timestamps=0',
        );
    }

    /** @return array<string, mixed> */
    private static function xdebug(): array
    {
        if (extension_loaded('xdebug')) {
            return self::attention(
                'The Xdebug debugger is loaded. It is a tool for developers and makes every page several times slower.',
                'Remove it, or switch it off, in the PHP settings for this domain and restart PHP.',
                'xdebug.mode=off',
            );
        }

        return self::good('The Xdebug debugger is not loaded.');
    }

    /** @return array<string, mixed> */
    private static function database(): array
    {
        $ms = self::databaseMs();

        if ($ms === null) {
            return self::unknown('The database could not be timed.', 'If the site works, there is nothing to do.');
        }

        $shown = number_format($ms, $ms < 10 ? 1 : 0).' ms';

        if ($ms <= self::DB_GOOD_MS) {
            return self::good("A simple database question is answered in {$shown}.");
        }

        if ($ms <= self::DB_INFO_MS) {
            return self::info(
                "A simple database question takes {$shown}. That is fine, but a database on the same machine answers in under 5 ms.",
                '',
            );
        }

        return self::attention(
            "A simple database question takes {$shown}, and every page asks several. The database is on another machine, or busy.",
            'Ask your host whether the database can be on the same server as the site, or whether it is overloaded.',
        );
    }

    /** @return array<string, mixed> */
    private static function realpathCache(): array
    {
        $bytes = self::bytes((string) ini_get('realpath_cache_size'));

        if ($bytes < self::REALPATH_CACHE_MIN_BYTES) {
            return self::attention(
                'PHP\'s file-location memory is only '.self::megabytes($bytes).' MB, which a framework with this many files outgrows.',
                'Raise it in the PHP settings for this domain, then restart PHP.',
                'realpath_cache_size=4096K',
            );
        }

        return self::good('PHP\'s file-location memory is '.self::megabytes($bytes).' MB.');
    }

    /** @return array<string, mixed> */
    private static function phpVersion(): array
    {
        if (version_compare(PHP_VERSION, Requirements::PHP_MIN, '<')) {
            return self::attention(
                'This server runs PHP '.PHP_VERSION.', which is older than the '.Requirements::PHP_MIN.' this product needs.',
                'Choose PHP 8.3 or newer for this domain in the hosting panel.',
            );
        }

        if (version_compare(PHP_VERSION, '8.4.0', '>=')) {
            return self::good('This server runs PHP '.PHP_VERSION.', which is a current version.');
        }

        return self::info('This server runs PHP '.PHP_VERSION.'. PHP 8.4 is a little faster.', 'If your host offers PHP 8.4 for this domain, you can choose it in the hosting panel.');
    }

    // ── Application ─────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function optimize(): array
    {
        $config = app()->configurationIsCached();
        $routes = app()->routesAreCached();

        if ($config && $routes) {
            return self::good('The settings files and the route list are read from one prepared file each.');
        }

        $missing = match (true) {
            ! $config && ! $routes => 'the configuration and the routes',
            ! $config => 'the configuration',
            default => 'the routes',
        };

        if (config('app.env') === 'local') {
            return self::info(
                "This is a development install, so {$missing} are read from many files on every request.",
                'On a live site run the command below once from the API folder.',
                'php artisan optimize',
            );
        }

        return self::attention(
            "The application has not prepared {$missing}, so it reads and works them out again on every request.",
            'Run this once from the API folder — the Apply step of any update on System → Updates does it for you too.',
            'php artisan optimize',
        );
    }

    /** @return array<string, mixed> */
    private static function debug(): array
    {
        if (config('app.debug') && config('app.env') !== 'local') {
            return self::attention(
                'Debug mode is on. It slows every request, and it can show visitors technical details they should not see.',
                'Set it to false in the API\'s environment file (.env) and reload the site.',
                'APP_DEBUG=false',
            );
        }

        return self::good('Debug mode is off.');
    }

    /** @return array<string, mixed> */
    private static function cacheStore(): array
    {
        $store = (string) config('cache.default');

        return match ($store) {
            'database' => self::attention(
                'The cache is kept in the database, so every setting read is a database question on every page.',
                'Keep it in files instead, in the API\'s environment file (.env); the queue worker and the website share the same folder.',
                'CACHE_STORE=file',
            ),
            'array' => self::attention(
                'The cache forgets everything at the end of each request, so it saves nothing.',
                'Keep it in files instead, in the API\'s environment file (.env).',
                'CACHE_STORE=file',
            ),
            'file', 'redis', 'memcached', 'apc', 'octane' => self::good("The cache is kept in {$store} storage."),
            default => self::info("The cache store is \"{$store}\".", ''),
        };
    }

    /** @return array<string, mixed> */
    private static function queue(): array
    {
        if (config('queue.default') === 'sync') {
            return self::attention(
                'Mail and other background jobs are run while the visitor waits, because the queue is set to run them at once.',
                'Keep the queue in the database, in the API\'s environment file (.env), and make sure the scheduler below is running.',
                'QUEUE_CONNECTION=database',
            );
        }

        if (QueueHealth::delivering()) {
            return self::good('Mail and background jobs are picked up by the scheduler, away from the visitor.');
        }

        return self::attention(
            'Mail and background jobs are waiting for the scheduler, and it is not running, so they are not being done.',
            'Add the scheduler\'s one cron line — the steps are under "The scheduler" on this page (#scheduler).',
        );
    }

    /** @return array<string, mixed> */
    private static function logLevel(): array
    {
        $channel = (string) config('logging.default');

        if ($channel === 'stack') {
            $channel = (string) (config('logging.channels.stack.channels')[0] ?? 'single');
        }

        $level = strtolower((string) (config("logging.channels.{$channel}.level") ?? 'debug'));

        if (in_array($level, ['debug', 'info'], true) && config('app.env') !== 'local') {
            return self::attention(
                "The log is set to record everything ({$level}), so it writes to disk on every request and grows without limit.",
                'Record warnings only, in the API\'s environment file (.env).',
                'LOG_LEVEL=warning',
            );
        }

        return self::good("The log records {$level} and above.");
    }

    /** @return array<string, mixed> */
    private static function autoloader(): array
    {
        $count = self::classMapSize();

        if ($count === null) {
            return self::unknown('The class loader could not be inspected on this server.', '');
        }

        if ($count >= self::CLASSMAP_MIN) {
            return self::good("The class loader is optimised ({$count} classes listed ahead of time).");
        }

        if (self::installed()) {
            return self::attention(
                "The class loader lists only {$count} classes ahead of time. A release is built with it optimised, so something replaced the vendor folder.",
                'Apply the release again from System → Updates, or run the command below from the API folder.',
                'composer install --no-dev --optimize-autoloader',
            );
        }

        return self::attention(
            "The class loader lists only {$count} classes ahead of time, so PHP searches the disk for each class the first time it is needed.",
            'Run the command below from the API folder.',
            'composer install --no-dev --optimize-autoloader',
        );
    }

    // ── Content ─────────────────────────────────────────────────────────

    /** @return array<string, mixed> */
    private static function mediaCdn(): array
    {
        if (MediaUrl::cdn() !== null) {
            return self::good('Videos, documents and vector logos are served from your CDN.');
        }

        return self::info(
            'Videos, documents and vector logos are served from this server. A CDN is optional, and helps most when visitors are far from it.',
            'See Settings → Media settings → CDN, and the manual\'s chapter on using a CDN.',
        );
    }

    /** @return array<string, mixed> */
    private static function largeImages(): array
    {
        $oversized = fn () => Media::query()
            ->where('mime', 'like', 'image/%')
            ->where('mime', '!=', 'image/svg+xml')
            ->where(fn ($q) => $q->where('size', '>', self::IMAGE_MAX_BYTES)->orWhere('width', '>', self::IMAGE_MAX_WIDTH));

        $count = $oversized()->count();

        if ($count === 0) {
            return self::good('No picture in the media library is over 1.5 MB or wider than 2560 pixels.');
        }

        $biggest = $oversized()->orderByDesc('size')->orderBy('id')->limit(3)->get(['filename', 'size'])
            ->map(fn (Media $m) => $m->filename.' ('.self::megabytes((int) $m->size, 1).' MB)')
            ->implode(', ');

        return self::attention(
            ($count === 1 ? '1 picture is' : "{$count} pictures are").' over 1.5 MB or wider than 2560 pixels — the largest: '.$biggest
                .'. The website shrinks pictures for visitors, but a heavy original makes the first view of each page slower.',
            'In Media, open the picture, press Edit and choose Resize — 2000 pixels wide is plenty for any page.',
        );
    }

    /** @return array<string, mixed> */
    private static function thirdParty(): array
    {
        $found = [];

        foreach ([
            'google_analytics_id' => 'Google Analytics',
            'google_tag_manager_id' => 'Google Tag Manager',
            'meta_pixel_id' => 'Meta Pixel',
            'reviews_embed' => 'the reviews widget',
            'body_code' => 'your own code snippet',
        ] as $key => $name) {
            if (trim((string) Setting::get($key, '')) !== '') {
                $found[] = $name;
            }
        }

        if ($found === []) {
            return self::good('The public site loads no third-party scripts of its own.');
        }

        $list = implode(', ', $found);

        if (count($found) >= self::THIRD_PARTY_ATTENTION) {
            return self::attention(
                count($found)." outside scripts are set up ({$list}). Each one is downloaded by every visitor and slows the page down.",
                'Remove the ones you no longer look at, under Settings → Analytics and Settings → Embeds.',
            );
        }

        return self::info(
            count($found).' outside script'.(count($found) === 1 ? ' is' : 's are')." set up: {$list}. Each one is downloaded by every visitor who agrees to it.",
            'Keep only the ones you look at.',
        );
    }

    /** @return ?array<string, mixed> */
    private static function splash(): ?array
    {
        if (! filter_var((string) Setting::get('motion_splash', '0'), FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }

        return self::info(
            'The first-visit splash is on. It delays the very first view of the site for a new visitor, by design.',
            'Switch it off under Settings → Motion if speed matters more than the opening effect.',
        );
    }

    // ── Helpers ─────────────────────────────────────────────────────────

    /** OPcache's figures, or null where the host will not say. */
    private static function opcacheStatus(): ?array
    {
        if (self::$opcache === null) {
            $status = function_exists('opcache_get_status') ? @opcache_get_status(false) : false;
            self::$opcache = is_array($status) ? $status : [];
        }

        return self::$opcache === [] ? null : self::$opcache;
    }

    /**
     * The median of three `select 1` round trips, in milliseconds, timed once
     * per run. The connection is opened first and not counted: a page pays
     * for that once, and what repeats is the question.
     */
    private static function databaseMs(): ?float
    {
        if (self::$databaseMs === false) {
            try {
                DB::connection()->getPdo();
                $times = [];

                for ($i = 0; $i < 3; $i++) {
                    $started = microtime(true);
                    DB::select('select 1');
                    $times[] = (microtime(true) - $started) * 1000;
                }

                sort($times);
                self::$databaseMs = round($times[1], 1);
            } catch (\Throwable) {
                self::$databaseMs = null;
            }
        }

        return self::$databaseMs;
    }

    private static function classMapSize(): ?int
    {
        if (! class_exists(ClassLoader::class)) {
            return null;
        }

        $loaders = ClassLoader::getRegisteredLoaders();
        $vendor = realpath(base_path('vendor'));
        $loader = ($vendor !== false ? $loaders[$vendor] ?? null : null) ?? ($loaders === [] ? null : reset($loaders));

        return $loader === null ? null : count($loader->getClassMap());
    }

    private static function installed(): bool
    {
        $home = require base_path('bootstrap/home.php');

        return is_string($home) && is_file($home.'/config/install.json');
    }

    /** Where PHP's settings live on this host, in the words of its panel. */
    private static function phpIniWhere(): string
    {
        return match (SchedulerSetup::panel(PHP_BINARY)) {
            'plesk' => 'Plesk: Websites & Domains → PHP Settings',
            'cpanel' => 'cPanel: Select PHP Version → Options',
            default => 'the php.ini file, or your host\'s PHP settings',
        };
    }

    /** php.ini shorthand ("4096K", "128M", "1G") as bytes. */
    private static function bytes(string $value): int
    {
        $value = trim($value);
        $number = (float) $value;

        return (int) match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 ** 3,
            'm' => $number * 1024 ** 2,
            'k' => $number * 1024,
            default => $number,
        };
    }

    private static function megabytes(int $bytes, int $decimals = 0): string
    {
        return number_format($bytes / 1024 ** 2, $decimals);
    }

    /** @return array{state: string, detail: string, fix: string, snippet: ?string} */
    private static function result(string $state, string $detail, string $fix = '', ?string $snippet = null): array
    {
        return ['state' => $state, 'detail' => $detail, 'fix' => $fix, 'snippet' => $snippet];
    }

    /** @return array{state: string, detail: string, fix: string, snippet: ?string} */
    private static function good(string $detail): array
    {
        return self::result('good', $detail);
    }

    /** @return array{state: string, detail: string, fix: string, snippet: ?string} */
    private static function attention(string $detail, string $fix, ?string $snippet = null): array
    {
        return self::result('attention', $detail, $fix, $snippet);
    }

    /** @return array{state: string, detail: string, fix: string, snippet: ?string} */
    private static function unknown(string $detail, string $fix): array
    {
        return self::result('unknown', $detail, $fix);
    }

    /** @return array{state: string, detail: string, fix: string, snippet: ?string} */
    private static function info(string $detail, string $fix, ?string $snippet = null): array
    {
        return self::result('info', $detail, $fix, $snippet);
    }
}
