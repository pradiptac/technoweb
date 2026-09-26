<?php

namespace App\Support\WordPress\Steps;

use App\Models\BlogCategory;
use App\Models\BlogPost;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use Illuminate\Database\Eloquent\Model;

/**
 * Blog posts: excerpt, featured image, author (by address, when the author
 * has a staff account here), sticky → featured, open comments, categories.
 * Tags have nowhere to go — the blog has categories only — and each post
 * that had some says so.
 */
class PostsStep extends ContentStep
{
    public function key(): string
    {
        return 'posts';
    }

    public function label(): string
    {
        return 'Blog posts';
    }

    public function section(): string
    {
        return 'content';
    }

    public function mapType(): ?string
    {
        return 'post';
    }

    protected function model(): string
    {
        return BlogPost::class;
    }

    protected function keepsFeaturedImage(): bool
    {
        return true;
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $outcome = parent::plan($ctx, $record);

        if (! $outcome->writes()) {
            return $outcome;
        }

        if (! empty($record['tags'])) {
            $outcome->warn('Had tags, which are not kept: the blog has categories only.');
        }

        $author = (int) ($record['author'] ?? 0);

        if ($author !== 0 && $ctx->author($author) === null) {
            $outcome->warn('Its author has no staff account here with the same address, so it has none.');
        }

        return $outcome;
    }

    protected function fields(Context $ctx, array $record, Outcome $outcome): array
    {
        $excerpt = self::text($record['excerpt'] ?? '', 500);

        return [
            'excerpt' => $excerpt !== '' ? $excerpt : null,
            'cover_image_path' => $ctx->media($record['featured_media'] ?? null, $outcome->label),
            'author_id' => $ctx->author((int) ($record['author'] ?? 0)),
            'is_featured' => (bool) ($record['sticky'] ?? false),
            'comments_enabled' => ($record['comment_status'] ?? 'open') === 'open',
        ];
    }

    protected function afterWrite(Context $ctx, Model $model, array $record, Outcome $outcome): void
    {
        /** @var BlogPost $model */
        $ids = collect((array) ($record['categories'] ?? []))
            ->map(fn ($id) => $ctx->map->targetId('category', $id))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $model->categories()->syncWithoutDetaching(
            BlogCategory::query()->whereKey($ids)->pluck('id')->all(),
        );
    }
}
