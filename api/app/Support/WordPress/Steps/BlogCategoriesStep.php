<?php

namespace App\Support\WordPress\Steps;

use App\Models\BlogCategory;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * Post categories. The blog's categories are flat, so a nested one keeps its
 * own name and loses its place in the tree (said, per category). A category
 * here with the same slug is taken over rather than duplicated — the blog
 * almost always already has a "News". WordPress's catch-all "Uncategorized"
 * is not brought across; a post in it simply arrives with no category.
 */
class BlogCategoriesStep extends Step
{
    public function key(): string
    {
        return 'categories';
    }

    public function label(): string
    {
        return 'Blog categories';
    }

    public function section(): string
    {
        return 'content';
    }

    public function mapType(): ?string
    {
        return 'category';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = self::raw($record['name'] ?? '');

        if ($name === '') {
            return Outcome::skip('(unnamed)', 'Has no name.');
        }

        $slug = self::slug($record['slug'] ?? null, $name);

        if ($slug === 'uncategorized') {
            return Outcome::skip($name, 'WordPress\'s catch-all category; its posts arrive with none.');
        }
        $existing = $ctx->map->model('category', $record['id'], BlogCategory::class)
            ?? BlogCategory::query()->where('slug', $slug)->first();

        $outcome = Outcome::upsert($existing !== null, $name, ['slug' => $slug, 'existing' => $existing?->id]);

        if (! empty($record['parent']) && ($parent = $ctx->record('categories', $record['parent']))) {
            $outcome->warn('Nested under another category; categories here are flat.');
            $outcome->data['parent_name'] = self::raw($parent['name'] ?? '');
        }

        return $outcome;
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $category = $outcome->data['existing'] ? BlogCategory::query()->find($outcome->data['existing']) : null;

        if ($category === null) {
            $category = BlogCategory::query()->create([
                'name' => Str::limit($outcome->label, 190, ''),
                'slug' => $outcome->data['slug'],
                'description' => Str::limit(self::text($record['description'] ?? ''), 500, '') ?: null,
            ]);
        }

        $ctx->map->put('category', $record['id'], $category, $record['link'] ?? null);
    }
}
