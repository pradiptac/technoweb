<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\CertificationRequest;
use App\Http\Resources\Admin\CertificationResource;
use App\Models\Certification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Behind auth:sanctum + role:content_manager. No slug, no SEO — an index-page
 * entity in the `Popup` shape.
 */
class CertificationController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $rows = Certification::query()
            ->when($request->filled('q'), fn ($q) => $q->where(function ($w) use ($request) {
                $term = '%'.$request->string('q')->value().'%';
                $w->where('name', 'like', $term)->orWhere('issuer', 'like', $term);
            }))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderBy('sort_order')
            ->orderBy('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return CertificationResource::collection($rows);
    }

    public function store(CertificationRequest $request): JsonResponse
    {
        $certification = Certification::create($request->validated());

        // `->response()`, never `response()->json($resource)` — the second
        // drops the `data` wrapper. See `PopupController::store()`.
        return (new CertificationResource($certification))->response()->setStatusCode(201);
    }

    public function show(Certification $certification): JsonResource
    {
        return new CertificationResource($certification);
    }

    public function update(CertificationRequest $request, Certification $certification): JsonResource
    {
        $certification->update($request->validated());

        return new CertificationResource($certification->fresh());
    }

    public function destroy(Certification $certification): JsonResponse
    {
        // The badge and the PDF stay in the media library; the library's own
        // bin is where a file is removed.
        $certification->delete();

        return response()->json(null, 204);
    }
}
