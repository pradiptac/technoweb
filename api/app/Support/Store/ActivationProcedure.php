<?php

namespace App\Support\Store;

use App\Models\Media;
use App\Models\Setting;
use App\Models\StoreProduct;
use Illuminate\Support\Facades\Storage;

/**
 * What to do with the code, resolved once.
 *
 * A code on its own is not a delivered product. The steps that turn it into a
 * working licence are the same words every time, so they are stored rather than
 * typed into a support reply per order — and they are resolved **here** because
 * three places need the same answer: the email sent when codes are issued, the
 * order page where the code is revealed, and the console preview. Three
 * resolutions of one question is how the newsletter's footer address ended up
 * being read three different ways.
 *
 * **The product overrides the default where it says something.** `?:`, not
 * `??` — a product edited and left blank stores an empty string, and `??` only
 * falls through on null, so a blank override would beat a perfectly good
 * default and the customer would receive no instructions at all. That exact bug
 * shipped once in the newsletter footer.
 *
 * And the left operand is guarded with `?? null`, because `?:` *reads* it: the
 * fix for the empty-string bug is what turned every "create from a template"
 * into "Undefined array key address" the last time this pattern was applied
 * without one.
 */
class ActivationProcedure
{
    /**
     * The procedure for one product, or the store's default.
     *
     * @return array{html: ?string, pdf_path: ?string, pdf_name: ?string, source: string}
     */
    public static function for(?StoreProduct $product): array
    {
        $html = (($product?->activation_procedure) ?? null)
            ?: (Setting::get('activation_procedure') ?? null)
            ?: null;

        $path = (($product?->activation_pdf_path) ?? null)
            ?: (Setting::get('activation_pdf_path') ?? null)
            ?: null;

        return [
            'html' => $html,
            'pdf_path' => $path,
            'pdf_name' => $path === null ? null : self::humanName($path),
            /*
             * Which of the two answered, so the console can say "using the
             * store default" on a product that has not overridden it. A field
             * rendering blank while the customer receives something is a screen
             * that lies about what will be sent.
             */
            'source' => match (true) {
                ($product?->activation_procedure ?: null) !== null => 'product',
                $html !== null => 'default',
                default => 'none',
            },
        ];
    }

    /** Whether there is anything at all to send. */
    public static function exists(?StoreProduct $product): bool
    {
        $resolved = self::for($product);

        return $resolved['html'] !== null || $resolved['pdf_path'] !== null;
    }

    /**
     * The stored filename is a hash, so the attachment needs the human one.
     *
     * Copied from the media row rather than joined at send time for the reason
     * the campaign attachment documents: without it the file lands in somebody's
     * downloads folder as `a8f3c1….pdf`. A path with no media row behind it
     * still gets a name — the extension is real even when the row is not.
     */
    public static function humanName(string $path): string
    {
        $media = Media::withTrashed()->where('path', $path)->first();

        return $media?->filename ?: basename($path);
    }

    /**
     * The absolute path of the PDF, or null if it is not on the disk.
     *
     * Null rather than an exception, and the caller sends the message without
     * it. A code delivery must not fail because somebody tidied the media
     * library: the money has arrived, the licence is issued, and the procedure
     * is worth sending without its attachment. Same rule the campaign
     * attachment follows.
     */
    public static function pdfFile(?string $path): ?string
    {
        if ($path === null || $path === '') {
            return null;
        }

        $disk = Storage::disk('public');

        return $disk->exists($path) ? $disk->path($path) : null;
    }
}
