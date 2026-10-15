<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\DownloadCategoryRequest;
use App\Http\Resources\Admin\DownloadCategoryResource;
use App\Models\DownloadCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * Download category CRUD (docs/downloads.md). Behind auth:sanctum +
 * role:content_manager, the `ServiceCategoryController` shape.
 */
class DownloadCategoryController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = DownloadCategory::query()
            ->withCount('downloads')
            ->ordered()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100))
            ->withQueryString();

        return DownloadCategoryResource::collection($categories);
    }

    public function show(DownloadCategory $downloadCategory): JsonResource
    {
        return new DownloadCategoryResource($downloadCategory->loadCount('downloads'));
    }

    public function store(DownloadCategoryRequest $request): JsonResponse
    {
        $category = DownloadCategory::create($request->validated());

        return (new DownloadCategoryResource($category->loadCount('downloads')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(DownloadCategoryRequest $request, DownloadCategory $downloadCategory): JsonResource
    {
        $attributes = $request->validated();

        // A blank slug on an edit means "derive it again", not "store nothing".
        if (array_key_exists('slug', $attributes) && blank($attributes['slug'])) {
            $attributes['slug'] = $downloadCategory->uniqueSlug((string) ($attributes['name'] ?? $downloadCategory->name));
        }
        if (array_key_exists('sort_order', $attributes) && $attributes['sort_order'] === null) {
            $attributes['sort_order'] = 0;
        }

        $downloadCategory->update($attributes);

        return new DownloadCategoryResource($downloadCategory->fresh()?->loadCount('downloads') ?? $downloadCategory);
    }

    /**
     * The downloads stay: `download_category_id` is `nullOnDelete`, so they
     * are listed unfiled rather than going with the shelf.
     */
    public function destroy(DownloadCategory $downloadCategory): Response
    {
        $downloadCategory->delete();

        return response()->noContent();
    }
}
