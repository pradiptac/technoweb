<?php

namespace App\Support\System;

use App\Models\Backup;
use App\Models\BackupRestore;
use App\Models\Setting;
use App\Models\User;
use App\Support\Backups\BackupRunner;
use App\Support\Backups\RestoreRunner;
use App\Support\Upgrade\UpgradeSteps;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;
use ZipArchive;

/**
 * System → Updates: apply a release zip to this install, one short step per request.
 *
 * The browser drives it — every press of the console's progress loop is one
 * `step()` — because shared hosting gives a request thirty seconds, no
 * shell and no long-running worker we can rely on. The state of the run is a
 * JSON file on the shared `storage/`, never a database row: half-way through
 * an update the database is being migrated and the code reading it is being
 * replaced, and a file is the one thing both releases can read.
 *
 * The order, and why:
 *
 *   preflight  signature, direction, disk, nothing else running
 *   backup     a database-only safety copy (`pre_update`), local
 *   extract    unpack api/ and web/ beside the live copies (`*.new`),
 *              every file checked against the signed hash list
 *   swap       api → api.prev, api.new → api — after the response is sent,
 *              so this request never loads a class from the other release
 *   migrate    the new code's migrations, a few files per request
 *   seed       SettingsSeeder and RoleSeeder (both only ever add)
 *   steps      the release's one-off upgrade steps (UpgradeSteps)
 *   optimize   rebuild Laravel's caches
 *   web        web → web.prev, web.new → web, restart the Node app, wait
 *              for it to answer with the new version
 *   warm       maintenance off, every cached page thrown away and re-rendered
 *   done
 *
 * The web folder is swapped last on purpose: until the API is ready, the old
 * website keeps running on its own cached pages; swapped earlier, a restarted
 * site would render against an API that answers 503.
 *
 * Maintenance (`UpdateMode`) is on from the backup until the warm step, so
 * nothing writes into the database while it is migrated or read by code that
 * is only half there.
 *
 * **Rollback** swaps the `.prev` folders back and, when the update had run
 * migrations, restores the safety copy through the ordinary restore engine.
 * It is driven by the same loop, and — since the code is swapped first — by
 * the *previous* release's copy of this class. **The run file's shape must
 * therefore stay readable by the release before it**: add keys, never rename.
 */
final class Updater
{
    private const SLICE = 15;

    public const FORWARD = ['preflight', 'backup', 'extract', 'swap', 'swapping', 'migrate', 'seed', 'steps', 'optimize', 'web', 'warm'];

    public const BACKWARD = ['rb_swap', 'rb_swapping', 'rb_database', 'rb_optimize', 'rb_web', 'rb_warm'];

    /* ------------------------------------------------------------ paths */

    /** A test's stand-in for the install's home; never set outside a test. */
    private static ?string $home = null;

    public static function useHome(?string $home): void
    {
        self::$home = $home;
    }

    /** The install's home (bootstrap/home.php), or null on a developer's checkout. */
    public static function home(): ?string
    {
        if (self::$home !== null) {
            return self::$home;
        }

        $home = require base_path('bootstrap/home.php');

        return is_string($home) ? str_replace('\\', '/', $home) : null;
    }

    private static function requireHome(): string
    {
        return self::home() ?? throw new RuntimeException('This copy was not installed from a release, so it is updated with git, not here.');
    }

    public static function packagesDir(): ?string
    {
        $home = self::home();

        return $home === null ? null : $home.'/updates';
    }

    private static function stateDir(): string
    {
        $dir = self::$home !== null ? self::$home.'/state' : storage_path('app/private/update');
        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        return $dir;
    }

    /* ------------------------------------------------------- run state */

    /** @return array<string, mixed>|null */
    public static function current(): ?array
    {
        $file = self::stateDir().'/run.json';
        $run = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;

        return is_array($run) ? $run : null;
    }

    /** @param array<string, mixed> $run */
    private static function save(array $run): void
    {
        $run['touched_at'] = gmdate('c');
        $file = self::stateDir().'/run.json';
        file_put_contents($file.'.tmp', json_encode($run, JSON_PRETTY_PRINT));
        rename($file.'.tmp', $file);
    }

    private static function clear(): void
    {
        @unlink(self::stateDir().'/run.json');
    }

    /** @param array<string, mixed> $run */
    private static function log(array &$run, string $line): void
    {
        $run['log'][] = ['at' => gmdate('c'), 'line' => $line];
    }

    /** @return list<array<string, mixed>> newest first */
    public static function history(): array
    {
        $file = self::stateDir().'/history.json';
        $list = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];

        return is_array($list) ? $list : [];
    }

    /** @param array<string, mixed> $entry */
    private static function remember(array $entry): void
    {
        $list = self::history();
        array_unshift($list, $entry);
        file_put_contents(self::stateDir().'/history.json', json_encode(array_slice($list, 0, 50), JSON_PRETTY_PRINT));
    }

    public static function inProgress(): bool
    {
        $run = self::current();

        return $run !== null && in_array($run['status'] ?? '', [...self::FORWARD, ...self::BACKWARD], true);
    }

    /* -------------------------------------------------------- packages */

    /** @return list<string> the zips waiting in updates/, newest first */
    public static function packages(): array
    {
        $dir = self::packagesDir();
        $files = $dir !== null ? (glob($dir.'/*.zip') ?: []) : [];
        usort($files, fn ($a, $b) => filemtime($b) <=> filemtime($a));

        return array_map(fn ($f) => str_replace('\\', '/', $f), $files);
    }

    public static function packagePath(string $file): string
    {
        $name = basename($file);
        $path = self::packagesDir().'/'.$name;

        if (! preg_match('/^[A-Za-z0-9._-]+\.zip$/', $name) || ! is_file($path)) {
            throw new RuntimeException('That file is not in the updates folder.');
        }

        return $path;
    }

    /* ----------------------------------------------------------- start */

    /** @return array<string, mixed> */
    public static function start(string $file, User $by): array
    {
        $home = self::requireHome();

        if (self::inProgress()) {
            throw new RuntimeException('An update is already running. Carry it on, or roll it back.');
        }

        $package = ReleasePackage::open(self::packagePath($file));
        $installed = AppVersion::current();

        if (($why = $package->refusal($installed)) !== null) {
            throw new RuntimeException($why);
        }

        if (BackupRestore::query()->inFlight()->exists() || Backup::query()->inFlight()->exists()) {
            throw new RuntimeException('A backup or a restore is running. Wait for it to finish, then apply the update.');
        }

        $run = [
            'id' => bin2hex(random_bytes(6)),
            'key' => bin2hex(random_bytes(24)),
            'kind' => 'update',
            'file' => basename($package->path),
            'from' => $installed,
            'to' => $package->version(),
            'status' => 'preflight',
            'started_at' => gmdate('c'),
            'by' => ['id' => $by->id, 'name' => $by->name],
            'home' => $home,
            'log' => [],
        ];
        self::log($run, "Updating from {$installed} to {$package->version()}.");
        self::save($run);

        return $run;
    }

    /* ------------------------------------------------------------ step */

    /** Do the next slice of whatever the run is doing. @return array<string, mixed>|null */
    public static function step(): ?array
    {
        $run = self::current();

        if ($run === null || ! in_array($run['status'] ?? '', [...self::FORWARD, ...self::BACKWARD], true)) {
            return $run;
        }

        // Raise a web request's limit to cover one slice — never impose one.
        // The CLI runs unlimited (0), and set_time_limit(90) there put a
        // 90-second wall clock (on Windows) on the whole test process, which
        // killed whatever test was running a minute and a half later.
        $limit = (int) ini_get('max_execution_time');
        if ($limit > 0 && $limit < 90) {
            @set_time_limit(90);
        }
        $deadline = CarbonImmutable::now()->addSeconds(self::SLICE);

        if (! in_array($run['status'], ['swapping', 'rb_swapping'], true)) {
            UpdateMode::on($run['id']);
        }

        try {
            match ($run['status']) {
                'preflight' => self::preflight($run),
                'backup' => self::backup($run, $deadline),
                'extract' => self::extract($run),
                'swap' => self::swap($run, rollback: false),
                'swapping', 'rb_swapping' => self::swapWait($run),
                'migrate' => self::migrate($run),
                'seed' => self::seed($run),
                'steps' => self::steps($run),
                'optimize' => self::optimize($run),
                'web' => self::web($run),
                'warm' => self::warm($run),
                'rb_swap' => self::swap($run, rollback: true),
                'rb_database' => self::rollbackDatabase($run, $deadline),
                'rb_optimize' => self::optimize($run),
                'rb_web' => self::web($run),
                'rb_warm' => self::warm($run),
            };
        } catch (Throwable $e) {
            $run['failed_at'] = $run['status'];
            $run['status'] = 'failed';
            $run['error'] = $e->getMessage();
            self::log($run, 'Stopped: '.$e->getMessage());

            // Before the swap nothing of the live copy has changed: reopen the
            // site and leave the unpacked folders for the next attempt to clear.
            if (in_array($run['failed_at'], ['preflight', 'backup', 'extract'], true)) {
                UpdateMode::off();
                $run['site_open'] = true;
            }

            report($e);
        }

        self::save($run);

        return $run;
    }

    /**
     * `step()`, for a caller that proves itself with the run's own key rather
     * than a signed-in session.
     *
     * A rollback restores the database, and the restore drops every table
     * before it re-imports them — `personal_access_tokens` with the rest — so
     * for that stretch no request can prove who sent it, and the steps that
     * drive the restore would stop at their own authentication. The run's key
     * (random, in the run file, handed to the administrator who started the
     * run) needs no table: compared in constant time with the file, and only
     * while the run is moving.
     *
     * @return array<string, mixed>|null
     */
    public static function stepWithKey(string $key): ?array
    {
        $run = self::current();
        $expected = is_array($run) ? (string) ($run['key'] ?? '') : '';

        if ($expected === '' || ! hash_equals($expected, $key) || ! in_array($run['status'] ?? '', [...self::FORWARD, ...self::BACKWARD], true)) {
            throw new RuntimeException('There is no update running under that key.');
        }

        return self::step();
    }

    /** Carry on after a failure, from the step that failed. @return array<string, mixed> */
    public static function retry(): array
    {
        $run = self::current() ?? throw new RuntimeException('There is no update to carry on.');

        if (($run['status'] ?? '') !== 'failed') {
            throw new RuntimeException('The update has not stopped.');
        }

        $run['status'] = $run['failed_at'] === 'swapping' ? 'swap' : ($run['failed_at'] === 'rb_swapping' ? 'rb_swap' : $run['failed_at']);
        unset($run['error'], $run['failed_at'], $run['site_open']);
        $run['key'] ??= bin2hex(random_bytes(24));
        self::log($run, 'Trying again.');
        self::save($run);

        return $run;
    }

    /** Forget a run that stopped before anything live changed. */
    public static function abandon(): void
    {
        $run = self::current();

        if ($run !== null && in_array($run['status'], [...self::FORWARD, ...self::BACKWARD], true)) {
            throw new RuntimeException('The update is still running.');
        }

        if ($run !== null && ($run['status'] ?? '') === 'failed' && ! in_array($run['failed_at'] ?? '', ['preflight', 'backup', 'extract'], true)) {
            throw new RuntimeException('This update stopped after the application was replaced. Carry it on, or roll it back — the site stays closed until one of them finishes.');
        }

        $home = self::home();
        if ($home !== null) {
            self::remove($home.'/api.new');
            self::remove($home.'/web.new');
        }

        UpdateMode::off();
        self::clear();
    }

    /* ------------------------------------------------------ the steps */

    /** @param array<string, mixed> $run */
    private static function preflight(array &$run): void
    {
        $home = self::requireHome();
        $package = ReleasePackage::open(self::packagePath($run['file']));

        if (($why = $package->refusal($run['from'])) !== null) {
            throw new RuntimeException($why);
        }

        // Room for the unpacked release beside the live one.
        $need = self::unpackedSize($package) * 1.2;
        $free = @disk_free_space($home);
        if ($free !== false && $free < $need) {
            throw new RuntimeException('Not enough disk space: the update needs about '.self::mb($need).' free and there is '.self::mb($free).'. Delete old backups (System → Backups) or ask the host for more space.');
        }

        // The previous rollback copy goes now: only the latest update can be rolled back.
        foreach (['api.new', 'web.new', 'api.prev', 'web.prev', 'api.failed', 'web.failed'] as $dir) {
            self::remove($home.'/'.$dir);
        }

        $run['extract_next'] = 0;
        $run['status'] = 'backup';
        self::log($run, 'Checked: signed by your supplier, compatible, '.self::mb($free ?: 0).' free.');
    }

    /** @param array<string, mixed> $run */
    private static function backup(array &$run, CarbonImmutable $deadline): void
    {
        if (empty($run['backup_id'])) {
            $backup = BackupRunner::start('full', 'pre_update', $run['by']['id'] ?? null, $run['by']['name'] ?? null, ['database' => true, 'public' => false, 'private' => false], []);
            $run['backup_id'] = $backup->id;
            $run['backup_folder'] = $backup->folder;
            self::log($run, 'Taking a safety copy of the database.');
        }

        $backup = Backup::query()->findOrFail($run['backup_id']);

        if (! BackupRunner::advance($backup, $deadline)) {
            return;
        }

        $backup->refresh();

        if (! in_array($backup->status, Backup::DONE, true)) {
            throw new RuntimeException('The safety copy could not be made ('.($backup->error ?? $backup->status).'), so nothing was changed.');
        }

        $run['status'] = 'extract';
        self::log($run, "Safety copy made: {$backup->folder}.");
    }

    /** @param array<string, mixed> $run */
    private static function extract(array &$run): void
    {
        $home = self::requireHome();
        $package = ReleasePackage::open(self::packagePath($run['file']));
        $hashes = $package->files();
        $zip = new ZipArchive;

        if ($zip->open($package->path, ZipArchive::RDONLY) !== true) {
            throw new RuntimeException('The update file could not be opened.');
        }

        $started = microtime(true);
        $i = (int) ($run['extract_next'] ?? 0);
        $prefix = $package->root.'/';

        try {
            for (; $i < $zip->numFiles; $i++) {
                if (microtime(true) - $started > self::SLICE) {
                    break;
                }

                $name = (string) $zip->getNameIndex($i);
                $rel = str_starts_with($name, $prefix) ? substr($name, strlen($prefix)) : '';
                $top = explode('/', $rel)[0];

                if (! in_array($top, ['api', 'web'], true)) {
                    continue; // config/, storage/, updates/, MANUAL/ — never written by an update
                }

                // A segment that *is* `..`, not one containing it: Next's
                // catch-all routes are folders called `[...rest]`.
                if (in_array('..', explode('/', $rel), true) || str_contains($rel, '\\')) {
                    throw new RuntimeException("The update contains a path that is not allowed: {$rel}");
                }

                $target = $home.'/'.$top.'.new'.substr($rel, strlen($top));

                if (str_ends_with($name, '/')) {
                    if (! is_dir($target)) {
                        mkdir($target, 0755, true);
                    }

                    continue;
                }

                $expected = $hashes[$rel] ?? throw new RuntimeException("The update contains a file its signed list does not name: {$rel}");

                if (! is_dir(dirname($target))) {
                    mkdir(dirname($target), 0755, true);
                }

                $in = $zip->getStream($name);
                $out = fopen($target, 'wb');
                $hash = hash_init('sha256');

                if ($in === false || $out === false) {
                    throw new RuntimeException("Could not unpack {$rel}.");
                }

                while (! feof($in)) {
                    $chunk = (string) fread($in, 1 << 20);
                    hash_update($hash, $chunk);
                    fwrite($out, $chunk);
                }

                fclose($in);
                fclose($out);

                if (! hash_equals($expected, hash_final($hash))) {
                    throw new RuntimeException("{$rel} does not match its signed checksum. The zip is damaged; upload it again.");
                }
            }

            $total = $zip->numFiles;
        } finally {
            $zip->close();
        }

        $run['extract_next'] = $i;
        $run['extract_total'] = $total;

        if ($i < $total) {
            return;
        }

        // Every file the signed list names must now exist — a zip with an
        // entry missing would otherwise install a release with a hole in it.
        foreach (array_keys($hashes) as $rel) {
            $top = explode('/', $rel)[0];

            if (! is_file($home.'/'.$top.'.new'.substr($rel, strlen($top)))) {
                throw new RuntimeException("The update is missing {$rel}. Upload the zip again.");
            }
        }

        $run['status'] = 'swap';
        self::log($run, 'Unpacked and checked '.count($hashes).' files.');
    }

    /**
     * Rename the folders — after this request's response has gone out.
     *
     * Until the response is sent this request is still running the old
     * code; renaming under it would have the next class it loads come from
     * the other release. `terminating()` runs once the client has its answer
     * (under PHP-FPM, after `fastcgi_finish_request`). The browser's next
     * step sees `swapping` until the callback has written the new status.
     *
     * @param  array<string, mixed>  $run
     */
    private static function swap(array &$run, bool $rollback): void
    {
        $run['status'] = $rollback ? 'rb_swapping' : 'swapping';
        $home = self::requireHome();
        $id = $run['id'];

        app()->terminating(function () use ($home, $rollback, $id): void {
            $run = self::current();

            // Only the swap this request asked for, and only once: a process
            // that serves more than one request (a test, a long-lived worker)
            // runs every terminating callback it has collected each time.
            if (($run['id'] ?? null) !== $id || ($run['status'] ?? null) !== ($rollback ? 'rb_swapping' : 'swapping')) {
                return;
            }

            try {
                // Each move only when it has not happened yet, so "Try this
                // step again" after a swap that stopped half-way finishes it
                // rather than moving the wrong folder a second time. The
                // website is not moved here in either direction: `optimize()`
                // swaps it last, just before its restart.
                if ($rollback) {
                    if (is_dir($home.'/api.prev')) {
                        if (is_dir($home.'/api')) {
                            self::move($home.'/api', $home.'/api.failed');
                        }
                        self::move($home.'/api.prev', $home.'/api');
                    }
                } elseif (is_dir($home.'/api.new')) {
                    self::move($home.'/api', $home.'/api.prev');

                    try {
                        self::move($home.'/api.new', $home.'/api');
                    } catch (Throwable $e) {
                        self::move($home.'/api.prev', $home.'/api');

                        throw $e;
                    }
                }

                self::linkStorage($home);

                if (function_exists('opcache_reset')) {
                    @opcache_reset();
                }

                $run['status'] = $rollback ? (! empty($run['migrated']) ? 'rb_database' : 'rb_optimize') : 'migrate';
                self::log($run, $rollback ? 'The previous version of the API is back in place.' : 'The new version of the API is in place.');
            } catch (Throwable $e) {
                $run['failed_at'] = $rollback ? 'rb_swapping' : 'swapping';
                $run['status'] = 'failed';
                $run['error'] = 'The folders could not be swapped: '.$e->getMessage();
            }

            self::save($run);
        });
    }

    /** @param array<string, mixed> $run */
    private static function swapWait(array &$run): void
    {
        // The swap is finishing in another request's shutdown; nothing to do
        // but report. A swap that never finished (the process died) shows as
        // `swapping` long after it started, and the screen offers a retry.
    }

    /** @param array<string, mixed> $run */
    private static function migrate(array &$run): void
    {
        $result = SlicedMigrator::run(self::SLICE);

        if ($result['ran_now'] !== []) {
            $run['migrated'] = true;
            self::log($run, 'Database: '.implode(', ', $result['ran_now']).'.');
        }

        $run['migrations_remaining'] = $result['remaining'];

        if ($result['done']) {
            $run['status'] = 'seed';
        }
    }

    /** @param array<string, mixed> $run */
    private static function seed(array &$run): void
    {
        Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\SettingsSeeder', '--force' => true]);
        Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\RoleSeeder', '--force' => true]);
        Setting::flushCache();

        $run['status'] = 'steps';
        self::log($run, 'New settings and roles added.');
    }

    /** @param array<string, mixed> $run */
    private static function steps(array &$run): void
    {
        $pending = UpgradeSteps::pending();

        if ($pending === []) {
            $run['status'] = 'optimize';

            return;
        }

        // One per request: a step may be slow, and each is recorded as it ends.
        $step = $pending[0];
        UpgradeSteps::run($step);
        self::log($run, $step->description().'.');
    }

    /** @param array<string, mixed> $run */
    private static function optimize(array &$run): void
    {
        // Never in a test: `optimize` writes the config cache into the real
        // bootstrap/cache, which would pin the test settings on this machine.
        if (! app()->runningUnitTests()) {
            Artisan::call('optimize:clear');
            Artisan::call('optimize');
        }

        try {
            Artisan::call('queue:restart');
        } catch (Throwable) {
            // No cache store to signal through is not worth stopping for.
        }

        $home = self::requireHome();

        if ($run['status'] === 'optimize') {
            // The website last, now the API is ready for it.
            if (is_dir($home.'/web.new')) {
                if (is_dir($home.'/web')) {
                    self::move($home.'/web', $home.'/web.prev');
                }
                self::move($home.'/web.new', $home.'/web');
            }
            $run['status'] = 'web';
        } else {
            // A rollback mirrors it: the previous website comes back only once
            // the previous API is ready for it. No `web.prev` means the update
            // stopped before its website was ever swapped.
            if (is_dir($home.'/web.prev')) {
                if (is_dir($home.'/web')) {
                    self::move($home.'/web', $home.'/web.failed');
                }
                self::move($home.'/web.prev', $home.'/web');
            }
            $run['status'] = 'rb_web';
        }

        @touch($home.'/web/tmp/restart.txt');
        $run['web_since'] = time();
        self::log($run, 'Restarting the website.');
    }

    /** @param array<string, mixed> $run */
    private static function web(array &$run): void
    {
        $want = $run['status'] === 'web' ? $run['to'] : $run['from'];
        $health = self::health();

        if (($health['version'] ?? null) === $want) {
            $run['status'] = $run['status'] === 'web' ? 'warm' : 'rb_warm';
            $run['warm_next'] = 0;
            self::log($run, "The website is running {$want}.");

            return;
        }

        // Passenger restarts on the next request after restart.txt is touched;
        // make one, and keep touching now and then in case the first was missed.
        if (time() - (int) ($run['web_since'] ?? 0) > 60) {
            @touch(self::requireHome().'/web/tmp/restart.txt');
            $run['web_since'] = time();
            $run['web_waiting'] = true;
        }
    }

    /** @param array<string, mixed> $run */
    private static function warm(array &$run): void
    {
        UpdateMode::off();
        $base = self::webBase();
        $i = (int) ($run['warm_next'] ?? 0);

        if ($i === 0) {
            // Before the purge: it can only expire pages older than itself.
            self::agePrerenderedPages(self::requireHome());

            $token = (string) config('app.internal_token');
            $purge = Http::timeout(15)->withToken($token)->post($base.'/api/internal/revalidate');

            if (! $purge->ok()) {
                throw new RuntimeException('The website did not refresh its pages (it answered '.$purge->status().'). Check that INTERNAL_TOKEN is the same in config/api.env and config/web.env.');
            }
        }

        $pages = ['/', '/solutions', '/services', '/industries', '/products', '/store', '/blog', '/case-studies', '/knowledge-base', '/about', '/contact'];
        $started = microtime(true);

        // Two passes: the first starts every page rendering behind a stale
        // copy, the second — seconds later — is answered with the new one.
        $total = 2 * count($pages);

        for (; $i < $total && microtime(true) - $started < self::SLICE; $i++) {
            try {
                Http::timeout(10)->get($base.$pages[$i % count($pages)]);
            } catch (Throwable) {
                // A page that cannot be warmed renders on its first visit instead.
            }
        }

        $run['warm_next'] = $i;

        if ($i < $total) {
            return;
        }

        $rollback = $run['status'] === 'rb_warm';
        $run['status'] = $rollback ? 'rolled_back' : 'done';
        $run['finished_at'] = gmdate('c');
        self::log($run, $rollback ? "Rolled back to {$run['from']}." : "Updated to {$run['to']}.");

        if (! $rollback) {
            self::stamp($run['to']);
        } else {
            self::stamp($run['from']);
            foreach (['api.failed', 'web.failed', 'api.new', 'web.new'] as $dir) {
                self::remove(self::requireHome().'/'.$dir);
            }
        }

        self::remember([
            'kind' => $rollback ? 'rollback' : 'update',
            'from' => $rollback ? $run['to'] : $run['from'],
            'to' => $rollback ? $run['from'] : $run['to'],
            'started_at' => $run['started_at'],
            'finished_at' => $run['finished_at'],
            'by' => $run['by']['name'] ?? null,
            'backup_folder' => $run['backup_folder'] ?? null,
            'migrated' => ! empty($run['migrated']),
        ]);
    }

    /* -------------------------------------------------------- rollback */

    /**
     * Put the previous release back, and the database as it was before the
     * update if the update changed it.
     *
     * @return array<string, mixed>
     */
    public static function rollback(User $by): array
    {
        $home = self::requireHome();
        $run = self::current();

        if (! is_dir($home.'/api.prev')) {
            throw new RuntimeException('There is no previous version on this server to go back to.');
        }

        if ($run !== null && in_array($run['status'], [...self::FORWARD, ...self::BACKWARD], true)) {
            throw new RuntimeException('Wait for the running step to stop, then roll back.');
        }

        $last = self::history()[0] ?? null;

        // A finished update's run file is gone by now; rebuild what the
        // rollback needs from the history.
        $run = $run !== null && ($run['kind'] ?? '') === 'update' ? $run : [
            'id' => bin2hex(random_bytes(6)),
            'key' => bin2hex(random_bytes(24)),
            'kind' => 'update',
            'from' => $last['from'] ?? 'the previous version',
            'to' => $last['to'] ?? AppVersion::current(),
            'backup_folder' => $last['backup_folder'] ?? null,
            'migrated' => (bool) ($last['migrated'] ?? false),
            'started_at' => gmdate('c'),
            'log' => [],
        ];

        $run['status'] = 'rb_swap';
        $run['key'] = bin2hex(random_bytes(24));
        $run['by'] = ['id' => $by->id, 'name' => $by->name];
        unset($run['error'], $run['failed_at'], $run['restore_id']);
        self::log($run, 'Rolling back to '.$run['from'].'.');
        UpdateMode::on($run['id']);
        self::save($run);

        return $run;
    }

    /** @param array<string, mixed> $run */
    private static function rollbackDatabase(array &$run, CarbonImmutable $deadline): void
    {
        if (empty($run['restore_id'])) {
            if (empty($run['backup_folder'])) {
                throw new RuntimeException('The safety copy of the database is not on record, so the database cannot be put back. Restore it by hand from System → Backups.');
            }

            $restore = RestoreRunner::plan(['kind' => 'local', 'folder' => $run['backup_folder']], 'database', false, $run['by']['id'] ?? null, $run['by']['name'] ?? null);
            $run['restore_id'] = $restore->id;
            self::log($run, "Restoring the database from {$run['backup_folder']}.");
        }

        $restore = BackupRestore::query()->findOrFail($run['restore_id']);

        if (! RestoreRunner::advance($restore, $deadline)) {
            return;
        }

        $restore->refresh();

        if ($restore->status !== 'completed') {
            throw new RuntimeException('The database could not be restored: '.($restore->error ?? $restore->status));
        }

        $run['status'] = 'rb_optimize';
        self::log($run, 'The database is back as it was before the update.');
    }

    /* --------------------------------------------------------- helpers */

    /** @return array<string, mixed> */
    public static function health(): array
    {
        try {
            $res = Http::timeout(5)->acceptJson()->get(self::webBase().'/api/health');

            return is_array($res->json()) ? $res->json() : [];
        } catch (Throwable) {
            return [];
        }
    }

    private static function webBase(): string
    {
        return rtrim((string) (config('app.web_internal_url') ?: config('app.frontend_url')), '/');
    }

    /** Record the running version beside the settings (config/install.json). */
    private static function stamp(string $version): void
    {
        $file = self::requireHome().'/config/install.json';
        $data = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
        $data['version'] = $version;
        $data['updated_at'] = gmdate('c');
        file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT)."\n");
    }

    /** `public/storage`, the one link inside the code: to the storage beside it. */
    public static function linkStorage(string $home): void
    {
        $link = $home.'/api/public/storage';

        if (! file_exists($link) && ! is_link($link)) {
            @symlink('../../storage/app/public', $link);
        }
    }

    /**
     * Make the build's prerendered pages older than now, so a purge can expire
     * them.
     *
     * Next takes a cached page's age from its file's modified time, and a
     * purge (`revalidatePath`) only expires pages **older** than itself. A
     * release unpacked on a server whose clock is behind the build machine's
     * — a zip stores local time with no zone — leaves every prerendered page
     * dated in the future, so the purge expired none of them and they never
     * went stale on their own: the installed site showed the build's
     * error-state pages, in the default theme, for hours (2026-09-30, Plesk).
     * `release/zip.php` writes a date safely in the past now; this covers a
     * zip built before that, and any extraction that does not preserve times.
     *
     * Only files newer than two minutes ago are touched, so a page that has
     * already been regenerated keeps its real time. Returns how many changed.
     */
    public static function agePrerenderedPages(string $home): int
    {
        $dir = $home.'/web/.next/server/app';

        if (! is_dir($dir)) {
            return 0;
        }

        $limit = time() - 120;
        $changed = 0;

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($files as $file) {
            if ($file->isFile() && $file->getMTime() > $limit && @touch($file->getPathname(), $limit)) {
                $changed++;
            }
        }

        return $changed;
    }

    private static function move(string $from, string $to): void
    {
        if (! is_dir($from)) {
            throw new RuntimeException(basename($from).' is not there.');
        }

        if (file_exists($to)) {
            self::remove($to);
        }

        if (! @rename($from, $to)) {
            throw new RuntimeException('Could not rename '.basename($from).' to '.basename($to).'.');
        }
    }

    public static function remove(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            @unlink($path);

            return;
        }

        if (! is_dir($path)) {
            return;
        }

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );

        foreach ($it as $item) {
            $item->isDir() && ! $item->isLink() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }

        @rmdir($path);
    }

    private static function unpackedSize(ReleasePackage $package): int
    {
        $zip = new ZipArchive;
        $zip->open($package->path, ZipArchive::RDONLY);
        $size = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $size += (int) ($zip->statIndex($i)['size'] ?? 0);
        }

        $zip->close();

        return $size;
    }

    private static function mb(float|int $bytes): string
    {
        return number_format($bytes / 1048576).' MB';
    }
}
