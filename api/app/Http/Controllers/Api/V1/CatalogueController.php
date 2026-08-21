<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ProductCategoryResource;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\ProductCategory;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class CatalogueController extends Controller
{
    public function products(Request $request): AnonymousResourceCollection
    {
        $products = Product::query()
            ->published()
            ->with(['brand', 'category', 'seo'])
            ->when($request->filled('category'), fn ($q) => $q->whereHas(
                'category', fn ($c) => $c->where('slug', $request->string('category'))
            ))
            ->when($request->filled('brand'), fn ($q) => $q->whereHas(
                'brand', fn ($b) => $b->where('slug', $request->string('brand'))
            ))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('short_description', 'like', "%{$term}%"));
            })
            ->orderByDesc('is_featured')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 24), 60))
            ->withQueryString();

        return ProductResource::collection($products);
    }

    public function product(Product $product): JsonResource
    {
        abort_unless($product->status?->value === 'published', 404);

        $product->load(['brand', 'category', 'solutions', 'relatedProducts.brand', 'faqs', 'seo']);

        return new ProductResource($product);
    }

    public function categories(): AnonymousResourceCollection
    {
        $categories = ProductCategory::query()
            ->whereNull('parent_id')
            ->with(['children', 'seo'])
            ->orderBy('sort_order')
            ->get();

        return ProductCategoryResource::collection($categories);
    }

    public function category(ProductCategory $category): JsonResource
    {
        $category->load(['children', 'seo']);

        return new ProductCategoryResource($category);
    }
}
