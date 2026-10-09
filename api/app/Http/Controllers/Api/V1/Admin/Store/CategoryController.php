<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkDeleteRequest;
use App\Http\Requests\Store\CategoryRequest;
use App\Http\Resources\Admin\Store\CategoryResource;
use App\Models\StoreCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class CategoryController extends Controller
{
    use HandlesBulk;
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = StoreCategory::query()
            ->withCount('products')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q').'%'))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return CategoryResource::collection($categories)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
        ]]);
    }

    public function show(StoreCategory $storeCategory): JsonResource
    {
        return new CategoryResource($storeCategory->loadCount('products')->load(['faqs', 'answerBlocks', 'seo']));
    }

    public function store(CategoryRequest $request): JsonResponse
    {
        [$attributes, $seo] = $this->splitSeo($request->validated());
        $content = $this->pullAnswerContent($attributes);
        $attributes = $this->cleanFilters($attributes);

        $category = StoreCategory::create($attributes);
        $this->saveAnswerContent($category, $content);
        $this->saveSeo($category, $seo);

        // The wrapper survives only through `->response()`. See the product
        // controller: `response()->json($resource)` drops `data`.
        return (new CategoryResource($category->loadCount('products')->load(['faqs', 'answerBlocks', 'seo'])))
            ->response()
            ->setStatusCode(201);
    }

    public function update(CategoryRequest $request, StoreCategory $storeCategory): JsonResource
    {
        [$attributes, $seo] = $this->splitSeo($request->validated());
        $content = $this->pullAnswerContent($attributes);
        $attributes = $this->cleanFilters($attributes);

        $storeCategory->update($attributes);
        $this->saveAnswerContent($storeCategory, $content);
        $this->saveSeo($storeCategory, $seo);

        return new CategoryResource($storeCategory->fresh()->loadCount('products')->load(['faqs', 'answerBlocks', 'seo']));
    }

    /**
     * The chosen filter labels, trimmed, blanks dropped, in the order given.
     * An empty list is stored as null — "no filters" — rather than `[]`.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function cleanFilters(array $attributes): array
    {
        if (array_key_exists('filter_specs', $attributes)) {
            $labels = collect($attributes['filter_specs'] ?? [])
                ->map(fn ($l) => trim((string) $l))
                ->filter(fn (string $l) => $l !== '')
                ->values()
                ->all();

            $attributes['filter_specs'] = $labels === [] ? null : $labels;
        }

        return $attributes;
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
        $this->remove($storeCategory);

        return response()->json(null, 204);
    }

    /** `POST /admin/store/categories/bulk` — delete the ticked categories. A shop category has no status (only an on/off switch), so delete is the only action. */
    public function bulk(BulkDeleteRequest $request): JsonResponse
    {
        return $this->runBulk($request, StoreCategory::query(), $this->remove(...));
    }

    /** What deleting a shop category does, for `destroy()` and the bulk path alike. */
    private function remove(StoreCategory $storeCategory): void
    {
        $storeCategory->faqs()->delete();
        $storeCategory->answerBlocks()->delete();
        $storeCategory->delete();
    }
}
