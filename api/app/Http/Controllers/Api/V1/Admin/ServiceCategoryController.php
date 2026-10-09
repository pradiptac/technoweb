<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkDeleteRequest;
use App\Http\Requests\ServiceCategoryRequest;
use App\Http\Resources\Admin\ServiceCategoryResource;
use App\Models\ServiceCategory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * Service category CRUD. Behind auth:sanctum + role:content_manager.
 *
 * The index doubles as the service form's category select, the rule product
 * categories follow: ask for `?per_page=100` and read `id` and `name`.
 */
class ServiceCategoryController extends Controller
{
    use HandlesBulk;

    public function index(Request $request): AnonymousResourceCollection
    {
        $categories = ServiceCategory::query()
            ->withCount('services')
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('name', 'like', "%{$term}%")
                    ->orWhere('slug', 'like', "%{$term}%"));
            })
            ->when($request->has('active') && $request->input('active') !== '',
                fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->ordered()
            ->paginate(min(max($request->integer('per_page', 50), 1), 100))
            ->withQueryString();

        return ServiceCategoryResource::collection($categories);
    }

    public function show(ServiceCategory $serviceCategory): JsonResource
    {
        return new ServiceCategoryResource($serviceCategory->loadCount('services'));
    }

    public function store(ServiceCategoryRequest $request): JsonResponse
    {
        $category = ServiceCategory::create($request->validated());

        return (new ServiceCategoryResource($category->loadCount('services')))
            ->response()
            ->setStatusCode(201);
    }

    public function update(ServiceCategoryRequest $request, ServiceCategory $serviceCategory): JsonResource
    {
        $attributes = $request->validated();

        // A blank slug on an edit means "derive it again", not "store nothing".
        if (array_key_exists('slug', $attributes) && blank($attributes['slug'])) {
            $attributes['slug'] = $serviceCategory->uniqueSlug((string) ($attributes['name'] ?? $serviceCategory->name));
        }

        $serviceCategory->update($attributes);

        return new ServiceCategoryResource($serviceCategory->fresh()?->loadCount('services') ?? $serviceCategory);
    }

    /**
     * The services stay: `service_category_id` is `nullOnDelete`, so they
     * move to "Other services" rather than going with the tab.
     */
    public function destroy(ServiceCategory $serviceCategory): Response
    {
        $this->remove($serviceCategory);

        return response()->noContent();
    }

    /** `POST /admin/service-categories/bulk` — delete the ticked categories. A service category has no status, so delete is the only action. */
    public function bulk(BulkDeleteRequest $request): JsonResponse
    {
        return $this->runBulk($request, ServiceCategory::query(), $this->remove(...));
    }

    /** What deleting a service category does, for `destroy()` and the bulk path alike. */
    private function remove(ServiceCategory $serviceCategory): void
    {
        $serviceCategory->delete();
    }
}
