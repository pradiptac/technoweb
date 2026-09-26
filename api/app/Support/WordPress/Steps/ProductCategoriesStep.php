<?php

namespace App\Support\WordPress\Steps;

use App\Models\StoreCategory;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * WooCommerce product categories, as store categories. The store's are flat,
 * so a sub-category keeps its own name and loses its parent (said, per
 * category). One with the same slug here is taken over rather than
 * duplicated. WooCommerce's catch-all "Uncategorized" is not brought across:
 * a product in it simply arrives with no category.
 */
class ProductCategoriesStep extends Step
{
    public function key(): string
    {
        return 'product_categories';
    }

    public function label(): string
    {
        return 'Shop categories';
    }

    public function section(): string
    {
        return 'catalogue';
    }

    public function mapType(): ?string
    {
        return 'product_cat';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = self::raw($record['name'] ?? '');
        $slug = self::slug($record['slug'] ?? null, $name);

        if ($name === '' || $slug === 'uncategorized') {
            return Outcome::skip($name ?: '(unnamed)', 'WooCommerce\'s catch-all category; its products arrive with none.');
        }

        $existing = $ctx->map->model('product_cat', $record['id'], StoreCategory::class)
            ?? StoreCategory::query()->where('slug', $slug)->first();
        $outcome = Outcome::upsert($existing !== null, $name, ['slug' => $slug, 'existing' => $existing?->id]);

        if (! empty($record['parent'])) {
            $outcome->warn('Was a sub-category; the shop\'s categories are flat.');
        }

        return $outcome;
    }

    public function media(Context $ctx, array $record): array
    {
        return ! empty($record['image']['src']) ? [(string) $record['image']['src']] : [];
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $category = $outcome->data['existing'] ? StoreCategory::query()->find($outcome->data['existing']) : null;

        if ($category === null) {
            $category = StoreCategory::query()->create([
                'name' => Str::limit($outcome->label, 190, ''),
                'slug' => $outcome->data['slug'],
                'description' => self::text($record['description'] ?? '', 1000) ?: null,
                'image_path' => $ctx->media($record['image']['src'] ?? null, $outcome->label),
                'is_active' => true,
                'sort_order' => (int) ($record['menu_order'] ?? 0),
            ]);
        }

        $ctx->map->put('product_cat', $record['id'], $category, $this->link($ctx, $record));
    }

    /** WooCommerce's category address; its REST record carries no permalink. */
    private function link(Context $ctx, array $record): string
    {
        $base = trim((string) $ctx->wc('woocommerce_permalinks_category_base', ''), '/') ?: 'product-category';

        return rtrim((string) ($ctx->site()['url'] ?? $ctx->import->site_url), '/').'/'.$base.'/'.rawurldecode((string) $record['slug']).'/';
    }
}
