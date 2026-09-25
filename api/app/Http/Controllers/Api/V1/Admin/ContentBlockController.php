<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ContentBlockType;
use App\Enums\CtaLayout;
use App\Enums\PricingLayout;
use App\Enums\PublishStatus;
use App\Enums\StackLayout;
use App\Enums\StatsLayout;
use App\Http\Controllers\Controller;
use App\Http\Requests\ContentBlockRequest;
use App\Http\Resources\Admin\ContentBlockAdminResource;
use App\Models\ContentBlock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * The console's content blocks — CTA banners, stat bars, pricing tables and
 * technology stacks on one screen, filtered by `?type=`.
 *
 * `meta` carries the types and every type's layouts with a label and blurb,
 * on the index as well as a record, because the console's *new* screen has
 * no record to read them from — the slider rule.
 */
class ContentBlockController extends Controller
{
    /** @return array<string, mixed> */
    private static function meta(): array
    {
        return [
            'types' => ContentBlockType::options(),
            'layouts' => [
                'cta' => CtaLayout::options(),
                'stats' => StatsLayout::options(),
                'pricing' => PricingLayout::options(),
                'stack' => StackLayout::options(),
            ],
        ];
    }

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = ContentBlock::query()
            ->when(ContentBlockType::tryFrom((string) $request->query('type')), fn ($q, $type) => $q->where('type', $type))
            ->when(PublishStatus::tryFrom((string) $request->query('status')), fn ($q, $status) => $q->where('status', $status))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = '%'.addcslashes((string) $request->query('q'), '%_\\').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $term)->orWhere('slug', 'like', $term));
            })
            ->orderByDesc('is_default')->orderBy('name')->orderBy('id');

        return ContentBlockAdminResource::collection(
            $query->paginate(min(100, max(1, (int) $request->query('per_page', 25))))->withQueryString()
        )->additional(['meta' => self::meta()]);
    }

    public function store(ContentBlockRequest $request): JsonResponse
    {
        $block = ContentBlock::create([
            ...$request->safe()->only(['type', 'layout', 'name', 'slug', 'status']),
            'data' => $request->validated('content'),
            'is_default' => false,
        ]);

        if ($request->boolean('is_default')) {
            $block->makeDefault();
        }

        return (new ContentBlockAdminResource($block->fresh()))->additional(['meta' => self::meta()])
            ->response()->setStatusCode(201);
    }

    public function show(ContentBlock $contentBlock): ContentBlockAdminResource
    {
        return (new ContentBlockAdminResource($contentBlock))->additional(['meta' => self::meta()]);
    }

    public function update(ContentBlockRequest $request, ContentBlock $contentBlock): ContentBlockAdminResource
    {
        $contentBlock->fill($request->safe()->only(['layout', 'name', 'slug', 'status']));
        if ($request->has('content')) {
            $contentBlock->data = $request->validated('content');
        }

        // A default that stops being published stops being the default: a
        // draft must not stand at the foot of every page.
        if ($contentBlock->status !== PublishStatus::Published) {
            $contentBlock->is_default = false;
        }
        if ($request->has('is_default') && ! $request->boolean('is_default')) {
            $contentBlock->is_default = false;
        }
        $contentBlock->save();

        if ($request->boolean('is_default')) {
            $contentBlock->makeDefault();
        }

        return (new ContentBlockAdminResource($contentBlock->fresh()))->additional(['meta' => self::meta()]);
    }

    /** A copy, as a draft, under a free slug — never the default. */
    public function duplicate(ContentBlock $contentBlock): JsonResponse
    {
        $copy = $contentBlock->replicate(['slug', 'is_default']);
        $copy->name = $contentBlock->name.' (copy)';
        $copy->status = PublishStatus::Draft;
        $copy->is_default = false;
        $copy->slug = $copy->uniqueSlug($copy->name);
        $copy->save();

        return (new ContentBlockAdminResource($copy))->additional(['meta' => self::meta()])
            ->response()->setStatusCode(201);
    }

    public function destroy(ContentBlock $contentBlock): Response
    {
        $contentBlock->delete();

        return response()->noContent();
    }
}
