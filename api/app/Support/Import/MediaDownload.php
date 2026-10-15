<?php

namespace App\Support\Import;

use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;

/**
 * A file from an address an import was pointed at, in a temporary file the
 * caller stores through `MediaUploader::storeFromPath()` and then removes.
 * Public hosts only, redirects checked hop by hop, capped at `$maxBytes`
 * (`SafeHttp`).
 */
final class MediaDownload
{
    /** @throws UnsafeUrl when the address may not be requested or the site did not answer 2xx */
    public static function toTemp(string $url, bool $allowPrivate, int $maxBytes): string
    {
        $tmp = (string) tempnam(sys_get_temp_dir(), 'imp');

        try {
            $response = SafeHttp::get($url, [
                'sink' => $tmp,
                'timeout' => 30,
                'max_bytes' => $maxBytes,
                'allow_private' => $allowPrivate,
                'allow_http' => true,
            ]);

            if (! $response->successful()) {
                throw new UnsafeUrl("The site answered {$response->status()}.");
            }

            // A client that ignored the sink (a faked one does) still handed back the body.
            if ((int) @filesize($tmp) === 0) {
                file_put_contents($tmp, $response->body());
            }
        } catch (\Throwable $e) {
            @unlink($tmp);

            throw $e;
        }

        return $tmp;
    }
}
