<?php

namespace App\Support\System;

/**
 * Which release this code is.
 *
 * A release zip carries `api/version.json`, written by `release/build.mjs`
 * from `web/src/lib/version.ts` — the one place the version is set — along
 * with the commit and the moment it was built. A development checkout has no
 * such file, so the version is read out of that TypeScript constant instead,
 * which keeps the console, the updater and the release builder agreeing about
 * one number without a second copy of it anywhere.
 */
final class AppVersion
{
    /** @var array{version: string, commit: ?string, built_at: ?string}|null */
    private static ?array $cached = null;

    /** @return array{version: string, commit: ?string, built_at: ?string} */
    public static function read(): array
    {
        if (self::$cached !== null) {
            return self::$cached;
        }

        $file = base_path('version.json');

        if (is_file($file)) {
            $data = json_decode((string) file_get_contents($file), true);

            if (is_array($data) && is_string($data['version'] ?? null)) {
                return self::$cached = [
                    'version' => $data['version'],
                    'commit' => is_string($data['commit'] ?? null) ? $data['commit'] : null,
                    'built_at' => is_string($data['built_at'] ?? null) ? $data['built_at'] : null,
                ];
            }
        }

        $source = @file_get_contents(base_path('../web/src/lib/version.ts'));
        $version = is_string($source) && preg_match('/APP_VERSION\s*=\s*"([^"]+)"/', $source, $m) ? $m[1] : '0.0.0-dev';

        return self::$cached = ['version' => $version, 'commit' => null, 'built_at' => null];
    }

    public static function current(): string
    {
        return self::read()['version'];
    }
}
