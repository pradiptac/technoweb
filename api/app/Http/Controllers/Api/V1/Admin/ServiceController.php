<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceRequest;
use App\Http\Requests\UpdateServiceRequest;
use App\Http\Resources\Admin\ServiceResource;
use App\Models\Service;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/** Web-service CRUD. Behind auth:sanctum + role:content_manager. */
class ServiceController extends Controller
{
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $services = Service::query()
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

        return ServiceResource::collection($services);
    }

    public function show(Service $service): JsonResource
    {
        return new ServiceResource($service->load(['faqs', 'seo']));
    }

    public function store(StoreServiceRequest $request): JsonResponse
    {
        $service = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $faqs = $attributes['faqs'] ?? null;
            unset($attributes['faqs']);

            $service = Service::create($attributes);

            $this->saveFaqs($service, $faqs);
            $this->saveSeo($service, $seo);

            return $service;
        });

        return response()->json(['data' => new ServiceResource($service->load(['faqs', 'seo']))], 201);
    }

    public function update(UpdateServiceRequest $request, Service $service): JsonResource
    {
        DB::transaction(function () use ($request, $service) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $faqs = $attributes['faqs'] ?? null;
            unset($attributes['faqs']);

            $service->update($attributes);

            $this->saveFaqs($service, $faqs);
            $this->saveSeo($service, $seo);
        });

        return new ServiceResource($service->fresh(['faqs', 'seo']));
    }

    public function destroy(Service $service): JsonResponse
    {
        DB::transaction(function () use ($service) {
            $service->faqs()->delete();
            $service->seo()->delete();
            $service->delete();
        });

        return response()->json(['message' => 'Service deleted.']);
    }
}
