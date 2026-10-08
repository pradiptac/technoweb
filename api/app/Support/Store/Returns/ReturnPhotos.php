<?php

namespace App\Support\Store\Returns;

use App\Models\OrderReturn;
use App\Models\OrderReturnPhoto;
use App\Support\Forms\FormUploads;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The photographs a customer sends with a return (docs/store.md "Returns").
 *
 * An upload from somebody who is not staff — a guest holding an order link
 * can send one — so it follows the form uploads' four rules: the **private**
 * disk, a **hashed name** with the extension the bytes earn, **checked by
 * content** before it gets here (`ReturnRequest` holds each to an image by
 * extension and by sniffed type), and **deleted with its return**. Never
 * attached to an email; staff read one through the console's route.
 */
class ReturnPhotos
{
    public const DISK = 'local';

    public const FOLDER = 'returns';

    public const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    public const MAX_PHOTOS = 4;

    /** Five megabytes: a phone photograph, not a video. */
    public const MAX_KB = 5120;

    /**
     * @param  list<UploadedFile>  $files  already validated
     * @return list<OrderReturnPhoto>
     */
    public static function store(OrderReturn $return, array $files): array
    {
        $stored = [];

        try {
            foreach ($files as $file) {
                $path = $file->store(self::FOLDER.'/'.$return->id, self::DISK);

                if ($path === false) {
                    throw new \RuntimeException('The photograph could not be written.');
                }

                $stored[] = $return->photos()->create([
                    'path' => $path,
                    'name' => FormUploads::displayName($file),
                    'size' => (int) $file->getSize(),
                    // The type the bytes sniff as, never the client's header.
                    'mime' => $file->getMimeType(),
                ]);
            }
        } catch (\Throwable $e) {
            // Two photographs, the second fails: the first must not be left
            // on disk belonging to a return that is about to be rolled back.
            foreach ($stored as $photo) {
                self::discard($photo->path);
            }

            throw $e;
        }

        return $stored;
    }

    public static function discard(?string $path): void
    {
        if (is_string($path) && str_starts_with($path, self::FOLDER.'/')) {
            Storage::disk(self::DISK)->delete($path);
        }
    }

    /** The return's own folder, once its files have gone — an empty directory is all that is left. */
    public static function forget(OrderReturn $return): void
    {
        Storage::disk(self::DISK)->deleteDirectory(self::FOLDER.'/'.$return->id);
    }

    public static function exists(OrderReturnPhoto $photo): bool
    {
        return Storage::disk(self::DISK)->exists($photo->path);
    }

    /** Always an attachment: a stranger's upload is never rendered in this origin. */
    public static function stream(OrderReturnPhoto $photo): StreamedResponse
    {
        return Storage::disk(self::DISK)->download($photo->path, $photo->name, [
            'Content-Type' => $photo->mime ?: 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, no-store',
        ]);
    }
}
