<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceRequest;
use App\Http\Requests\UpdateServiceRequest;
use App\Http\Resources\Admin\ServiceResource;
use App\Models\Service;
use App\Support\CustomFields\CustomFields;
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

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return ServiceResource::collection($services)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('service'),
        ]]);
    }

    public function show(Service $service): JsonResource
    {
        return new ServiceResource($service->load(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    public function store(StoreServiceRequest $request): JsonResponse
    {
        $service = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $content = $this->pullAnswerContent($attributes);

            $service = Service::create($attributes);

            $this->saveAnswerContent($service, $content);
            $this->saveSeo($service, $seo);
            $this->saveCustomFields($service, $custom);

            return $service;
        });

        return response()->json(['data' => new ServiceResource($service->load(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']))], 201);
    }

    public function update(UpdateServiceRequest $request, Service $service): JsonResource
    {
        DB::transaction(function () use ($request, $service) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $content = $this->pullAnswerContent($attributes);

            $service->update($attributes);

            $this->saveAnswerContent($service, $content);
            $this->saveSeo($service, $seo);
            $this->saveCustomFields($service, $custom);
        });

        return new ServiceResource($service->fresh(['faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
    }

    public function destroy(Service $service): JsonResponse
    {
        DB::transaction(function () use ($service) {
            $service->faqs()->delete();
            $service->answerBlocks()->delete();
            $service->seo()->delete();
            $service->delete();
        });

        return response()->json(['message' => 'Service deleted.']);
    }
}
