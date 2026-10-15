<?php

namespace App\Support\Forms;

use App\Models\Form;
use App\Models\FormSubmission;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

/**
 * Where a form's uploads go, and how.
 *
 * The second unauthenticated upload in the product, after the careers form's
 * CV, and built to the same four rules:
 *
 *   - **The private disk.** Nothing under `form-uploads/` has a URL. The only
 *     way to a file is `GET /admin/forms/{id}/submissions/{sid}/files/{field}`,
 *     which checks a role first.
 *   - **A hashed name with the extension the bytes earn.** `store()` names the
 *     file from random bytes and takes its extension from the sniffed type,
 *     never from what the visitor called it — so nothing a stranger typed is
 *     ever a path on this server.
 *   - **Checked by content before it gets here.** `FormValidator` has already
 *     held the file to its field's extensions *and* to the type its bytes
 *     sniff as; this class is handed only what passed.
 *   - **Deleted with its submission** (`FormSubmission`'s `deleting` hook),
 *     and never attached to an email.
 *
 * The original filename is kept for two things only: the download's
 * `Content-Disposition`, and `data[field]`, so the notification and the
 * export have something to print.
 */
class FormUploads
{
    public const FOLDER = 'form-uploads';

    /**
     * @param  array<string, UploadedFile>  $uploads  by field name, already validated
     * @return array<string, array{path: string, name: string, size: int, mime: string|null}>
     */
    public static function store(Form $form, array $uploads): array
    {
        $stored = [];

        try {
            foreach ($uploads as $field => $file) {
                $path = $file->store(self::FOLDER.'/'.$form->id, FormSubmission::DISK);

                if ($path === false) {
                    throw new \RuntimeException('The upload could not be written.');
                }

                $stored[$field] = [
                    'path' => $path,
                    'name' => self::displayName($file),
                    'size' => (int) $file->getSize(),
                    // The type the bytes sniff as, never the client's
                    // `Content-Type` — the rule the media library's replace
                    // had to be taught.
                    'mime' => $file->getMimeType(),
                ];
            }
        } catch (\Throwable $e) {
            // Three files, the third fails: the first two must not be left
            // on disk belonging to no submission.
            self::discard($stored);

            throw $e;
        }

        return $stored;
    }

    /** @param  array<string, array{path: string}>  $stored */
    public static function discard(array $stored): void
    {
        foreach ($stored as $file) {
            Storage::disk(FormSubmission::DISK)->delete($file['path']);
        }
    }

    /**
     * The name the visitor gave the file, made safe to print and to send back.
     *
     * Only ever a label: the last path segment, control characters out,
     * capped. It is printed in an email, written to a CSV and returned in a
     * `Content-Disposition` header, and none of those wants a newline or a
     * directory in it.
     */
    public static function displayName(UploadedFile $file): string
    {
        $name = str_replace('\\', '/', $file->getClientOriginalName());
        $name = (string) preg_replace('/[\x00-\x1F\x7F"]+/u', '', basename($name));
        $name = trim(mb_substr($name, 0, 180));

        return $name !== '' && $name !== '.' && $name !== '..' ? $name : 'upload';
    }
}
