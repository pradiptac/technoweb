<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PopupFrequency;
use App\Enums\PopupSize;
use App\Http\Controllers\Controller;
use App\Http\Requests\PopupRequest;
use App\Http\Resources\Admin\PopupResource;
use App\Models\Popup;
use App\Support\SiteSection;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

class PopupController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $popups = Popup::query()
            ->when($request->filled('q'), fn ($q) => $q->where('name', 'like', '%'.$request->string('q')->value().'%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        /*
         * `meta` rides on the index because the console's *new* screen has no
         * record to read it from — the same reason `SliderController` and
         * `/admin/menus/new` carry theirs this way, rather than a second,
         * hand-typed copy of three lists in TypeScript.
         */
        return PopupResource::collection($popups)
            ->additional(['meta' => self::meta()]);
    }

    public function store(PopupRequest $request): JsonResponse
    {
        $popup = Popup::create($request->validated());

        /*
         * `->response()`, not `response()->json($resource)`. The second
         * serialises through `jsonSerialize()` and **drops the `data`
         * wrapper**, so a created record comes back shaped unlike every read of
         * one and the console reports a failure for something it just made.
         * That has happened twice in this codebase already — menus and
         * campaigns — which is why it is written down here too.
         */
        return (new PopupResource($popup))->response()->setStatusCode(201);
    }

    public function show(Popup $popup): JsonResource
    {
        return (new PopupResource($popup))->additional(['meta' => self::meta()]);
    }

    public function update(PopupRequest $request, Popup $popup): JsonResource
    {
        $popup->update($request->validated());

        return new PopupResource($popup->fresh());
    }

    public function destroy(Popup $popup): JsonResponse
    {
        /*
         * The image is left in the media library. Nothing here tracks what
         * references a path, and a popup is very often built from artwork that
         * is also on a page — deleting the file with the record is how a
         * picture disappears from somewhere nobody was looking. The library's
         * own bin is where a file is removed.
         */
        $popup->delete();

        return response()->json(null, 204);
    }

    /**
     * The three lists the console draws its controls from.
     *
     * @return array<string, mixed>
     */
    private static function meta(): array
    {
        return [
            'sections' => SiteSection::options(),
            'sizes' => PopupSize::options(),
            'frequencies' => PopupFrequency::options(),
        ];
    }
}
