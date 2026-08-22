<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\Admin\ProductResource;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Product CRUD. Behind auth:sanctum + role:content_manager.
 *
 * The largest entity in the CMS: a spec-sheet map, a features list, an image
 * gallery, two many-to-many relations (one of them self-referencing) and a
 * polymorphic FAQ set, on top of the usual scalars and SEO override.
 *
 * This index doubles as the product picker other forms use — the solution
 * editor reads id and name off it. There is deliberately no second endpoint
 * for that, for the same reason industries has only one.
 */
class ProductController extends Controller
{
    use WritesCmsEntities;

    /** Keys that must be lifted out before mass assignment. */
    private const RELATIONS = ['solution_ids', 'related_product_ids', 'faqs'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $products = Product::query()
            ->with(['brand', 'category'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('brand'), fn ($q) => $q->where('brand_id', $request->integer('brand')))
            ->when($request->filled('category'), fn ($q) => $q->where('product_category_id', $request->integer('category')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%")
                    ->orWhere('short_description', 'like', "%{$term}%"));
            })
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        return ProductResource::collection($products);
    }

    public function show(Product $product): JsonResource
    {
        return new ProductResource($product->load($this->detailRelations()));
    }

    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $relations = $this->pull($attributes, self::RELATIONS);

            $product = Product::create($attributes);

            $this->syncRelations($product, $relations);
            $this->saveSeo($product, $seo);

            return $product;
        });

        return response()->json(
            ['data' => new ProductResource($product->load($this->detailRelations()))],
            201
        );
    }

    public function update(UpdateProductRequest $request, Product $product): JsonResource
    {
        DB::transaction(function () use ($request, $product) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $relations = $this->pull($attributes, self::RELATIONS);

            $product->update($attributes);

            $this->syncRelations($product, $relations);
            $this->saveSeo($product, $seo);
        });

        return new ProductResource($product->fresh($this->detailRelations()));
    }

    public function destroy(Product $product): JsonResponse
    {
        DB::transaction(function () use ($product) {
            // Product is the only soft-deleting model, and nothing in the app
            // lists trashed rows — so a deleted product would keep its slug
            // out of circulation for good. Recreating it would then be refused
            // by a uniqueness check naming a product the editor cannot see
            // anywhere, which is a dead end with no way out of the UI.
            //
            // Releasing the slug keeps the row recoverable in the database
            // while freeing the URL. The suffix is the id, so it stays unique
            // however many times the same slug is deleted and remade.
            $product->forceFill(['slug' => "{$product->slug}-deleted-{$product->id}"])->save();

            // FAQs and the SEO override go, matching every other entity.
            // Leaving them was the first instinct -- the row survives a soft
            // delete, so they would survive a restore -- but nothing in the
            // app restores a product, and what actually happened was that the
            // FAQ manager filled up with questions whose owner had vanished.
            // Pivot rows can stay: those relations filter trashed products out
            // on their own.
            $product->faqs()->delete();
            $product->seo()->delete();
            $product->delete();
        });

        return response()->json(['message' => 'Product deleted.']);
    }

    /** @return array<int, string> */
    private function detailRelations(): array
    {
        return ['brand', 'category', 'solutions', 'relatedProducts', 'faqs', 'seo'];
    }

    /**
     * preventSilentlyDiscardingAttributes is on, so a relation key left in the
     * attribute array would throw on create/update rather than be ignored.
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
    private function syncRelations(Product $product, array $relations): void
    {
        if (array_key_exists('solution_ids', $relations)) {
            $product->solutions()->sync($relations['solution_ids'] ?? []);
        }

        if (array_key_exists('related_product_ids', $relations)) {
            // Directional, matching the schema: marking B as related to A does
            // not make A related to B. The two lists are edited separately and
            // an editor may well want an accessory to point at a switch
            // without the switch listing every accessory back.
            $ids = array_values(array_diff(
                array_map('intval', $relations['related_product_ids'] ?? []),
                [$product->id],
            ));

            $product->relatedProducts()->sync($ids);
        }

        $this->saveFaqs($product, $relations['faqs'] ?? null);
    }
}
