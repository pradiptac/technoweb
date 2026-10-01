<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Activity;
use App\Models\User;
use App\Support\Backups\Manifest;
use App\Support\System\AppVersion;
use App\Support\System\ReleasePackage;
use App\Support\System\Updater;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * System → Updates (docs/distribution.md).
 *
 * The screen lists the release zips waiting in the install's `updates/`
 * folder — put there by FTP or File Manager, or uploaded here in chunks,
 * because shared hosting's upload limit is usually a few megabytes and a
 * release is a hundred — checks each one's signature, and drives an update
 * one `step` at a time. Every refusal is a 422 with a sentence the person at
 * the screen can act on.
 */
class UpdateController extends Controller
{
    /** 1.5 MB: under the 2 MB `upload_max_filesize` cPanel ships by default. */
    public const CHUNK_BYTES = 1_572_864;

    public function index(): JsonResponse
    {
        $home = Updater::home();
        $installed = AppVersion::current();
        $ran = $this->ran();
        $packages = [];

        foreach (Updater::packages() as $path) {
            try {
                $packages[] = ReleasePackage::open($path)->summary($installed, $ran);
            } catch (RuntimeException $e) {
                $packages[] = ['file' => basename($path), 'size' => @filesize($path) ?: null, 'refusal' => $e->getMessage(), 'signed' => false];
            }
        }

        $history = Updater::history();

        return response()->json(['data' => [
            'installed' => AppVersion::read(),
            'updatable' => $home !== null,
            'packages_dir' => Updater::packagesDir(),
            'packages' => $packages,
            'run' => Updater::current(),
            'history' => array_slice($history, 0, 20),
            'rollback' => $home !== null && is_dir($home.'/api.prev') && ! Updater::inProgress()
                ? ['from' => $history[0]['to'] ?? $installed, 'to' => $history[0]['from'] ?? null, 'database' => (bool) ($history[0]['migrated'] ?? false)]
                : null,
            'chunk_bytes' => self::CHUNK_BYTES,
        ]]);
    }

    /**
     * One chunk of a zip being uploaded from the browser.
     *
     * Chunks arrive in order and are appended to `<name>.part`; the last one
     * renames it into place. An `index` of 0 starts the file again, so a
     * cancelled upload is simply begun afresh.
     */
    public function upload(Request $request): JsonResponse
    {
        $dir = Updater::packagesDir() ?? throw ValidationException::withMessages(['file' => 'This copy was not installed from a release.']);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9._-]+\.zip$/'],
            'index' => ['required', 'integer', 'min:0'],
            'total' => ['required', 'integer', 'min:1', 'max:2000'],
            'chunk' => ['required', 'file', 'max:'.(int) ceil(self::CHUNK_BYTES / 1024)],
        ]);

        if (! is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        $part = $dir.'/'.$data['name'].'.part';
        $bytes = (string) file_get_contents($data['chunk']->getRealPath());

        if (file_put_contents($part, $bytes, $data['index'] === 0 ? 0 : FILE_APPEND) === false) {
            throw ValidationException::withMessages(['file' => 'The updates folder is not writable.']);
        }

        $last = $data['total'] === $data['index'] + 1;

        if ($last) {
            rename($part, $dir.'/'.$data['name']);
        }

        return response()->json(['data' => ['received' => $data['index'] + 1, 'complete' => $last]]);
    }

    public function destroy(string $file): JsonResponse
    {
        try {
            @unlink(Updater::packagePath($file));
        } catch (RuntimeException $e) {
            throw ValidationException::withMessages(['file' => $e->getMessage()]);
        }

        return response()->json(null, 204);
    }

    public function apply(Request $request): JsonResponse
    {
        $data = $request->validate(['file' => ['required', 'string', 'max:120']]);

        return $this->attempt(function () use ($request, $data) {
            /** @var User $user */
            $user = $request->user();
            $run = Updater::start($data['file'], $user);
            $this->audit($request, 'update_started', ['from' => $run['from'], 'to' => $run['to']]);

            return $run;
        });
    }

    public function step(): JsonResponse
    {
        return $this->attempt(fn () => Updater::step());
    }

    /**
     * A step, authorised by the run's own key instead of a session
     * (`Updater::stepWithKey`): what the console calls while a rollback's
     * restore has the sign-in tables dropped. Outside `auth:sanctum` on
     * purpose, and a wrong or stale key is a 404 like any unknown route.
     */
    public function continue(Request $request): JsonResponse
    {
        try {
            return response()->json(['data' => Updater::stepWithKey((string) $request->header('X-Update-Key', ''))]);
        } catch (RuntimeException) {
            return response()->json(['message' => 'Not found.'], 404);
        }
    }

    public function retry(): JsonResponse
    {
        return $this->attempt(fn () => Updater::retry());
    }

    public function rollback(Request $request): JsonResponse
    {
        return $this->attempt(function () use ($request) {
            /** @var User $user */
            $user = $request->user();
            $run = Updater::rollback($user);
            $this->audit($request, 'update_rolled_back', ['to' => $run['from']]);

            return $run;
        });
    }

    public function abandon(): JsonResponse
    {
        return $this->attempt(function () {
            Updater::abandon();

            return null;
        });
    }

    /**
     * The two decisions worth a line in the activity log: starting an update
     * and rolling one back. Written here rather than by the `activity`
     * middleware's rules, which would record every progress step too.
     *
     * @param  array<string, string>  $context
     */
    private function audit(Request $request, string $action, array $context): void
    {
        $user = $request->user();

        if (! $user instanceof User) {
            return;
        }

        Activity::create([
            'user_id' => $user->id,
            'actor_name' => $user->name,
            'actor_email' => $user->email,
            'action' => $action,
            'context' => $context,
            'ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    /** @param callable(): (array<string, mixed>|null) $fn */
    private function attempt(callable $fn): JsonResponse
    {
        try {
            return response()->json(['data' => $fn()]);
        } catch (RuntimeException $e) {
            throw ValidationException::withMessages(['update' => $e->getMessage()]);
        }
    }

    /** @return list<string> */
    private function ran(): array
    {
        try {
            return DB::table('migrations')->pluck('migration')->all();
        } catch (\Throwable) {
            return [Manifest::databaseSchema()];
        }
    }
}
