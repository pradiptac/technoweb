<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\GalleryTransition;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreGalleryRequest;
use App\Http\Requests\UpdateGalleryRequest;
use App\Http\Resources\GalleryResource;
use App\Models\Gallery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

class GalleryController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $galleries = Gallery::query()
            ->withCount('items')
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        // `meta.transitions` rides on the index because the console's *new*
        // gallery screen has no record to read it from, and fetching the index
        // for its meta alone is what `/admin/menus/new` already does for
        // `meta.locations`. The alternative is a copy of the list in
        // TypeScript, which is the drift nothing type-checks across the wire.
        return GalleryResource::collection($galleries)
            ->additional(['meta' => ['transitions' => GalleryTransition::options()]]);
    }

    public function store(StoreGalleryRequest $request): JsonResponse
    {
        $data = $request->validated();
        $gallery = null;

        DB::transaction(function () use ($data, &$gallery) {
            $gallery = Gallery::create(Arr::except($data, ['groups', 'items']));
            $this->sync($gallery, $data['groups'] ?? null, $data['items'] ?? null);
        });

        // `->response()`, not `response()->json($resource)`. The second
        // serialises through jsonSerialize() and drops the `data` wrapper, so a
        // created record comes back shaped unlike every read of one — the bug
        // menus and campaigns each shipped once.
        return (new GalleryResource($this->loaded($gallery)))->response()->setStatusCode(201);
    }

    public function show(Gallery $gallery): JsonResource
    {
        return (new GalleryResource($this->loaded($gallery)))
            ->additional(['meta' => ['transitions' => GalleryTransition::options()]]);
    }

    public function update(UpdateGalleryRequest $request, Gallery $gallery): JsonResource
    {
        $data = $request->validated();

        DB::transaction(function () use ($data, $gallery) {
            $gallery->update(Arr::except($data, ['groups', 'items']));
            $this->sync(
                $gallery,
                array_key_exists('groups', $data) ? ($data['groups'] ?? []) : null,
                array_key_exists('items', $data) ? ($data['items'] ?? []) : null,
            );
        });

        return new GalleryResource($this->loaded($gallery->fresh()));
    }

    public function destroy(Gallery $gallery): JsonResponse
    {
        $gallery->delete();

        return response()->json(null, 204);
    }

    private function loaded(Gallery $gallery): Gallery
    {
        // `items.group` is eager-loaded because the item resource reads the
        // group's slug, and `preventLazyLoading` is on outside production.
        return $gallery->load(['groups', 'items.group']);
    }

    /**
     * Groups and items, replaced wholesale — the rule `faqs` and `slides`
     * follow.
     *
     * `null` means the key was absent: leave that relation alone. An empty
     * array means the editor removed them all, which has to be a real
     * instruction or the last item could never be deleted.
     *
     * Groups are synced **first**, because an item names its group by slug and
     * the id it resolves to does not exist until the group row does. That
     * ordering is the whole reason the payload is keyed on a slug rather than
     * on an id: the console creates a tab and the pictures filed under it in
     * one submit, and there is no id at the moment the item has to point at it.
     */
    private function sync(Gallery $gallery, ?array $groups, ?array $items): void
    {
        if ($groups !== null) {
            $gallery->groups()->delete();

            foreach (array_values($groups) as $i => $group) {
                $gallery->groups()->create([
                    'name' => $group['name'],
                    'slug' => $group['slug'],
                    // The order the editor submitted, not a number they keep.
                    'sort_order' => $i,
                ]);
            }
        }

        if ($items === null) {
            return;
        }

        // Rebuilt after the groups are written, so a tab created in this same
        // request is in it.
        $byslug = $gallery->groups()->pluck('id', 'slug');

        $gallery->items()->delete();

        foreach (array_values($items) as $i => $item) {
            $gallery->items()->create([
                'gallery_group_id' => $byslug[$item['group'] ?? ''] ?? null,
                'media_path' => $item['media_path'],
                'alt_text' => $item['alt_text'] ?? null,
                'title' => $item['title'] ?? null,
                'subtitle' => $item['subtitle'] ?? null,
                'link_url' => $item['link_url'] ?? null,
                'sort_order' => $i,
            ]);
        }
    }
}
