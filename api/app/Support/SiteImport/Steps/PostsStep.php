<?php

namespace App\Support\SiteImport\Steps;

use App\Enums\PublishStatus;
use App\Models\BlogPost;
use App\Support\SiteImport\AiSections;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\PageKind;
use App\Support\SiteImport\Paths;
use App\Support\WordPress\Outcome;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use Throwable;

/**
 * The pages that are blog posts (`PageKind`) as **draft** `BlogPost`s: the
 * same sections as a page — `body_layout` is `sections` — with the written
 * body kept beside them (the text sections, joined, so the reading time, the
 * search and the switch back to a written body all work), the date from the
 * article's structured data, `article:published_time` or its `<time>`, the
 * cover from `og:image` and the excerpt from the meta description.
 *
 * Slugs drop the folder the old site kept its posts in (`/blog/my-post` →
 * `my-post`) because the post lives at `/blog/{slug}` here. The author is
 * not kept: a post here is written by a staff account, and the review says
 * so. The AI does not lay a post out: an article is prose.
 */
class PostsStep extends PagesStep
{
    private const FOLDERS = ['blog', 'news', 'article', 'articles', 'insights', 'press', 'story', 'stories', 'post', 'posts', 'journal'];

    public function key(): string
    {
        return 'posts';
    }

    public function label(): string
    {
        return 'Blog posts';
    }

    public function mapType(): ?string
    {
        return 'post';
    }

    protected function kind(): string
    {
        return PageKind::POST;
    }

    protected function modelClass(): string
    {
        return BlogPost::class;
    }

    protected function wantedSlug(string $path): string
    {
        $segments = explode('/', trim($path, '/'));

        if (count($segments) > 1 && in_array($segments[0], self::FOLDERS, true)) {
            array_shift($segments);
        }

        $slug = Str::slug(implode(' ', $segments));

        return $slug !== '' ? Str::limit($slug, 150, '') : Paths::slug($path);
    }

    protected function slugTaken(string $slug): bool
    {
        return BlogPost::query()->where('slug', $slug)->exists();
    }

    protected function assistant(Context $ctx): ?AiSections
    {
        return null;
    }

    protected function warnings(Context $ctx, Outcome $outcome, array $read): void
    {
        if (! empty($read['facts']['author'])) {
            $outcome->warn('Its author is not kept: a post here is written by a staff account.');
        }
    }

    /** @param  BlogPost  $model */
    protected function fill(Context $ctx, Model $model, array $read, string $label, array $blocks, array $data): void
    {
        $body = self::words($blocks);

        $model->fill([
            'title' => Str::limit((string) $data['title'], 250, ''),
            'excerpt' => $read['description'] !== '' ? Str::limit($read['description'], 500, '') : null,
            'body' => $body !== '' ? $body : null,
            'cover_image_path' => $read['og_image'] !== null ? $ctx->media($read['og_image'], $label) : null,
            'published_at' => self::date((array) $read['facts']),
            'body_layout' => 'sections',
            'blocks' => $blocks,
            'status' => $model->exists ? $model->status : PublishStatus::Draft,
        ]);

        if (! $model->exists) {
            $model->slug = $data['slug'];
        }
    }

    /**
     * The text sections' markup, joined.
     *
     * @param  array<int, array<string, mixed>>  $blocks
     */
    public static function words(array $blocks): string
    {
        return implode("\n", array_filter(array_map(
            fn (array $b) => ($b['type'] ?? null) === 'rich_text' ? (string) ($b['data']['body'] ?? '') : '',
            $blocks,
        )));
    }

    /**
     * When it was published: structured data, the meta tag, or the first
     * `<time>`; null when none of them reads as a date.
     *
     * @param  array<string, mixed>  $facts
     */
    private static function date(array $facts): ?Carbon
    {
        foreach ([$facts['published'] ?? null, $facts['time'] ?? null] as $value) {
            if (! is_string($value) || trim($value) === '') {
                continue;
            }

            try {
                $date = Carbon::parse($value);

                if ($date->year >= 1990 && $date->year <= (int) now()->year + 5) {
                    return $date;
                }
            } catch (Throwable) {
                // Not a date: try the next.
            }
        }

        return null;
    }
}
