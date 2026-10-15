<?php

namespace App\Support\SiteImport\Steps;

use App\Enums\PublishStatus;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Support\SiteImport\AiSections;
use App\Support\SiteImport\Context;
use App\Support\SiteImport\PageKind;
use App\Support\SiteImport\Paths;
use App\Support\SiteImport\Specs;
use App\Support\WordPress\Outcome;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * The pages that are products (`PageKind`) as **draft** catalogue `Product`s
 * — the marketing catalogue, which has no price, so none is read. The same
 * sections as a page (`body_layout` is `sections`), with the page's
 * specification table or definition list taken out of them and kept as the
 * product's own spec sheet (`Specs`, stored in the order given through the
 * `SpecSheet` cast), its pictures as the gallery (the share image first), the
 * meta description as the summary, and a SKU named in the page as the SKU.
 * Brand and category are not guessed: both are set in the catalogue.
 *
 * Slugs are the last part of the old address, because a product lives at
 * `/products/{slug}` here — and never one a product category already has,
 * since that URL would open the category. The AI does not lay a product out.
 */
class ProductsStep extends PagesStep
{
    /** Pictures in the gallery, the share image included. */
    private const GALLERY = 8;

    public function key(): string
    {
        return 'products';
    }

    public function label(): string
    {
        return 'Catalogue products';
    }

    public function mapType(): ?string
    {
        return 'product';
    }

    protected function kind(): string
    {
        return PageKind::PRODUCT;
    }

    protected function modelClass(): string
    {
        return Product::class;
    }

    protected function wantedSlug(string $path): string
    {
        $slug = Str::slug(basename($path));

        return $slug !== '' ? Str::limit($slug, 150, '') : Paths::slug($path);
    }

    protected function slugTaken(string $slug): bool
    {
        return Product::withTrashed()->where('slug', $slug)->exists() || ProductCategory::query()->where('slug', $slug)->exists();
    }

    protected function assistant(Context $ctx): ?AiSections
    {
        return null;
    }

    protected function prepare(array $read): array
    {
        $split = Specs::split($read['html']);
        $read['html'] = $split['html'];
        $read['specs'] = $split['specs'];

        return $read;
    }

    protected function warnings(Context $ctx, Outcome $outcome, array $read): void
    {
        if ($ctx->dryRun) {
            $ctx->report->notice('Products come across without prices (the catalogue has none), with no brand or category: set both in the catalogue.');
        }

        if ($read['specs'] === []) {
            $outcome->warn('No specification table was found, so the product has no spec sheet.');
        }
    }

    /**
     * The sections, and — in the same pass, so the dry run counts the files
     * the commit fetches — the pictures the gallery will hold.
     */
    protected function layout(Context $ctx, array $read, string $label, string $path, bool $writes): array
    {
        $made = parent::layout($ctx, $read, $label, $path, $writes);

        foreach ($this->gallery($read) as $src) {
            $writes ? $ctx->media($src, $label) : $ctx->planMedia($src, $label);
        }

        return $made;
    }

    /**
     * @param  array<string, mixed>  $read
     * @return list<string>
     */
    private function gallery(array $read): array
    {
        return array_slice(array_values(array_unique(array_filter([$read['og_image'], ...(array) ($read['facts']['images'] ?? [])]))), 0, self::GALLERY);
    }

    /** @param  Product  $model */
    protected function fill(Context $ctx, Model $model, array $read, string $label, array $blocks, array $data): void
    {
        $images = array_values(array_unique(array_filter(array_map(
            fn (string $src) => $ctx->media($src, $label),
            $this->gallery($read),
        ))));
        $words = PostsStep::words($blocks);
        $sku = trim((string) ($read['facts']['sku'] ?? ''));

        $model->fill([
            'name' => Str::limit((string) $data['title'], 250, ''),
            'short_description' => $read['description'] !== '' ? Str::limit($read['description'], 500, '') : null,
            'description' => $words !== '' ? $words : null,
            'specifications' => $read['specs'] !== [] ? $read['specs'] : null,
            'images' => $images !== [] ? $images : null,
            'sku' => $sku !== '' ? Str::limit($sku, 250, '') : null,
            'body_layout' => 'sections',
            'blocks' => $blocks,
            'status' => $model->exists ? $model->status : PublishStatus::Draft,
        ]);

        if (! $model->exists) {
            $model->slug = $data['slug'];
        }
    }
}
