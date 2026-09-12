<?php

namespace Database\Seeders;

use App\Enums\PublishStatus;
use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Twenty published articles and one draft, from `data/blog-posts.php`, so
 * the blog opens as a blog rather than as two stubs and a draft — the hero
 * has four to choose from, the list paginates, and "you may have missed" has
 * something left over to show.
 *
 * **Creates, and never overwrites a written post.** The first cut of this
 * seeder used `updateOrCreate` on the whole row, which re-runs the seeder as
 * a way of deleting whatever an editor has changed since — the rule
 * `DemoContentSeeder` follows for services and industries, applied here. A
 * post is written in full only when it does not exist, or when what exists
 * is a stub: under a hundred words of body, which is what the two original
 * placeholders were and what nobody has ever published on purpose.
 *
 * Categories are attached on the same terms — with the post, never re-synced
 * over a filing somebody has changed. The seven categories themselves are
 * `firstOrCreate` on slug, so a renamed one keeps its name.
 *
 * Covers are not here at all. See the note in the data file.
 */
class BlogPostSeeder extends Seeder
{
    /** A body this short has never been an article; it is the placeholder this seeder replaces. */
    private const STUB_WORDS = 100;

    public function run(): void
    {
        $author = User::where('is_active', true)->orderBy('id')->first();
        $data = require __DIR__.'/data/blog-posts.php';

        $categories = [];
        foreach ($data['categories'] as $row) {
            $categories[$row['slug']] = BlogCategory::firstOrCreate(['slug' => $row['slug']], $row);
        }

        foreach ($data['posts'] as $row) {
            $post = BlogPost::where('slug', $row['slug'])->first();

            if ($post && str_word_count(strip_tags((string) $post->body)) >= self::STUB_WORDS) {
                continue;
            }

            $attributes = [
                'title' => $row['title'],
                'excerpt' => $row['excerpt'],
                'body' => $row['body'],
                'published_at' => $row['published_at'],
                'status' => $row['published_at'] ? PublishStatus::Published : PublishStatus::Draft,
                'is_featured' => $row['featured'],
            ];

            if ($post) {
                $post->fill($attributes)->save();
            } else {
                $post = BlogPost::create($attributes + ['slug' => $row['slug'], 'author_id' => $author?->id]);
            }

            $post->categories()->sync(
                collect($row['categories'])->map(fn (string $slug) => $categories[$slug]->id)->all(),
            );
        }
    }
}
