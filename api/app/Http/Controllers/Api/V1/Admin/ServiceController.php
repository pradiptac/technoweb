<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AnswerBlockKind;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreServiceRequest;
use App\Http\Requests\UpdateServiceRequest;
use App\Http\Resources\Admin\ServiceResource;
use App\Models\Service;
use App\Models\ServiceCategory;
use App\Support\CustomFields\CustomFields;
use App\Support\ListSort;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/** Web-service CRUD. Behind auth:sanctum + role:content_manager. */
class ServiceController extends Controller
{
    use WritesCmsEntities;

    /**
     * What a column heading may sort by (`ListSort`). `category` orders by
     * the category's own order, then its name, with the uncategorised last
     * ascending — the order the public tabs are drawn in.
     */
    private const SORTS = ['title', 'category', 'status', 'order', 'updated'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $services = Service::query()
            ->with('category')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            // `?category=<id>`, or `none` for the services in no category.
            ->when($request->filled('category'), function ($q) use ($request) {
                $category = $request->string('category')->value();
                $category === 'none'
                    ? $q->whereNull('service_category_id')
                    : $q->where('service_category_id', (int) $category);
            })
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('summary', 'like', "%{$term}%"));
            })
            ->tap(fn ($q) => ListSort::apply($q, $request, [
                'title' => 'title',
                'category' => fn (Builder $q, string $dir) => $q
                    ->orderByRaw('service_category_id is null '.($dir === 'asc' ? 'asc' : 'desc'))
                    ->orderBy(
                        ServiceCategory::select('sort_order')->whereColumn('service_categories.id', 'services.service_category_id'),
                        $dir,
                    )
                    ->orderBy(
                        ServiceCategory::select('name')->whereColumn('service_categories.id', 'services.service_category_id'),
                        $dir,
                    )
                    ->orderBy('sort_order')
                    ->orderBy('title'),
                'status' => 'status',
                'order' => 'sort_order',
                'updated' => 'updated_at',
            ], fn (Builder $q) => $q->orderBy('sort_order')->orderBy('title')))
            ->paginate(min($request->integer('per_page', 30), 100))
            ->withQueryString();

        // Sent by the API, never listed in TypeScript: the console's kind
        // select is built from this, the `meta.transitions` rule.
        return ServiceResource::collection($services)->additional(['meta' => [
            'answer_block_kinds' => AnswerBlockKind::options(),
            // The custom field groups that apply, for the console's Fields tab.
            'custom_field_groups' => CustomFields::definitions('service'),
            'sorts' => self::SORTS,
        ]]);
    }

    public function show(Service $service): JsonResource
    {
        return new ServiceResource($service->load(['category', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
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

        return response()->json(['data' => new ServiceResource($service->load(['category', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']))], 201);
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

        return new ServiceResource($service->fresh(['category', 'faqs', 'answerBlocks', 'seo', 'customValues.field.group']));
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
