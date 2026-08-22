<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBrandRequest;
use App\Http\Requests\UpdateBrandRequest;
use App\Http\Resources\Admin\BrandResource;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Brand CRUD. Behind auth:sanctum + role:content_manager.
 *
 * No SEO and no publish status — a brand is a filter facet on the product
 * listing, not a page of its own. WritesCmsEntities is deliberately not used
 * here; there is nothing for it to do.
 */
class BrandController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $brands = Brand::query()
            ->withCount('products')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where('name', 'like', "%{$term}%");
            })
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return BrandResource::collection($brands);
    }

    public function show(Brand $brand): JsonResource
    {
        return new BrandResource($brand->loadCount('products'));
    }

    public function store(StoreBrandRequest $request): JsonResponse
    {
        $brand = Brand::create($request->validated());

        return response()->json(['data' => new BrandResource($brand->loadCount('products'))], 201);
    }

    public function update(UpdateBrandRequest $request, Brand $brand): JsonResource
    {
        $brand->update($request->validated());

        return new BrandResource($brand->fresh()->loadCount('products'));
    }

    public function destroy(Brand $brand): JsonResponse
    {
        // products.brand_id is nullOnDelete, so the catalogue survives losing a
        // brand — the products stay, unbranded. The count is in the index so
        // that consequence is visible before someone clicks delete.
        $brand->delete();

        return response()->json(['message' => 'Brand deleted.']);
    }
}
