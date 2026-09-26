<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ContentTypeRequest;
use App\Http\Resources\Admin\ContentTypeResource;
use App\Models\ContentType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Custom content types (docs/custom-content.md). Behind role:content_manager.
 *
 * Bound by **id**: the edit form changes the slug it would otherwise be
 * addressed by, the rule every CMS admin route follows.
 */
class ContentTypeController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $types = ContentType::query()
            ->withCount(['entries', 'entries as published_count' => fn ($q) => $q->where('status', PublishStatus::Published)])
            ->when($request->filled('q'), fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', '%'.$request->string('q')->value().'%')
                ->orWhere('plural', 'like', '%'.$request->string('q')->value().'%')))
            ->when($request->has('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return ContentTypeResource::collection($types)->additional(['meta' => self::meta()]);
    }

    public function store(ContentTypeRequest $request): JsonResponse
    {
        $type = ContentType::create($request->validated());

        return (new ContentTypeResource($type->loadCount('entries')))->additional(['meta' => self::meta()])
            ->response()->setStatusCode(201);
    }

    public function show(ContentType $contentType): JsonResource
    {
        return (new ContentTypeResource($contentType->loadCount('entries')))->additional(['meta' => self::meta()]);
    }

    /**
     * A slug change moves every entry — the model writes a redirect per
     * entry and for the archive, and re-aims the field groups attached to
     * the type. See `ContentType::moveSlug()`.
     */
    public function update(ContentTypeRequest $request, ContentType $contentType): JsonResource
    {
        $contentType->update($request->validated());

        return (new ContentTypeResource($contentType->fresh()?->loadCount('entries') ?? $contentType))
            ->additional(['meta' => self::meta()]);
    }

    /**
     * Refused while the type has entries. A type is the address of every
     * entry in it; deleting one with content in it would take a year of work
     * with it on one press. Switching it off keeps everything and takes it
     * off the site.
     */
    public function destroy(ContentType $contentType): JsonResponse
    {
        $count = $contentType->entries()->count();

        if ($count > 0) {
            return response()->json([
                'message' => "This type still holds {$count} ".($count === 1 ? 'entry' : 'entries').'. Delete them first, or switch the type off instead.',
                'errors' => ['content_type' => ['Delete its entries first, or switch it off.']],
            ], 422);
        }

        $contentType->delete();

        return response()->json(null, 204);
    }

    /** @return array<string, mixed> */
    public static function meta(): array
    {
        return [
            'sorts' => [
                ['value' => 'newest', 'label' => 'Newest first'],
                ['value' => 'title', 'label' => 'By title'],
                ['value' => 'manual', 'label' => 'By sort order'],
            ],
            'schema_types' => [
                ['value' => 'Article', 'label' => 'Article — dated writing: news, events, guides'],
                ['value' => 'WebPage', 'label' => 'Web page — reference content: partners, locations, downloads'],
            ],
        ];
    }
}
