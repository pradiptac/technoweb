<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\Backups\Manifest;
use App\Support\QueueHealth;
use App\Support\System\AppVersion;
use App\Support\System\Requirements;
use App\Support\System\SchedulerSetup;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

/**
 * System → Status: what is installed and whether its parts are working.
 *
 * The version and the two schemas are what the updater compares before it
 * offers anything: `code_schema` ahead of `database_schema` is an update whose
 * migrations have not run. The website is asked over HTTP (`/api/health` on
 * the Next side), because "the console loaded" proves only that the console's
 * own request got through, not that the public site is the same release.
 */
class SystemController extends Controller
{
    public function status(): JsonResponse
    {
        $storage = storage_path();

        return response()->json(['data' => [
            'version' => AppVersion::read(),
            'code_schema' => Manifest::codeSchema(),
            'database_schema' => Manifest::databaseSchema(),
            'installed' => self::installed(),
            'php' => [
                'version' => PHP_VERSION,
                'checks' => Requirements::check(),
                'max_execution_time' => (int) ini_get('max_execution_time'),
                'memory_limit' => (string) ini_get('memory_limit'),
            ],
            // Whether it is running, and — whether or not it is — the exact
            // command this server needs for it, worked out and tested here.
            'scheduler' => QueueHealth::scheduler() + ['setup' => SchedulerSetup::report()],
            'disk' => [
                'free' => @disk_free_space($storage) ?: null,
                'total' => @disk_total_space($storage) ?: null,
            ],
            'website' => self::website(),
        ]]);
    }

    /**
     * The installer's record, `config/install.json` beside the code, or null
     * on a development checkout.
     *
     * @return array<string, mixed>|null
     */
    private static function installed(): ?array
    {
        $home = require base_path('bootstrap/home.php');
        $file = is_string($home) ? $home.'/config/install.json' : null;

        if ($file === null || ! is_file($file)) {
            return null;
        }

        $data = json_decode((string) file_get_contents($file), true);

        return is_array($data)
            ? array_intersect_key($data, array_flip(['installed_at', 'installed_version', 'updated_at', 'version']))
            : null;
    }

    /**
     * The public website's own report, asked from here.
     *
     * `WEB_INTERNAL_URL` when the installer set one (the Node app reached
     * without going out to the internet and back), else the public address.
     *
     * @return array{reachable: bool, version: ?string, api: ?bool, url: string, error: ?string}
     */
    private static function website(): array
    {
        $base = rtrim((string) (config('app.web_internal_url') ?: config('app.frontend_url')), '/');

        try {
            $res = Http::timeout(4)->acceptJson()->get($base.'/api/health');
            $body = $res->json();

            return [
                'reachable' => $res->ok(),
                'version' => is_array($body) && is_string($body['version'] ?? null) ? $body['version'] : null,
                'api' => is_array($body) && is_array($body['api'] ?? null) ? (bool) ($body['api']['reachable'] ?? false) : null,
                'url' => $base,
                'error' => $res->ok() ? null : 'The website answered '.$res->status().'.',
            ];
        } catch (\Throwable) {
            return ['reachable' => false, 'version' => null, 'api' => null, 'url' => $base, 'error' => 'The website could not be reached from this server.'];
        }
    }
}
