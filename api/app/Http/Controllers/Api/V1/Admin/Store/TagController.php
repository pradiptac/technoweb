<?php

namespace App\Http\Controllers\Api\V1\Admin\Store;

use App\Enums\ProductType;
use App\Http\Controllers\Controller;
use App\Http\Requests\Store\TagRequest;
use App\Http\Resources\Admin\Store\TagResource;
use App\Models\Brand;
use App\Models\Redirect;
use App\Models\Setting;
use App\Models\StoreCategory;
use App\Models\StoreProduct;
use App\Models\StoreTag;
use App\Support\Seo\Ai\ProductTags;
use App\Support\Store\Tags;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Store → Tags, behind `role:store_manager` (0.141.0, `docs/store.md` "Tags").
 *
 * Every write goes through `App\Support\Store\Tags`; this class is the HTTP
 * shape around it. The routes with a literal segment (`reorder`, `settings`,
 * `auto`, and `products/tag-suggest`) are declared above the parameterised
 * ones — Laravel matches in declaration order.
 */
class TagController extends Controller
{
    /** The whole of what `PATCH /admin/store/tags/settings` may touch. */
    public const SETTING_KEYS = ['store_tags_enabled', 'store_tags_limit', 'store_tags_auto'];

    public function index(): AnonymousResourceCollection
    {
        $tags = StoreTag::query()
            ->withCount('products')
            ->orderByRaw('sort_order = 0')
            ->orderBy('sort_order')
            ->orderByDesc('products_count')
            ->orderBy('name')
            ->get();

        return TagResource::collection($tags)->additional(['meta' => $this->meta()]);
    }

    public function store(Request $request): JsonResponse
    {
        $request->validate(['name' => ['required', 'string']]);

        [$slug, $name] = $this->nameAndSlug($request->string('name')->value(), 'name');

        if (StoreTag::query()->where('slug', $slug)->exists()) {
            throw ValidationException::withMessages(['name' => 'There is already a tag with that name.']);
        }

        $tag = StoreTag::query()->create(['name' => $name, 'slug' => $slug, 'is_visible' => true, 'sort_order' => 0]);

        return (new TagResource($tag->loadCount('products')))->response()->setStatusCode(201);
    }

    /** One tag with its page fields and SEO override — the edit screen's read. */
    public function show(StoreTag $storeTag): TagResource
    {
        return new TagResource($storeTag->loadCount('products')->load('seo'));
    }

    public function update(TagRequest $request, StoreTag $storeTag): TagResource
    {
        $data = $request->validated();
        $seo = $data['seo'] ?? null;

        $changes = array_intersect_key($data, array_flip(['heading', 'intro']));

        if ($request->has('name')) {
            [$slug, $name] = $this->nameAndSlug($request->string('name')->value(), 'name');

            if (StoreTag::query()->where('slug', $slug)->whereKeyNot($storeTag->id)->exists()) {
                throw ValidationException::withMessages(['name' => 'Another tag already has that name. Use Merge to combine them.']);
            }

            $changes += ['name' => $name, 'slug' => $slug];
        }

        if ($request->has('is_visible')) {
            $changes['is_visible'] = $request->boolean('is_visible');
        }

        $from = $storeTag->slug;
        $storeTag->update($changes);
        // Through the relation, never a hand-set `seoable_type` - the morph map stores "store_tag".
        if ($seo !== null) {
            $storeTag->seo()->updateOrCreate([], $seo);
        }

        if ($storeTag->slug !== $from) {
            self::redirect($from, $storeTag->slug);
        }

        return new TagResource($storeTag->loadCount('products')->load('seo'));
    }

    /**
     * A 301 from a tag page's old address to its new one, so a rename or a
     * merge does not leave a dead link behind. A redirect that starts at the
     * address now live is dropped first, or renaming a tag back would loop.
     */
    public static function redirect(string $fromSlug, string $toSlug): void
    {
        Redirect::query()->where('from_path', '/store/tags/'.$toSlug)->delete();

        Redirect::updateOrCreate(
            ['from_path' => '/store/tags/'.$fromSlug],
            ['to_path' => '/store/tags/'.$toSlug, 'status_code' => 301, 'is_active' => true, 'created_automatically' => true],
        );
    }

    public function destroy(StoreTag $storeTag): JsonResponse
    {
        // The pivot rows cascade; the products keep everything else.
        $storeTag->seo()->delete();
        $storeTag->delete();

        return response()->json(null, 204);
    }

    /** `POST /admin/store/tags/{id}/merge {into}` — its products move onto another tag, then it is deleted. */
    public function merge(Request $request, StoreTag $storeTag): JsonResponse
    {
        $data = $request->validate(['into' => ['required', 'integer', Rule::exists('store_tags', 'id')]]);

        if ((int) $data['into'] === $storeTag->id) {
            throw ValidationException::withMessages(['into' => 'Choose a different tag to merge into.']);
        }

        $into = StoreTag::query()->findOrFail($data['into']);
        $from = $storeTag->slug;
        $moved = Tags::merge($storeTag, $into);
        self::redirect($from, $into->slug);

        return response()->json([
            'message' => 'Merged into '.$into->name.'.',
            'data' => ['moved' => $moved, 'into' => (new TagResource($into->loadCount('products')))->resolve()],
        ]);
    }

    /** `PATCH /admin/store/tags/reorder {ids[]}` — the order the Tags screen drew them in. */
    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'max:500'],
            'ids.*' => ['integer', 'distinct', Rule::exists('store_tags', 'id')],
        ]);

        DB::transaction(function () use ($data) {
            foreach (array_values($data['ids']) as $position => $id) {
                StoreTag::query()->whereKey($id)->update(['sort_order' => $position + 1]);
            }
        });

        return response()->json(['message' => 'Order saved.']);
    }

    /** `PATCH /admin/store/tags/settings` — the three switches, and no other key. */
    public function settings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'settings' => ['required', 'array'],
            'settings.*.key' => ['required', 'string', Rule::in(self::SETTING_KEYS)],
            'settings.*.value' => ['required', 'string'],
        ]);

        foreach ($data['settings'] as $i => $row) {
            $value = $row['value'];

            if ($row['key'] === 'store_tags_limit') {
                if (! ctype_digit($value) || (int) $value < 4 || (int) $value > 30) {
                    throw ValidationException::withMessages(["settings.{$i}.value" => 'Show between 4 and 30 tags.']);
                }
            } elseif (! in_array($value, ['0', '1'], true)) {
                throw ValidationException::withMessages(["settings.{$i}.value" => 'The switch is 1 for on or 0 for off.']);
            }
        }

        DB::transaction(function () use ($data) {
            foreach ($data['settings'] as $row) {
                $setting = Setting::query()->where('key', $row['key'])->first();

                if ($setting) {
                    $setting->setPlainValue($row['value']);
                    $setting->save();
                }
            }
        });

        Setting::flushCache();

        return response()->json(['message' => 'Tag settings saved.', 'meta' => $this->meta()]);
    }

    /** `POST /admin/store/tags/auto` — the rule over every product with no tags that was never decided. */
    public function auto(): JsonResponse
    {
        $tagged = Tags::autoTagUntagged();

        return response()->json([
            'message' => $tagged === 1 ? 'Tagged 1 product.' : "Tagged {$tagged} products.",
            'data' => ['tagged' => $tagged, 'untagged' => Tags::untagged()->count()],
        ]);
    }

    /**
     * `POST /admin/store/products/tag-suggest` — the form's current words in,
     * tags to press out. The assistant when it can answer, the rule when it
     * cannot (off, no key, cap, silent provider). Saves nothing.
     */
    public function suggest(Request $request, ProductTags $ai): JsonResponse
    {
        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string', 'max:20000'],
            'specifications' => ['nullable', 'array', 'max:40'],
            'specifications.*' => ['nullable', 'string', 'max:255'],
            'brand_id' => ['nullable', 'integer'],
            'store_category_id' => ['nullable', 'integer'],
            'type' => ['nullable', Rule::enum(ProductType::class)],
            'current' => ['nullable', 'array', 'max:50'],
            'current.*' => ['string', 'max:100'],
        ]);

        $draft = new StoreProduct([
            'name' => $data['name'] ?? '',
            'short_description' => $data['short_description'] ?? null,
            'description' => $data['description'] ?? null,
            'specifications' => $data['specifications'] ?? [],
            'type' => $data['type'] ?? ProductType::Physical->value,
        ]);
        $draft->setRelation('brand', filled($data['brand_id'] ?? null) ? Brand::query()->find($data['brand_id']) : null);
        $draft->setRelation('category', filled($data['store_category_id'] ?? null) ? StoreCategory::query()->find($data['store_category_id']) : null);

        $source = 'rules';
        $tags = [];

        $answer = $ai->suggest($draft);

        if ($answer['ok']) {
            $source = 'ai';
            $tags = $answer['tags'];
        } else {
            $tags = Tags::suggestByRules($draft);
        }

        // What the product already carries is not a suggestion.
        $have = array_keys(Tags::clean($data['current'] ?? []));
        $tags = array_values(array_filter($tags, fn ($t) => ! in_array(Str::slug($t), $have, true)));

        return response()->json(['data' => ['tags' => $tags, 'source' => $source]]);
    }

    /**
     * @return array{0: string, 1: string} slug, name
     */
    private function nameAndSlug(string $raw, string $field): array
    {
        $name = trim(preg_replace('/\s+/u', ' ', $raw) ?? $raw);

        if ($name === '' || mb_strlen($name) > Tags::NAME_MAX) {
            throw ValidationException::withMessages([$field => 'A tag name is 1 to '.Tags::NAME_MAX.' characters.']);
        }

        $slug = mb_substr(Str::slug($name), 0, 64);

        if ($slug === '') {
            throw ValidationException::withMessages([$field => 'A tag needs at least one letter or number.']);
        }

        return [$slug, $name];
    }

    /** @return array<string, mixed> */
    private function meta(): array
    {
        return [
            'settings' => [
                'store_tags_enabled' => Tags::enabled(),
                'store_tags_limit' => Tags::limit(),
                'store_tags_auto' => Tags::autoEnabled(),
            ],
            'untagged' => Tags::untagged()->count(),
            'max_per_product' => Tags::MAX_PER_PRODUCT,
            'name_max' => Tags::NAME_MAX,
        ];
    }
}
