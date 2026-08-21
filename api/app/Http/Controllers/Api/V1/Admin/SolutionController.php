<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSolutionRequest;
use App\Http\Requests\UpdateSolutionRequest;
use App\Http\Resources\Admin\SolutionResource;
use App\Models\Product;
use App\Models\Solution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Solution CRUD. Behind auth:sanctum + role:content_manager.
 *
 * Solutions carry more than the article-shaped entities: two string lists,
 * two many-to-many links and a polymorphic FAQ set. Everything except the
 * scalar columns is written separately from the model attributes.
 */
class SolutionController extends Controller
{
    use WritesCmsEntities;

    /** Relation keys that must be stripped before mass assignment. */
    private const RELATIONS = ['product_ids', 'industry_ids', 'faqs'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $solutions = Solution::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('summary', 'like', "%{$term}%"));
            })
            ->orderBy('sort_order')
            ->orderBy('title')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return SolutionResource::collection($solutions);
    }

    /** Products for the picker — the hardware a solution is built from. */
    public function products(): JsonResponse
    {
        return response()->json([
            'data' => Product::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function show(Solution $solution): JsonResource
    {
        return new SolutionResource($solution->load(['products', 'industries', 'faqs', 'seo']));
    }

    public function store(StoreSolutionRequest $request): JsonResponse
    {
        $solution = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $relations = $this->pull($attributes, self::RELATIONS);

            $solution = Solution::create($attributes);

            $this->syncRelations($solution, $relations);
            $this->saveSeo($solution, $seo);

            return $solution;
        });

        return response()->json(
            ['data' => new SolutionResource($solution->load(['products', 'industries', 'faqs', 'seo']))],
            201
        );
    }

    public function update(UpdateSolutionRequest $request, Solution $solution): JsonResource
    {
        DB::transaction(function () use ($request, $solution) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $relations = $this->pull($attributes, self::RELATIONS);

            $solution->update($attributes);

            $this->syncRelations($solution, $relations);
            $this->saveSeo($solution, $seo);
        });

        return new SolutionResource($solution->fresh(['products', 'industries', 'faqs', 'seo']));
    }

    public function destroy(Solution $solution): JsonResponse
    {
        DB::transaction(function () use ($solution) {
            // Pivot rows and the polymorphic FAQ/SEO rows have nothing to
            // cascade them, so clear them explicitly.
            $solution->products()->detach();
            $solution->industries()->detach();
            $solution->faqs()->delete();
            $solution->seo()->delete();
            $solution->delete();
        });

        return response()->json(['message' => 'Solution deleted.']);
    }

    /**
     * Lifts the relation keys out of the validated attributes.
     * preventSilentlyDiscardingAttributes is on, so leaving them in would
     * throw on create/update rather than being ignored.
     */
    private function pull(array &$attributes, array $keys): array
    {
        $pulled = [];

        foreach ($keys as $key) {
            if (array_key_exists($key, $attributes)) {
                $pulled[$key] = $attributes[$key];
                unset($attributes[$key]);
            }
        }

        return $pulled;
    }

    /** A key absent from the payload means "leave that relation alone". */
    private function syncRelations(Solution $solution, array $relations): void
    {
        if (array_key_exists('product_ids', $relations)) {
            $solution->products()->sync($relations['product_ids'] ?? []);
        }

        if (array_key_exists('industry_ids', $relations)) {
            $solution->industries()->sync($relations['industry_ids'] ?? []);
        }

        $this->saveFaqs($solution, $relations['faqs'] ?? null);
    }
}
