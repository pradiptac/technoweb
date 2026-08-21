<?php

namespace Database\Seeders\Concerns;

use App\Models\Media;
use App\Models\User;
use App\Support\PlaceholderImage;
use Illuminate\Support\Facades\Storage;

/**
 * Writes generated placeholder artwork to the public disk and records it in
 * the media library, so seeded imagery behaves exactly like an editor upload:
 * it is browsable, replaceable and deletable from the CMS.
 *
 * Idempotent — re-seeding overwrites the same paths rather than piling up
 * duplicates.
 */
trait SeedsPlaceholderImages
{
    protected function bannerImage(string $title, string $kicker, string $key): string
    {
        return $this->store(PlaceholderImage::banner($title, $kicker), $title, $key);
    }

    protected function tileImage(string $title, string $kicker, string $key): string
    {
        return $this->store(PlaceholderImage::tile($title, $kicker), $title, $key);
    }

    /** @return string the stored path, for cover_image_path and friends */
    private function store(string $svg, string $title, string $key): string
    {
        $path = "media/seed/{$key}.svg";

        Storage::disk('public')->put($path, $svg);

        Media::updateOrCreate(['path' => $path], [
            'uploaded_by' => User::orderBy('id')->value('id'),
            'disk' => 'public',
            'filename' => basename($key).'.svg',
            'mime' => 'image/svg+xml',
            'size' => strlen($svg),
            // SVG has no intrinsic pixel size; the viewBox scales to fit.
            'width' => null,
            'height' => null,
            'alt_text' => $title,
        ]);

        return $path;
    }
}
