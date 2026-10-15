<?php

namespace Database\Seeders;

use App\Models\StoreProduct;
use Illuminate\Database\Seeder;

/**
 * Sample product videos (0.140.0, docs/store.md "Product videos row"), demo
 * only: the first three published shop products each get one YouTube video, so
 * the "shop the videos" row can be judged on a fresh demo install.
 *
 * **Every video is a placeholder and says so** — the title begins "Sample" and
 * the id is the one `SampleBuilderPageSeeder` already uses for its stand-in
 * video (Big Buck Bunny, © Blender Foundation, CC BY 3.0). Listed on the
 * must-not-ship list in CLAUDE.md; delete them before launch.
 *
 * Create-only: a product is touched only while its `videos` is empty, and
 * nothing is done at all once any shop product carries a video, so a re-seed
 * never puts a deleted sample back beside real ones. Saved with `saveQuietly()`
 * so the seeding fires no model hook (spec reindex, price-drop job, webhook)
 * for a column that affects none of them.
 */
class SampleProductVideoSeeder extends Seeder
{
    public function run(): void
    {
        if (StoreProduct::query()->withVideos()->exists()) {
            return;
        }

        $products = StoreProduct::query()->published()
            ->where(fn ($q) => $q->whereNull('videos')->orWhereRaw('JSON_LENGTH(videos) = 0'))
            ->orderBy('id')
            ->limit(3)
            ->get();

        foreach ($products as $product) {
            $product->videos = [[
                'kind' => 'youtube',
                'youtube_id' => 'aqz-KE-bpKQ',
                'title' => 'Sample video — replace it with a real one',
                'poster_path' => null,
            ]];
            $product->saveQuietly();
        }
    }
}
