<?php

namespace App\Support\WordPress\Steps;

use App\Models\Brand;
use App\Support\WordPress\Context;
use App\Support\WordPress\Outcome;
use Illuminate\Support\Str;

/**
 * WooCommerce Brands (built in since WooCommerce 9.6, a plugin before), as
 * the catalogue's brands. A brand here with the same slug or name is taken
 * over — the catalogue already carries twenty-odd manufacturers with real
 * logos, and a second "Cisco" beside the first would split the products.
 */
class BrandsStep extends Step
{
    public function key(): string
    {
        return 'brands';
    }

    public function label(): string
    {
        return 'Brands';
    }

    public function section(): string
    {
        return 'catalogue';
    }

    public function mapType(): ?string
    {
        return 'brand';
    }

    public function plan(Context $ctx, array $record): Outcome
    {
        $name = self::raw($record['name'] ?? '');

        if ($name === '') {
            return Outcome::skip('(unnamed)', 'Has no name.');
        }

        $slug = self::slug($record['slug'] ?? null, $name);
        $existing = $ctx->map->model('brand', $record['id'], Brand::class)
            ?? Brand::query()->where('slug', $slug)->orWhere('name', $name)->first();

        return Outcome::upsert($existing !== null, $name, ['slug' => $slug, 'existing' => $existing?->id]);
    }

    public function media(Context $ctx, array $record): array
    {
        return ! empty($record['image']['src']) ? [(string) $record['image']['src']] : [];
    }

    public function write(Context $ctx, array $record, Outcome $outcome): void
    {
        $brand = $outcome->data['existing'] ? Brand::query()->find($outcome->data['existing']) : null;

        if ($brand === null) {
            $brand = Brand::query()->create([
                'name' => Str::limit($outcome->label, 190, ''),
                'slug' => $outcome->data['slug'],
                'description' => self::text($record['description'] ?? '', 1000) ?: null,
                'logo_path' => $ctx->media($record['image']['src'] ?? null, $outcome->label),
            ]);
        }

        $ctx->map->put('brand', $record['id'], $brand);
    }
}
