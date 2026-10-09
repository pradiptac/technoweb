<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\AnswerBlockKind;
use App\Enums\ProductCondition;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\Store\ProductRequest;
use App\Http\Resources\Admin\Store\ProductResource;
use App\Models\StoreProduct;
use App\Models\StoreTag;
use App\Support\CustomFields\CustomFields;
use App\Support\PageSections\RecordSections;
use App\Support\Store\ProductVideos;
use App\Support\Store\SpecIndex;
use App\Support\Store\StockLedger;
use App\Support\Store\Tags;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * The store's catalogue, behind `role:store_manager`.
 *
 * Bound by **id**, not slug: the edit form changes the slug it is addressed by,
 * so a slug-bound route breaks mid-save. Same rule every CMS entity here
 * follows.
 */
class ProductController extends Controller
{
    use HandlesBulk;
    use WritesCmsEntities;

    private const RELATIONS = ['variations', 'service_ids', 'faqs', 'answer_blocks', 'tags'];

    /**
     * The people waiting to hear a product is back, as a `withCount`. One
     * definition — `StockNotice::scopeWaiting()` — shared with the filter
     * in `index()` and the dashboard, or a column reading "3" opens a list
     * of five.
     *
     * @return array<string, \Closure>
     */
    private static function noticesCount(): array
    {
        return ['stockNotices as notices_waiting' => fn ($q) => $q->waiting()];
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $products = StoreProduct::query()
            ->with(['category', 'brand', 'variations', 'tags'])
            ->withCount(self::noticesCount())
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('type'), fn ($q) => $q->where('type', $request->string('type')))
            ->when($request->filled('category'), fn ($q) => $q->where('store_category_id', $request->integer('category')))
            /*
             * "Show me what has run out" is the question this screen is opened
             * with more than any other, and it cannot be asked of the storefront
             * — which publishes no counts at all.
             */
            ->when($request->boolean('out_of_stock'), fn ($q) => $q->outOfStock())
            /*
             * Products somebody is waiting on. The same scope the count and
             * the dashboard's figure read, so the tile and the list agree.
             */
            ->when($request->boolean('notices'), fn ($q) => $q->whereHas('stockNotices', fn ($n) => $n->waiting()))
            // Products that carry a video (0.140.0) — the scope the "shop the
            // videos" shelf and Store → Product videos' count both read.
            ->when($request->boolean('video'), fn ($q) => $q->withVideos())
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('sku', 'like', "%{$term}%"));
            })
            ->orderByDesc('is_featured')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return ProductResource::collection($products)->additional(['meta' => [
            'types' => ProductType::options(),
            // Sent by the API, never listed in TypeScript — the rule
            // `schema_type_options` and `meta.locations` already follow.
            'conditions' => ProductCondition::options(),
            'statuses' => array_map(
                fn (PublishStatus $s) => ['value' => $s->value, 'label' => $s->label()],
                PublishStatus::cases(),
            ),
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('store_product'),
            // Every tag's name, for the form's suggestions as you type (0.141.0).
            'tags' => StoreTag::query()->orderBy('name')->pluck('name')->values()->all(),
        ]]);
    }

    public function show(StoreProduct $storeProduct): JsonResource
    {
        return new ProductResource($storeProduct->load($this->detailRelations())->loadCount(self::noticesCount()));
    }

    public function store(ProductRequest $request): JsonResponse
    {
        $product = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);
            $variations = $this->pull($attributes, self::RELATIONS);
            $attributes = ProductVideos::normaliseAttributes($attributes);

            $product = StoreProduct::create($attributes);

            $this->saveVariations($product, $variations['variations'] ?? null);
            // The variation rows removed above go by a mass delete, which
            // fires no model event, so the spec index is asked for directly.
            // Deferred to the commit and deduplicated — see `SpecIndex`.
            SpecIndex::queue((int) $product->id);
            $this->syncServices($product, $variations);
            $this->saveAnswerContent($product, $variations);
            $this->saveSeo($product, $seo);
            $this->saveCustomFields($product, $custom);
            $this->saveTags($product, $variations);

            // Opening stock, so the ledger's first entry for a product is the
            // level it arrived with rather than a gap that every later report
            // has to be read around.
            StockLedger::adjusted($product, 0, [], creating: true);

            return $product;
        });

        // Once, after the save is safe: the rule never fails a save (guarded).
        $this->autoTag($request, $product);

        /*
         * `(new Resource(...))->response()`, never `response()->json($resource)`.
         *
         * The second serialises through `jsonSerialize()`, which returns the
         * resolved array and drops the `data` wrapper — so a created record
         * comes back shaped unlike every read of one and the console reports a
         * failure for something it just created. That has happened on two
         * modules here already.
         */
        return (new ProductResource($product->load($this->detailRelations())->loadCount(self::noticesCount())))
            ->response()
            ->setStatusCode(201);
    }

    public function update(ProductRequest $request, StoreProduct $storeProduct): JsonResource
    {
        DB::transaction(function () use ($request, $storeProduct) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);
            $variations = $this->pull($attributes, self::RELATIONS);
            $attributes = ProductVideos::normaliseAttributes($attributes);

            /*
             * The levels before the save, because the form posts a level and
             * not a change. `40` in the box means "there are forty", and only
             * the row it is about to replace knows whether that is thirty-six
             * arriving or four being written off — which is the difference
             * between stock in and stock out, and the whole of what the report
             * is for. Read before the update or there is nothing to compare.
             */
            $stockBefore = (int) $storeProduct->stock;
            $variationsBefore = $storeProduct->variations()->pluck('stock', 'id')->all();

            $storeProduct->update($attributes);

            $this->saveVariations($storeProduct, $variations['variations'] ?? null);
            SpecIndex::queue((int) $storeProduct->id);
            $this->syncServices($storeProduct, $variations);
            $this->saveAnswerContent($storeProduct, $variations);
            $this->saveSeo($storeProduct, $seo);
            $this->saveCustomFields($storeProduct, $custom);
            $this->saveTags($storeProduct, $variations);

            StockLedger::adjusted($storeProduct, $stockBefore, $variationsBefore);
        });

        $this->autoTag($request, $storeProduct);

        return new ProductResource($storeProduct->fresh($this->detailRelations())->loadCount(self::noticesCount()));
    }

    public function destroy(StoreProduct $storeProduct): JsonResponse
    {
        $this->remove($storeProduct);

        return response()->json(null, 204);
    }

    /** `POST /admin/store/products/bulk` — publish, draft, archive or delete the ticked shop products. */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk($request, StoreProduct::query(), $this->remove(...));
    }

    /** What deleting a shop product does, for `destroy()` and the bulk path alike. */
    private function remove(StoreProduct $storeProduct): void
    {
        DB::transaction(function () use ($storeProduct) {
            // Polymorphic rows have nothing to cascade them; the pivot does.
            $storeProduct->faqs()->delete();
            $storeProduct->answerBlocks()->delete();
            $storeProduct->delete();
        });
    }

    /** @return array<int, string> */
    private function detailRelations(): array
    {
        return ['category', 'brand', 'variations', 'tags', 'services', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group'];
    }

    /**
     * Tags are replaced wholesale: a request without the key leaves them alone,
     * `[]` clears them, and sending the key at all stamps `tags_set_at` so the
     * automatic rule never puts back what somebody removed.
     */
    private function saveTags(StoreProduct $product, array $pulled): void
    {
        if (array_key_exists('tags', $pulled)) {
            Tags::sync($product, $pulled['tags'] ?? []);
        }
    }

    /** The automatic rule, for a product whose request did not decide its tags. */
    private function autoTag(Request $request, StoreProduct $product): void
    {
        if (! $request->has('tags')) {
            Tags::autoTag($product);
        }
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

    /** A key absent from the payload leaves the services alone; `[]` clears them. */
    private function syncServices(StoreProduct $product, array $pulled): void
    {
        if (array_key_exists('service_ids', $pulled)) {
            $product->services()->sync($pulled['service_ids'] ?? []);
        }
    }

    /**
     * Variations, replaced wholesale — with the rows kept where they are the
     * same rows.
     *
     * `faqs` are deleted and rewritten because nothing points at one. A
     * variation is different: an order item records the variation it was bought
     * as, so delete-and-recreate would renumber the ids underneath every
     * historical order and quietly re-point them at somebody else's
     * configuration. So a payload row carrying an `id` updates that row, one
     * without is created, and only the rows nobody sent are deleted.
     *
     * `null` means the key was absent, which means leave them alone. An empty
     * array clears them, which has to be possible or the last variation could
     * never be removed.
     */
    private function saveVariations(StoreProduct $product, ?array $variations): void
    {
        if ($variations === null) {
            return;
        }

        $kept = [];

        foreach (array_values($variations) as $index => $row) {
            $attributes = [
                'name' => $row['name'],
                'sku' => $row['sku'] ?? null,
                'options' => $row['options'] ?? null,
                'price_paise' => $row['price_paise'] ?? null,
                'stock' => $row['stock'] ?? 0,
                'allow_oversell' => $row['allow_oversell'] ?? false,
                'weight_grams' => $row['weight_grams'] ?? null,
                'image_path' => $row['image_path'] ?? null,
                'is_active' => $row['is_active'] ?? true,
                // Renumbered from the order of the array, the rule `slides`
                // follows: moving one variation must not make an editor
                // renumber the ones around it.
                'sort_order' => $index,
            ];

            $existing = filled($row['id'] ?? null)
                ? $product->variations()->whereKey($row['id'])->first()
                : null;

            if ($existing !== null) {
                $existing->update($attributes);
                $kept[] = $existing->id;

                continue;
            }

            $kept[] = $product->variations()->create($attributes)->id;
        }

        $product->variations()->whereNotIn('id', $kept ?: [0])->delete();
    }
}
