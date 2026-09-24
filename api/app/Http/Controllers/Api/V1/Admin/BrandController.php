<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesAnswerContent;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreBrandRequest;
use App\Http\Requests\UpdateBrandRequest;
use App\Http\Resources\Admin\BrandResource;
use App\Models\Brand;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Brand CRUD. Behind auth:sanctum + role:content_manager.
 *
 * No SEO and no publish status — a brand is a filter facet on the product
 * listing, not a page of its own. It does carry FAQs and answer blocks since
 * 2026-09-21, because "is this brand's kit supported here?" is a question
 * people ask an assistant, and the brand is the record that can answer it;
 * `WritesAnswerContent` is the trait for exactly that pair and nothing else.
 */
class BrandController extends Controller
{
    use WritesAnswerContent;

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

        return BrandResource::collection($brands)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
        ]]);
    }

    public function show(Brand $brand): JsonResource
    {
        return new BrandResource($brand->load(['faqs', 'answerBlocks'])->loadCount('products'));
    }

    public function store(StoreBrandRequest $request): JsonResponse
    {
        $brand = DB::transaction(function () use ($request) {
            $attributes = $request->validated();
            $content = $this->pullAnswerContent($attributes);

            $brand = Brand::create($attributes);
            $this->saveAnswerContent($brand, $content);

            return $brand;
        });

        return response()->json(['data' => new BrandResource($brand->load(['faqs', 'answerBlocks'])->loadCount('products'))], 201);
    }

    public function update(UpdateBrandRequest $request, Brand $brand): JsonResource
    {
        DB::transaction(function () use ($request, $brand) {
            $attributes = $request->validated();
            $content = $this->pullAnswerContent($attributes);

            $brand->update($attributes);
            $this->saveAnswerContent($brand, $content);
        });

        return new BrandResource($brand->fresh(['faqs', 'answerBlocks'])->loadCount('products'));
    }

    public function destroy(Brand $brand): JsonResponse
    {
        // products.brand_id is nullOnDelete, so the catalogue survives losing a
        // brand — the products stay, unbranded. The count is in the index so
        // that consequence is visible before someone clicks delete.
        DB::transaction(function () use ($brand) {
            $brand->faqs()->delete();
            $brand->answerBlocks()->delete();
            $brand->delete();
        });

        return response()->json(['message' => 'Brand deleted.']);
    }
}
