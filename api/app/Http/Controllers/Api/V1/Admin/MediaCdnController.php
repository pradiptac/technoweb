<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\MediaUrl;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

/**
 * Proves the media CDN before it is switched on (0.124.0, docs/cdn.md).
 *
 * One real request: a file from the library, fetched through the saved CDN
 * address, and compared with the copy on this server's disk. It works with
 * the switch off — testing is what somebody does *before* sending visitors
 * there — and it answers in words a person can act on: the CDN's status, or
 * that what came back is not the file, which is what a pull zone pointed at
 * the wrong origin looks like.
 */
class MediaCdnController extends Controller
{
    public function test(): JsonResponse
    {
        $cdn = MediaUrl::clean((string) Setting::get('media_cdn_url', ''));

        if ($cdn === null) {
            throw ValidationException::withMessages(['cdn' => 'Save the CDN’s address first, then test it.']);
        }

        $file = MediaUrl::sample();

        if ($file === null) {
            throw ValidationException::withMessages(['cdn' => 'The media library is empty — upload a file, then test.']);
        }

        $url = $cdn.'/storage/'.$file->path;

        try {
            $response = SafeHttp::get($url, ['timeout' => 15, 'max_bytes' => 64 * 1024 * 1024]);
        } catch (UnsafeUrl $e) {
            throw ValidationException::withMessages(['cdn' => $e->getMessage()]);
        } catch (\Throwable $e) {
            throw ValidationException::withMessages(['cdn' => 'The CDN did not answer: '.$e->getMessage()]);
        }

        if (! $response->successful()) {
            throw ValidationException::withMessages([
                'cdn' => "The CDN answered {$response->status()} for {$file->filename}. Check that its pull zone's origin is this server's address.",
            ]);
        }

        $disk = Storage::disk($file->disk);
        $expected = $disk->exists($file->path) ? sha1((string) $disk->get($file->path)) : null;

        if ($expected !== null && sha1($response->body()) !== $expected) {
            throw ValidationException::withMessages([
                'cdn' => "The CDN answered, but not with {$file->filename} as this server holds it. Check its origin address, and that it is not rewriting files.",
            ]);
        }

        return response()->json(['data' => [
            'message' => "The CDN served {$file->filename} correctly.",
            'url' => $url,
        ]]);
    }
}
