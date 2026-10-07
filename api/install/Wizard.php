<?php

namespace Technoware\Install;

use App\Support\QueueHealth;
use App\Support\System\Branding;
use App\Support\System\FirstAdmin;
use App\Support\System\Requirements;
use App\Support\System\SlicedMigrator;
use App\Support\System\Updater;
use App\Support\Upgrade\UpgradeSteps;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Artisan;

/**
 * The setup wizard behind `https://<api domain>/install/`.
 *
 * It exists for one visit: the first. Everything a person does on a hosting
 * panel happens before (upload the zip, point two domains at two folders,
 * create a database) and after (create the Node.js app, add one cron line);
 * everything in between — requirements, the database, the settings files, the
 * schema, the first administrator, connecting the website, warming it — is
 * here, one short request at a time, so a host with a 30-second
 * `max_execution_time` still finishes.
 *
 * **Who may use it.** Nobody, once `config/install.json` exists: every
 * request answers 404 before anything else is read. Before that, only the
 * person who can open the hosting account's files: the first visit writes a
 * random key to `storage/install.key`, and every action needs it back. A
 * stranger who finds `/install` first can do nothing with it.
 *
 * **Where things go.** The zip unpacks as `<home>/{api,web,config,storage}`
 * (bootstrap/home.php). This class lives in `api/install/`, outside the
 * document root; `api/public/install/index.php` only hands the request here.
 *
 * Framework-free until the settings exist, then it boots Laravel in-process
 * (`laravel()`) for the migrations and seeders — `Artisan::call`, which needs
 * no shell and no `proc_open`, both of which shared hosting often refuses.
 */
final class Wizard
{
    private string $api;

    private string $home;

    private string $config;

    private string $storage;

    /** Seconds one request may spend migrating before it reports progress. */
    private const SLICE_SECONDS = 12;

    /** The pages warmed once the site is connected, in the order people land on them. */
    private const WARM = [
        '/', '/solutions', '/services', '/industries', '/products', '/store', '/blog',
        '/case-studies', '/knowledge-base', '/resources', '/support', '/about', '/contact',
        '/careers', '/team', '/clients', '/certifications',
    ];

    public function __construct(string $apiDir)
    {
        $this->api = rtrim(str_replace('\\', '/', $apiDir), '/');
        $this->home = dirname($this->api);
        $this->config = $this->home.'/config';
        $this->storage = $this->home.'/storage';
    }

    /* ----------------------------------------------------------- entry */

    public function handle(): void
    {
        // Not an install layout (a developer's checkout), or already installed:
        // the wizard does not exist.
        if (! is_dir($this->config) || ! is_dir($this->storage) || is_file($this->config.'/install.json')) {
            http_response_code(404);
            header('Content-Type: text/plain');
            echo "Not found.\n";

            return;
        }

        $action = (string) ($_GET['action'] ?? '');

        if ($action === '') {
            $this->ensureKey();
            header('Content-Type: text/html; charset=utf-8');
            header('X-Frame-Options: DENY');
            header('Cache-Control: no-store');
            header("Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'");
            require __DIR__.'/view.php';

            return;
        }

        header('Content-Type: application/json');
        header('Cache-Control: no-store');

        try {
            if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
                throw new Refusal('Use POST.', 405);
            }

            $this->authorise();
            $input = json_decode((string) file_get_contents('php://input'), true);
            $result = $this->dispatch($action, is_array($input) ? $input : []);
            echo json_encode(['ok' => true] + $result);
        } catch (Refusal $e) {
            http_response_code($e->status);
            echo json_encode(['ok' => false, 'message' => $e->getMessage(), 'errors' => $e->errors]);
        } catch (\Throwable $e) {
            http_response_code(500);
            // The server's own words: the person reading this is the one who
            // has to fix it, on a host we cannot see.
            echo json_encode(['ok' => false, 'message' => $e->getMessage()]);
        }
    }

    /** @param array<string, mixed> $in @return array<string, mixed> */
    private function dispatch(string $action, array $in): array
    {
        return match ($action) {
            'unlock' => ['state' => $this->publicState()],
            'requirements' => $this->requirements(),
            'database' => $this->database($in),
            'site' => $this->site($in),
            'config' => $this->writeConfig(),
            'migrate' => $this->migrate(),
            'seed' => $this->seed(),
            'finalise' => $this->finaliseApi(),
            'website' => $this->website(),
            'warm' => $this->warm((int) ($in['from'] ?? 0)),
            'scheduler' => $this->scheduler(),
            'finish' => $this->finish(),
            default => throw new Refusal('Unknown step.', 404),
        };
    }

    /* ---------------------------------------------------------- the key */

    private function keyFile(): string
    {
        return $this->storage.'/install.key';
    }

    private function ensureKey(): void
    {
        if (is_file($this->keyFile())) {
            return;
        }

        $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $key = '';
        for ($i = 0; $i < 16; $i++) {
            $key .= $alphabet[random_int(0, strlen($alphabet) - 1)].($i % 4 === 3 && $i < 15 ? '-' : '');
        }

        if (@file_put_contents($this->keyFile(), $key."\n") === false) {
            throw new \RuntimeException('The storage folder is not writable, so the wizard cannot start. Make '.$this->storage.' writable by PHP.');
        }

        @chmod($this->keyFile(), 0600);
    }

    private function authorise(): void
    {
        $given = strtoupper(trim((string) ($_SERVER['HTTP_X_INSTALL_KEY'] ?? '')));
        $expected = is_file($this->keyFile()) ? strtoupper(trim((string) file_get_contents($this->keyFile()))) : '';

        if ($expected === '' || ! hash_equals($expected, $given)) {
            usleep(750_000); // a guess costs time; the key is 80 bits anyway
            throw new Refusal('That key does not match. Open storage/install.key in the hosting panel\'s File Manager and copy what it says.', 403);
        }
    }

    /* ------------------------------------------------------------ state */

    private function stateFile(): string
    {
        return $this->storage.'/install-state.json';
    }

    /** @return array<string, mixed> */
    private function state(): array
    {
        $data = is_file($this->stateFile()) ? json_decode((string) file_get_contents($this->stateFile()), true) : null;

        return is_array($data) ? $data : [];
    }

    /** @param array<string, mixed> $changes */
    private function save(array $changes): void
    {
        $state = array_replace_recursive($this->state(), $changes);
        file_put_contents($this->stateFile(), json_encode($state, JSON_PRETTY_PRINT));
        @chmod($this->stateFile(), 0600);
    }

    /**
     * What the page may be told about a resumed install: which steps are done
     * and the non-secret answers, never a password.
     *
     * @return array<string, mixed>
     */
    private function publicState(): array
    {
        $s = $this->state();
        unset($s['db']['password'], $s['site']['admin_password_hash'], $s['site']['mail_password']);

        return $s + ['defaults' => $this->defaults()];
    }

    /** @return array<string, string> */
    private function defaults(): array
    {
        $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off'
            || strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'api.example.com');
        $bare = preg_replace('/^api\./', '', preg_replace('/:\d+$/', '', $host));

        return [
            'api_url' => ($https ? 'https://' : 'http://').$host,
            'site_url' => 'https://www.'.$bare,
            'version' => $this->version(),
        ];
    }

    /** The version being installed, for the page's heading. */
    public function defaultsVersion(): string
    {
        return $this->version();
    }

    private function version(): string
    {
        $data = json_decode((string) @file_get_contents($this->api.'/version.json'), true);

        return is_array($data) && is_string($data['version'] ?? null) ? $data['version'] : 'unknown';
    }

    /* ---------------------------------------------------- 1. requirements */

    /** @return array<string, mixed> */
    private function requirements(): array
    {
        require_once $this->api.'/app/Support/System/Requirements.php';

        $checks = Requirements::check();

        foreach ([
            $this->config => 'The config folder',
            $this->storage => 'The storage folder',
            $this->api.'/bootstrap/cache' => 'api/bootstrap/cache',
            $this->home.'/web/tmp' => 'web/tmp (restarts the website after an update)',
        ] as $dir => $label) {
            $checks[] = [
                'key' => 'writable-'.basename($dir),
                'label' => $label.' is writable',
                'ok' => is_dir($dir) && is_writable($dir),
                'required' => true,
                'detail' => 'PHP must be able to write to '.$dir.'. In File Manager, give the folder permission 755 (or 775) and make sure it belongs to this hosting account.',
            ];
        }

        $free = @disk_free_space($this->home);
        $checks[] = [
            'key' => 'disk',
            'label' => 'At least 1 GB of free space',
            'ok' => $free === false || $free > 1024 ** 3,
            'required' => false,
            'detail' => 'An update unpacks beside the running copy and keeps the previous one for rollback; that needs room for about two copies.',
        ];

        $limit = (int) ini_get('max_execution_time');

        return [
            'checks' => $checks,
            'satisfied' => array_reduce($checks, fn ($ok, $c) => $ok && ($c['ok'] || ! $c['required']), true),
            'info' => [
                'php' => PHP_VERSION,
                'max_execution_time' => $limit === 0 ? 'unlimited' : $limit.'s',
                'memory_limit' => (string) ini_get('memory_limit'),
                'home' => $this->home,
            ],
        ];
    }

    /* -------------------------------------------------------- 2. database */

    /** @param array<string, mixed> $in @return array<string, mixed> */
    private function database(array $in): array
    {
        $db = [
            'host' => trim((string) ($in['host'] ?? 'localhost')) ?: 'localhost',
            'port' => (int) ($in['port'] ?? 3306) ?: 3306,
            'database' => trim((string) ($in['database'] ?? '')),
            'username' => trim((string) ($in['username'] ?? '')),
            'password' => (string) ($in['password'] ?? ($this->state()['db']['password'] ?? '')),
        ];

        $errors = [];
        foreach (['database' => 'The database name', 'username' => 'The database user'] as $field => $label) {
            if ($db[$field] === '') {
                $errors[$field] = "{$label} is required.";
            }
        }
        if ($errors !== []) {
            throw new Refusal('Some details are missing.', 422, $errors);
        }

        try {
            $pdo = new \PDO(
                "mysql:host={$db['host']};port={$db['port']};dbname={$db['database']};charset=utf8mb4",
                $db['username'],
                $db['password'],
                [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION, \PDO::ATTR_TIMEOUT => 5],
            );
        } catch (\PDOException $e) {
            throw new Refusal('Could not connect: '.$e->getMessage(), 422, ['database' => 'Check the host, name, user and password as the hosting panel shows them.']);
        }

        $version = (string) $pdo->query('select version()')->fetchColumn();
        $maria = stripos($version, 'mariadb') !== false;
        $number = preg_replace('/[^0-9.].*$/', '', $version);
        $supported = $maria ? version_compare($number, '10.6', '>=') : version_compare($number, '8.0', '>=');

        if (! $supported) {
            throw new Refusal('This server runs '.($maria ? 'MariaDB' : 'MySQL')." {$number}. MySQL 8.0 or newer is needed (MariaDB 10.6 or newer works too).", 422);
        }

        $tables = $pdo->query('show tables')->fetchAll(\PDO::FETCH_COLUMN);
        $ours = in_array('migrations', $tables, true);

        if ($tables !== [] && ! $ours && empty($in['confirm_not_empty'])) {
            throw new Refusal(count($tables).' tables are already in this database, and they are not from an earlier attempt at this install. Use an empty database, or tick "Use it anyway".', 409, ['confirm_not_empty' => 'needed']);
        }

        $this->save(['db' => $db, 'steps' => ['database' => true]]);

        return [
            'server' => ($maria ? 'MariaDB ' : 'MySQL ').$number,
            'resuming' => $ours,
            'warning' => $maria ? 'This software is tested on MySQL 8. MariaDB is expected to work; tell your supplier if anything misbehaves.' : null,
        ];
    }

    /* ------------------------------------------------------------ 3. site */

    /** @param array<string, mixed> $in @return array<string, mixed> */
    private function site(array $in): array
    {
        $errors = [];
        $company = trim((string) ($in['company_name'] ?? ''));
        $siteUrl = $this->origin((string) ($in['site_url'] ?? ''));
        $apiUrl = $this->origin((string) ($in['api_url'] ?? ''));
        $name = trim((string) ($in['admin_name'] ?? ''));
        $email = strtolower(trim((string) ($in['admin_email'] ?? '')));
        $phone = preg_replace('/[^\d+]/', '', (string) ($in['admin_phone'] ?? ''));
        $password = (string) ($in['admin_password'] ?? '');

        if ($company === '') {
            $errors['company_name'] = 'The company name is shown on every page and email.';
        }
        if ($siteUrl === null) {
            $errors['site_url'] = 'The website address, for example https://www.example.com.';
        }
        if ($apiUrl === null) {
            $errors['api_url'] = 'This address (the API), for example https://api.example.com.';
        }
        if ($siteUrl !== null && $siteUrl === $apiUrl) {
            $errors['api_url'] = 'The website and the API need two different addresses.';
        }
        if ($name === '') {
            $errors['admin_name'] = 'The administrator\'s name is required.';
        }
        if (filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
            $errors['admin_email'] = 'A valid email address — sign-in codes are sent to it.';
        }
        if (strlen((string) $phone) < 10) {
            $errors['admin_phone'] = 'A mobile number, with the country code if outside India.';
        }
        if (strlen($password) < 12 && empty($this->state()['site']['admin_password_hash'])) {
            $errors['admin_password'] = 'At least 12 characters.';
        }

        $mail = (string) ($in['mail'] ?? 'later');
        $smtp = [
            'mail' => in_array($mail, ['smtp', 'later'], true) ? $mail : 'later',
            'mail_host' => trim((string) ($in['mail_host'] ?? '')),
            'mail_port' => (int) ($in['mail_port'] ?? 587) ?: 587,
            'mail_username' => trim((string) ($in['mail_username'] ?? '')),
            'mail_password' => (string) ($in['mail_password'] ?? ($this->state()['site']['mail_password'] ?? '')),
            'mail_encryption' => in_array($in['mail_encryption'] ?? 'tls', ['tls', 'ssl', 'none'], true) ? (string) ($in['mail_encryption'] ?? 'tls') : 'tls',
            'mail_from' => strtolower(trim((string) ($in['mail_from'] ?? $email))),
        ];

        if ($smtp['mail'] === 'smtp') {
            if ($smtp['mail_host'] === '') {
                $errors['mail_host'] = 'The SMTP server your mail provider gave you.';
            }
            if (filter_var($smtp['mail_from'], FILTER_VALIDATE_EMAIL) === false) {
                $errors['mail_from'] = 'The address mail is sent from.';
            }
        }

        if ($errors !== []) {
            throw new Refusal('Please check the highlighted fields.', 422, $errors);
        }

        $this->save(['site' => [
            'company_name' => $company,
            'site_url' => $siteUrl,
            'api_url' => $apiUrl,
            'admin_name' => $name,
            'admin_email' => $email,
            'admin_phone' => $phone,
            'demo' => ! empty($in['demo']),
            'timezone' => in_array($in['timezone'] ?? '', timezone_identifiers_list(), true) ? $in['timezone'] : 'Asia/Kolkata',
        ] + $smtp + ($password !== '' ? ['admin_password_hash' => password_hash($password, PASSWORD_BCRYPT)] : []),
            'steps' => ['site' => true]]);

        return ['warnings' => array_values(array_filter([
            str_starts_with((string) $siteUrl, 'http://') || str_starts_with((string) $apiUrl, 'http://')
                ? 'One of the addresses is plain http. Switch on SSL for both domains in the hosting panel before going live.' : null,
        ]))];
    }

    private function origin(string $url): ?string
    {
        $url = trim($url);
        $parts = parse_url($url);

        if (! is_array($parts) || ! in_array($parts['scheme'] ?? '', ['http', 'https'], true) || empty($parts['host'])) {
            return null;
        }

        return strtolower($parts['scheme'].'://'.$parts['host']).(isset($parts['port']) ? ':'.$parts['port'] : '');
    }

    /* ----------------------------------------------------- 4. the settings */

    /** @return array<string, mixed> */
    private function writeConfig(): array
    {
        $s = $this->state();
        $this->need($s, ['database', 'site']);

        $site = $s['site'];
        $db = $s['db'];
        // Kept across a re-run: a second press must not change the key the
        // database's encrypted settings were written with.
        $appKey = $s['secrets']['app_key'] ?? 'base64:'.base64_encode(random_bytes(32));
        $internal = $s['secrets']['internal_token'] ?? bin2hex(random_bytes(32));
        $siteHost = (string) parse_url($site['site_url'], PHP_URL_HOST);
        $apiHost = (string) parse_url($site['api_url'], PHP_URL_HOST);

        // The Next server calls the API through its public name, so on one box
        // those requests arrive from the server's own address; the API has to
        // believe the visitor's address it forwards from there, or every
        // visitor shares one rate-limit bucket (config/trustedproxy.php).
        $proxies = array_values(array_unique(array_filter([
            '127.0.0.1', '::1',
            $_SERVER['SERVER_ADDR'] ?? null,
            ($ip = gethostbyname($apiHost)) !== $apiHost ? $ip : null,
            ($ip = gethostbyname($siteHost)) !== $siteHost ? $ip : null,
        ])));

        $mail = $site['mail'] === 'smtp'
            ? [
                'MAIL_MAILER' => 'smtp',
                'MAIL_HOST' => $site['mail_host'],
                'MAIL_PORT' => $site['mail_port'],
                'MAIL_USERNAME' => $site['mail_username'],
                'MAIL_PASSWORD' => $site['mail_password'],
                'MAIL_ENCRYPTION' => $site['mail_encryption'] === 'none' ? null : $site['mail_encryption'],
                'MAIL_FROM_ADDRESS' => $site['mail_from'],
            ]
            : ['MAIL_MAILER' => 'log', 'MAIL_FROM_ADDRESS' => $site['admin_email']];

        EnvFile::fromTemplate($this->api.'/.env.example')->set([
            'APP_NAME' => $site['company_name'],
            'APP_ENV' => 'production',
            'APP_KEY' => $appKey,
            'APP_DEBUG' => false,
            'APP_URL' => $site['api_url'],
            'APP_TIMEZONE' => $site['timezone'],
            'LOG_LEVEL' => 'warning',
            'DB_CONNECTION' => 'mysql',
            'DB_HOST' => $db['host'],
            'DB_PORT' => $db['port'],
            'DB_DATABASE' => $db['database'],
            'DB_USERNAME' => $db['username'],
            'DB_PASSWORD' => $db['password'],
            'FRONTEND_URL' => $site['site_url'],
            'SANCTUM_STATEFUL_DOMAINS' => $siteHost,
            'TRUSTED_PROXIES' => implode(',', $proxies),
            'MAIL_FROM_NAME' => $site['company_name'],
            'INTERNAL_TOKEN' => $internal,
        ] + $mail)->write($this->config.'/api.env');

        EnvFile::fromTemplate(null)->set([
            'API_BASE_URL' => $site['api_url'],
            'ASSET_ORIGIN' => $site['api_url'],
            'SITE_URL' => $site['site_url'],
            // The company, for what the website decides before it reads the
            // settings: the title template, page descriptions (lib/brand.ts).
            'SITE_NAME' => $site['company_name'],
            'CANONICAL_HOST' => $siteHost.((string) parse_url($site['site_url'], PHP_URL_PORT) !== '' ? ':'.parse_url($site['site_url'], PHP_URL_PORT) : ''),
            'INTERNAL_TOKEN' => $internal,
        ])->write($this->config.'/web.env');

        $this->save([
            'secrets' => ['app_key' => $appKey, 'internal_token' => $internal],
            'steps' => ['config' => true],
        ]);

        return ['trusted_proxies' => $proxies];
    }

    /* ---------------------------------------------------- 5. the schema */

    /** @return array<string, mixed> */
    private function migrate(): array
    {
        $this->need($this->state(), ['config']);
        @set_time_limit(60);
        $this->laravel();

        $result = SlicedMigrator::run(self::SLICE_SECONDS);

        if ($result['done']) {
            $this->save(['steps' => ['migrate' => true]]);
        }

        return $result;
    }

    /* ------------------------------------------ 6. content and the admin */

    /** @return array<string, mixed> */
    private function seed(): array
    {
        $s = $this->state();
        $this->need($s, ['migrate']);
        @set_time_limit(120);
        $this->laravel();

        $site = $s['site'];

        if (empty($s['steps']['seed_install'])) {
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\InstallSeeder', '--force' => true]);
            // A fresh install has nothing to upgrade from: every one-off step
            // is already true of it, and the first update must not replay them.
            UpgradeSteps::markAllDone($this->version());
            $this->save(['steps' => ['seed_install' => true]]);
        }

        if (empty($s['steps']['admin'])) {
            // The hash is kept as it is: the model's `hashed` cast recognises
            // a bcrypt hash and does not hash it twice.
            FirstAdmin::create($site['admin_name'], $site['admin_email'], $site['admin_password_hash'], $site['admin_phone']);

            // The seeded defaults name the company this product was first
            // built for; every one of them becomes this customer's.
            Branding::apply($site['company_name'], $site['admin_email'], $site['site_url']);
            $this->save(['steps' => ['admin' => true]]);
        }

        if (! empty($site['demo']) && empty($s['steps']['seed_demo'])) {
            Artisan::call('db:seed', ['--class' => 'Database\\Seeders\\DemoSeeder', '--force' => true]);
            $this->save(['steps' => ['seed_demo' => true]]);
        }

        $this->save(['steps' => ['seed' => true]]);

        return ['demo' => ! empty($site['demo'])];
    }

    /* -------------------------------------------- 7. the API, finished */

    /** @return array<string, mixed> */
    private function finaliseApi(): array
    {
        $this->need($this->state(), ['seed']);
        @set_time_limit(60);
        $this->laravel();

        // A relative link, so it survives the folder being renamed by an
        // update — made directly, as the updater makes it: `storage:link
        // --relative` needs a package this release does not ship.
        $link = $this->api.'/public/storage';
        Updater::linkStorage($this->home);

        Artisan::call('optimize');

        $this->save(['steps' => ['finalise' => true]]);

        return ['storage_link' => is_link($link) || is_dir($link)];
    }

    /* ---------------------------------------- 8. connecting the website */

    /** @return array<string, mixed> */
    private function website(): array
    {
        $s = $this->state();
        $this->need($s, ['finalise']);

        $expected = $s['site']['site_url'];
        $health = $this->http('GET', $expected.'/api/health');
        $body = is_array($health['json']) ? $health['json'] : [];

        $ok = $health['status'] === 200
            && ($body['site_url'] ?? null) === $expected
            && ($body['api']['reachable'] ?? false) === true;

        if ($ok) {
            $this->save(['steps' => ['website' => true]]);
        }

        return [
            'connected' => $ok,
            'status' => $health['status'],
            'reported' => $body,
            'error' => $health['error'],
            'node' => [
                'app_root' => basename($this->home).'/web',
                'app_root_full' => $this->home.'/web',
                'startup_file' => 'start.js',
                'node_version' => '22',
                'url' => $expected,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function warm(int $from): array
    {
        $s = $this->state();
        $this->need($s, ['website']);
        $site = $s['site']['site_url'];

        if ($from === 0) {
            // Before the purge: it can only expire pages older than itself, and
            // a zip unpacked on a server behind the build machine's clock
            // leaves the prerendered ones dated in the future.
            Updater::agePrerenderedPages($this->home);

            $purge = $this->http('POST', $site.'/api/internal/revalidate', $s['secrets']['internal_token']);

            if ($purge['status'] !== 200) {
                throw new Refusal('The website refused to refresh its pages ('.($purge['status'] ?: $purge['error']).'). Restart the Node.js app in the hosting panel and try again.', 502);
            }
        }

        $results = [];
        $started = microtime(true);
        $i = $from;
        $pages = count(self::WARM);

        // Two passes over the list. The first request after a purge is still
        // answered from the old copy while the new one renders behind it, so
        // the first pass only starts every page rendering and the second —
        // seconds later — reads what visitors will get.
        for (; $i < 2 * $pages && microtime(true) - $started < self::SLICE_SECONDS; $i++) {
            $path = self::WARM[$i % $pages];
            $res = $this->http('GET', $site.$path);

            if ($i >= $pages) {
                $results[] = [
                    'path' => $path,
                    'status' => $res['status'],
                    'stale' => is_string($res['body']) && stripos($res['body'], 'could not load') !== false,
                ];
            }
        }

        $done = $i >= 2 * $pages;
        if ($done) {
            $this->save(['steps' => ['warm' => true]]);
        }

        return ['next' => $i, 'total' => 2 * $pages, 'done' => $done, 'pages' => $results];
    }

    /* ------------------------------------------------- 9. the scheduler */

    /** @return array<string, mixed> */
    private function scheduler(): array
    {
        $this->laravel();
        $pulse = QueueHealth::scheduler();

        // The same line System → Status shows afterwards: one definition
        // (`SchedulerSetup`), so the wizard and the console cannot disagree
        // about where this server keeps its command-line PHP.
        $setup = \App\Support\System\SchedulerSetup::report();

        return [
            'running' => (bool) ($pulse['running'] ?? false),
            'cron' => $setup['cron'] ?? $setup['command'],
        ];
    }

    /* --------------------------------------------------------- 10. done */

    /** @return array<string, mixed> */
    private function finish(): array
    {
        $s = $this->state();
        $this->need($s, ['warm']);

        file_put_contents($this->config.'/install.json', json_encode([
            'installed_at' => gmdate('c'),
            'installed_version' => $this->version(),
            'version' => $this->version(),
            'demo' => ! empty($s['site']['demo']),
        ], JSON_PRETTY_PRINT)."\n");

        @unlink($this->keyFile());
        @unlink($this->stateFile());

        return ['console' => $s['site']['site_url'].'/admin/login', 'site' => $s['site']['site_url']];
    }

    /* ---------------------------------------------------------- helpers */

    /** @param array<string, mixed> $state @param list<string> $steps */
    private function need(array $state, array $steps): void
    {
        foreach ($steps as $step) {
            if (empty($state['steps'][$step])) {
                throw new Refusal("Finish the earlier steps first ({$step}).", 409);
            }
        }
    }

    private bool $booted = false;

    /** Boot the API in this process, reading the settings the wizard just wrote. */
    private function laravel(): void
    {
        if ($this->booted) {
            return;
        }

        require_once $this->api.'/vendor/autoload.php';
        $app = require $this->api.'/bootstrap/app.php';
        $app->make(Kernel::class)->bootstrap();
        $this->booted = true;
    }

    /** @return array{status: int, body: ?string, json: mixed, error: ?string} */
    private function http(string $method, string $url, ?string $bearer = null): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_HTTPHEADER => array_filter([
                'Accept: application/json, text/html',
                $bearer !== null ? 'Authorization: Bearer '.$bearer : null,
                $method === 'POST' ? 'Content-Length: 0' : null,
            ]),
        ]);

        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = $body === false ? curl_error($ch) : null;
        curl_close($ch);

        return [
            'status' => $status,
            'body' => is_string($body) ? $body : null,
            'json' => is_string($body) ? json_decode($body, true) : null,
            'error' => $error,
        ];
    }
}

/** A refusal the page shows as it is, with the field it is about. */
final class Refusal extends \RuntimeException
{
    /** @param array<string, string> $errors */
    public function __construct(string $message, public readonly int $status = 422, public readonly array $errors = [])
    {
        parent::__construct($message);
    }
}
