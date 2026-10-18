<?php

namespace App\Support\Images;

use Illuminate\Support\Facades\Storage;

/**
 * A made picture waiting for the editor's choice (docs/ai-images.md): the
 * bytes and a sidecar on the private disk, named by a 64-hex token, the
 * maker's alone, for ten minutes. Nothing here has a public address.
 */
final class ImagePreviews
{
    public const MINUTES = 10;

    private const DIR = 'ai-images';

    /** @param array{prompt: string, style: string, shape: string, model: string, mime: string, width: int, height: int} $meta */
    public static function put(string $bytes, int $userId, array $meta): string
    {
        $token = bin2hex(random_bytes(32));
        $ext = self::ext($meta['mime']);
        $disk = Storage::disk('local');
        $disk->put(self::DIR."/{$token}.{$ext}", $bytes);
        $disk->put(self::DIR."/{$token}.json", (string) json_encode($meta + ['user_id' => $userId, 'ext' => $ext, 'created' => now()->timestamp]));

        return $token;
    }

    /** @return array{prompt: string, style: string, shape: string, model: string, mime: string, width: int, height: int, user_id: int, ext: string, created: int, path: string}|null */
    public static function find(string $token, int $userId): ?array
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }
        $disk = Storage::disk('local');
        $meta = json_decode((string) $disk->get(self::DIR."/{$token}.json"), true);
        if (! is_array($meta) || (int) ($meta['user_id'] ?? 0) !== $userId) {
            return null;
        }
        if ((int) ($meta['created'] ?? 0) < now()->subMinutes(self::MINUTES)->timestamp) {
            self::forget($token);

            return null;
        }
        $file = self::DIR."/{$token}.".($meta['ext'] ?? 'png');
        if (! $disk->exists($file)) {
            return null;
        }
        $meta['path'] = $disk->path($file);

        return $meta;
    }

    public static function forget(string $token): void
    {
        if (! preg_match('/^[a-f0-9]{64}$/', $token)) {
            return;
        }
        $disk = Storage::disk('local');
        foreach ($disk->files(self::DIR) as $file) {
            if (str_starts_with(basename($file), $token.'.')) {
                $disk->delete($file);
            }
        }
    }

    public static function prune(): int
    {
        $disk = Storage::disk('local');
        $gone = 0;
        foreach ($disk->files(self::DIR) as $file) {
            if (str_ends_with($file, '.json')) {
                $meta = json_decode((string) $disk->get($file), true);
                if ((int) ($meta['created'] ?? 0) < now()->subMinutes(self::MINUTES)->timestamp) {
                    self::forget(basename($file, '.json'));
                    $gone++;
                }
            }
        }

        return $gone;
    }

    public static function ext(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/webp' => 'webp',
            default => 'png',
        };
    }
}
