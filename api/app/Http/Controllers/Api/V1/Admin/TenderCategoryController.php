<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\TenderCategoryRequest;
use App\Http\Resources\Admin\TenderCategoryResource;
use App\Models\TenderCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * Tender category CRUD (docs/tenders.md). Behind auth:sanctum +
 * role:content_manager, the `DownloadCategoryController` shape.
 */
class TenderCategoryController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = TenderCategory::query()
            ->withCount('tenders')
            ->ordered()
            ->paginate(min(max($request->integer('per_page', 100), 1), 100))
            ->withQueryString();

        return TenderCategoryResource::collection($categories);
    }

    public function show(TenderCategory $tenderCategory): JsonResource
    {
        return new TenderCategoryResource($tenderCategory->loadCount('tenders'));
    }

    public function store(TenderCategoryRequest $request): JsonResponse
    {
        $category = TenderCategory::create($request->validated());

        return (new TenderCategoryResource($category->loadCount('tenders')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(TenderCategoryRequest $request, TenderCategory $tenderCategory): JsonResource
    {
        $attributes = $request->validated();

        // A blank slug on an edit means "derive it again", not "store nothing".
        if (array_key_exists('slug', $attributes) && blank($attributes['slug'])) {
            $attributes['slug'] = $tenderCategory->uniqueSlug((string) ($attributes['name'] ?? $tenderCategory->name));
        }
        if (array_key_exists('sort_order', $attributes) && $attributes['sort_order'] === null) {
            $attributes['sort_order'] = 0;
        }

        $tenderCategory->update($attributes);

        return new TenderCategoryResource($tenderCategory->fresh()?->loadCount('tenders') ?? $tenderCategory);
    }

    /**
     * The tenders stay: `tender_category_id` is `nullOnDelete`, so they are
     * listed unfiled rather than going with the category.
     */
    public function destroy(TenderCategory $tenderCategory): Response
    {
        $tenderCategory->delete();

        return response()->noContent();
    }
}
