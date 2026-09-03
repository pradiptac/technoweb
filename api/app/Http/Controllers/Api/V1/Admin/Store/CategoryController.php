<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\Store\CategoryRequest;
use App\Http\Resources\Admin\Store\CategoryResource;
use App\Models\StoreCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryController extends Controller
{
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = StoreCategory::query()
            ->withCount('products')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q').'%'))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories);
    }

    public function show(StoreCategory $storeCategory): JsonResource
    {
        return new CategoryResource($storeCategory->loadCount('products')->load('seo'));
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        [$attributes, $seo] = $this->splitSeo($request->validated());

        $category = StoreCategory::create($attributes);
        $this->saveSeo($category, $seo);

        // The wrapper survives only through `->response()`. See the product
        // controller: `response()->json($resource)` drops `data`.
        return (new CategoryResource($category->loadCount('products')->load('seo')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(CategoryRequest $request, StoreCategory $storeCategory): JsonResource
    {
        [$attributes, $seo] = $this->splitSeo($request->validated());

        $storeCategory->update($attributes);
        $this->saveSeo($storeCategory, $seo);

        return new CategoryResource($storeCategory->fresh()->loadCount('products')->load('seo'));
    }

    /**
     * Deleting a category does not delete what is in it.
     *
     * `store_category_id` is `nullOnDelete`, so the products fall back to
     * uncategorised and stay on sale. Same rule the media library follows for a
     * folder, and for the same reason: a category is a label, the products are
     * the expensive thing, and losing a shop's stock to one confirmation dialog
     * is not a mistake anybody recovers from.
     */
    public function destroy(StoreCategory $storeCategory): JsonResponse
    {
        $storeCategory->delete();

        return response()->json(null, 204);
    }
}
