<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;

/**
 * An uploaded file named back to the server by the browser, between the dry
 * run and the commit.
 *
 * Both import wizards hand the stored path to the browser and take it back
 * on commit, so it is a caller-supplied filesystem path. The check was
 * `str_starts_with($file, 'store-imports/')` — and Flysystem collapses `..`,
 * so `store-imports/../newsletter-imports/mailbox-3.csv` passed, was read
 * with its rows echoed back in `problems[]`, and was deleted. So nothing of
 * the given path is used but its last segment: the directory is ours, and
 * the name must be a plain file name the upload could have produced.
 */
class ImportUpload
{
    /** The path on the private disk, or null when it is not one of ours or has gone. */
    public static function resolve(string $directory, string $given): ?string
    {
        $prefix = $directory.'/';

        if (! str_starts_with($given, $prefix)) {
            return null;
        }

        $name = substr($given, strlen($prefix));

        // One segment, no traversal, no hidden file, nothing but the
        // characters a stored upload's name is made of.
        if (! preg_match('/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/', $name) || str_contains($name, '..')) {
            return null;
        }

        $path = $prefix.$name;

        return Storage::disk('local')->exists($path) ? $path : null;
    }
}
