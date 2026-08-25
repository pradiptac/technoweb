<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\Media;
use App\Models\Slider;
use Illuminate\Database\Seeder;

/**
 * The homepage hero carousel.
 *
 * Created empty of slides when there is nothing suitable in the library, which
 * is the point: the hero falls back to the NOC panel whenever this slider has
 * no slides, so a fresh install looks exactly as it did before anyone
 * configured anything.
 *
 * Where real photographs already exist they are used, so the feature is
 * visible on a seeded machine without inventing more placeholder content.
 */
class SliderSeeder extends Seeder
{
    public function run(): void
    {
        $slider = Slider::updateOrCreate(
            ['slug' => 'homepage-hero'],
            [
                'name' => 'Homepage hero',
                'status' => PublishStatus::Published,
                'autoplay' => true,
                'interval_ms' => 6000,
            ],
        );

        // Only rebuild the slides when there are none: re-running the seeder
        // must not wipe what an editor has arranged.
        if ($slider->slides()->exists()) {
            return;
        }

        $photos = Media::query()
            ->where('mime', 'like', 'image/%')
            ->where('mime', 'not like', '%svg%')
            ->orderBy('id')
            ->limit(3)
            ->get();

        foreach ($photos as $i => $photo) {
            $slider->slides()->create([
                'kind' => 'image',
                'media_path' => $photo->path,
                'alt_text' => $photo->alt_text,
                'sort_order' => $i,
            ]);
        }
    }
}
