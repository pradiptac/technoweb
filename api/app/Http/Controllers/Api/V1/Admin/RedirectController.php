<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRedirectRequest;
use App\Http\Requests\UpdateRedirectRequest;
use App\Http\Resources\Admin\RedirectResource;
use App\Models\Redirect;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The redirect table. Behind auth:sanctum + role:seo_manager.
 *
 * Most rows here are written automatically when a slug changes, which is what
 * keeps an edited URL from 404ing. This screen exists for the ones that are
 * not: a print campaign's vanity URL, a page that moved before this site
 * existed, or cleaning up after a slug that changed twice.
 *
 * `hit_count` and `last_hit_at` are telemetry the middleware writes, so they
 * are read-only here — they are how you tell a live redirect from a dead one.
 */
class RedirectController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $redirects = Redirect::query()
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('from_path', 'like', "%{$term}%")
                    ->orWhere('to_path', 'like', "%{$term}%"));
            })
            ->when($request->filled('source'), function ($q) use ($request) {
                $q->where('created_automatically', $request->string('source')->value() === 'automatic');
            })
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderByDesc('created_at')
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return RedirectResource::collection($redirects);
    }

    public function show(Redirect $redirect): JsonResource
    {
        return new RedirectResource($redirect);
    }

    public function store(StoreRedirectRequest $request): JsonResponse
    {
        $data = $request->validated();

        // validated() carries a nullable field through as null even when it
        // was never sent, and the column is unsigned — so a null lands as 0
        // and the redirect answers with a status code no browser follows.
        // created_automatically stays false: anything made here was made by a
        // person, and that distinction is what makes the filter useful.
        $redirect = Redirect::create([
            ...$data,
            'status_code' => $data['status_code'] ?? 301,
            'created_automatically' => false,
        ]);

        return response()->json(['data' => new RedirectResource($redirect)], 201);
    }

    public function update(UpdateRedirectRequest $request, Redirect $redirect): JsonResource
    {
        $data = array_filter(
            $request->validated(),
            fn ($value, $key) => ! ($key === 'status_code' && $value === null),
            ARRAY_FILTER_USE_BOTH,
        );

        $redirect->update($data);

        return new RedirectResource($redirect->fresh());
    }

    public function destroy(Redirect $redirect): JsonResponse
    {
        $redirect->delete();

        return response()->json(['message' => 'Redirect deleted.']);
    }
}
