<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkDeleteRequest;
use App\Http\Requests\StoreProductCategoryRequest;
use App\Http\Requests\UpdateProductCategoryRequest;
use App\Http\Resources\Admin\ProductCategoryResource;
use App\Models\ProductCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Product category CRUD. Behind auth:sanctum + role:content_manager.
 *
 * Categories are a tree, which is the only thing here that is not the usual
 * shape: reparenting is guarded against cycles in UpdateProductCategoryRequest,
 * and deleting a parent promotes its children rather than taking them with it.
 */
class ProductCategoryController extends Controller
{
    use HandlesBulk;
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = ProductCategory::query()
            ->with('parent')
            ->withCount(['products', 'children'])
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where('name', 'like', "%{$term}%");
            })
            // Top level first, then by the order an editor set. The tree shape
            // is conveyed by parent_name rather than by nesting the payload —
            // the list screen is a table, not an outline.
            ->orderByRaw('parent_id is not null')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return ProductCategoryResource::collection($categories)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
        ]]);
    }

    public function show(ProductCategory $productCategory): JsonResource
    {
        return new ProductCategoryResource(
            $productCategory->load(['parent', 'faqs', 'answerBlocks', 'seo'])->loadCount(['products', 'children'])
        );
    }

    public function store(StoreProductCategoryRequest $request): JsonResponse
    {
        $category = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $content = $this->pullAnswerContent($attributes);

            $category = ProductCategory::create($attributes);
            $this->saveAnswerContent($category, $content);
            $this->saveSeo($category, $seo);

            return $category;
        });

        return response()->json([
            'data' => new ProductCategoryResource(
                $category->load(['parent', 'faqs', 'answerBlocks', 'seo'])->loadCount(['products', 'children'])
            ),
        ], 201);
    }

    public function update(UpdateProductCategoryRequest $request, ProductCategory $productCategory): JsonResource
    {
        DB::transaction(function () use ($request, $productCategory) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $content = $this->pullAnswerContent($attributes);

            $productCategory->update($attributes);
            $this->saveAnswerContent($productCategory, $content);
            $this->saveSeo($productCategory, $seo);
        });

        return new ProductCategoryResource(
            $productCategory->fresh(['parent', 'faqs', 'answerBlocks', 'seo'])->loadCount(['products', 'children'])
        );
    }

    public function destroy(ProductCategory $productCategory): JsonResponse
    {
        $this->remove($productCategory);

        return response()->json(['message' => 'Category deleted.']);
    }

    /** `POST /admin/product-categories/bulk` — delete the ticked categories. A category has no status, so delete is the only action. */
    public function bulk(BulkDeleteRequest $request): JsonResponse
    {
        return $this->runBulk($request, ProductCategory::query(), $this->remove(...));
    }

    /** What deleting a category does, for `destroy()` and the bulk path alike. */
    private function remove(ProductCategory $productCategory): void
    {
        DB::transaction(function () use ($productCategory) {
            // Children are promoted to this category's own parent rather than
            // being orphaned at the root. The FK is nullOnDelete, which would
            // silently scatter a whole branch to the top level; keeping them
            // under the grandparent preserves the editor's intended grouping.
            $productCategory->children()->update(['parent_id' => $productCategory->parent_id]);

            $productCategory->seo()->delete();
            $productCategory->faqs()->delete();
            $productCategory->answerBlocks()->delete();
            $productCategory->delete();
        });
    }
}
