<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\DetailTemplateRequest;
use App\Http\Requests\PreviewDetailTemplateRequest;
use App\Http\Resources\Admin\DetailTemplateResource;
use App\Models\DetailTemplate;
use App\Models\User;
use App\Support\DetailTemplates;
use App\Support\PageSections\SectionRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Response;

/**
 * Detail-page templates (0.161.0, docs/page-builder.md "Detail templates").
 *
 * The routes sit behind the union of the roles that own a kind of record; this
 * controller narrows to the one that owns *this* kind — a content manager
 * cannot lay out the shop's product page, a store manager cannot lay out the
 * blog's, an administrator can lay out any (the `PreviewLinks` rule).
 */
class DetailTemplateController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $user = $this->staff($request);
        $type = $request->query('type');

        if (is_string($type) && $type !== '') {
            $this->authoriseType($user, $type);
        }

        $items = DetailTemplate::query()
            ->with('author:id,name')
            ->whereIn('type', DetailTemplates::allowedFor($user))
            ->when(is_string($type) && $type !== '', fn ($q) => $q->where('type', $type))
            ->orderBy('type')->orderByDesc('is_active')->orderBy('name')
            ->paginate(min($request->integer('per_page', 50), 100))
            ->withQueryString();

        return DetailTemplateResource::collection($items);
    }

    /**
     * What the template screen is drawn from, in one read: the page builder's
     * own options (so a store manager, who cannot reach `/admin/pages/builder`,
     * can still build) and the template options — the kinds this account owns,
     * the record blocks each may place and the layout each draws today.
     */
    public function options(Request $request): JsonResponse
    {
        $user = $this->staff($request);
        $builder = app(PageController::class)->builder($request)->getData(true)['data'];
        $options = DetailTemplates::options();
        $options['types'] = array_values(array_filter($options['types'], fn (array $t) => DetailTemplates::allows($user, $t['value'])));

        return response()->json(['data' => [...$builder, 'detail_templates' => $options]]);
    }

    /** The records of one kind, for the preview's picker: the first fifty by title, or by a search. */
    public function records(Request $request): JsonResponse
    {
        $user = $this->staff($request);
        $data = $request->validate([
            'type' => ['required', 'string', 'in:'.implode(',', DetailTemplates::aliases())],
            'q' => ['nullable', 'string', 'max:100'],
        ]);
        $this->authoriseType($user, $data['type']);

        [$model, $title] = DetailTemplates::recordModel($data['type']) ?? abort(404);
        $term = isset($data['q']) ? addcslashes($data['q'], '%_\\') : null;

        $rows = $model::query()
            ->when($term !== null && $term !== '', fn ($q) => $q->where($title, 'like', "%{$term}%"))
            ->orderBy($title)->limit(50)->get(['id', $title, 'slug'])
            ->map(fn ($r) => ['id' => $r->getKey(), 'title' => (string) $r->getAttribute($title), 'slug' => $r->getAttribute('slug')]);

        return response()->json(['data' => $rows]);
    }

    public function show(Request $request, DetailTemplate $detailTemplate): JsonResource
    {
        $this->authoriseType($this->staff($request), $detailTemplate->type);

        return new DetailTemplateResource($detailTemplate->load('author:id,name'));
    }

    public function store(DetailTemplateRequest $request): JsonResponse
    {
        $this->authoriseType($this->staff($request), (string) $request->validated('type'));

        $template = DetailTemplate::create([
            'type' => $request->validated('type'),
            'name' => $request->validated('name'),
            'blocks' => self::normalised($request->validated('blocks')),
            'is_active' => false,
            'created_by' => $request->user()?->getKey(),
        ]);

        return (new DetailTemplateResource($template->load('author:id,name')))->response()->setStatusCode(201);
    }

    public function update(DetailTemplateRequest $request, DetailTemplate $detailTemplate): JsonResource
    {
        $this->authoriseType($this->staff($request), $detailTemplate->type);

        $attributes = collect($request->validated())->only(['name'])->all();
        if ($request->has('blocks')) {
            $attributes['blocks'] = self::normalised($request->validated('blocks'));
        }
        $detailTemplate->update($attributes);

        return new DetailTemplateResource($detailTemplate->load('author:id,name'));
    }

    /** Deleting the active template puts its kind's pages back to the layout they have in code. */
    public function destroy(Request $request, DetailTemplate $detailTemplate): Response
    {
        $this->authoriseType($this->staff($request), $detailTemplate->type);
        $detailTemplate->delete();

        return response()->noContent();
    }

    public function activate(Request $request, DetailTemplate $detailTemplate): JsonResource
    {
        $this->authoriseType($this->staff($request), $detailTemplate->type);
        $detailTemplate->activate();

        return new DetailTemplateResource($detailTemplate->refresh()->load('author:id,name'));
    }

    public function deactivate(Request $request, DetailTemplate $detailTemplate): JsonResource
    {
        $this->authoriseType($this->staff($request), $detailTemplate->type);
        $detailTemplate->deactivate();

        return new DetailTemplateResource($detailTemplate->refresh()->load('author:id,name'));
    }

    /**
     * The unsaved preview: the blocks as typed, validated by the rules a save
     * runs, around one chosen record's public read. Writes nothing — which is
     * the whole of the difference from `update`. The record is read whatever
     * its status, so a draft can be laid out before it is published.
     */
    public function preview(PreviewDetailTemplateRequest $request): JsonResponse
    {
        $type = (string) $request->validated('type');
        $this->authoriseType($this->staff($request), $type);

        [$model] = DetailTemplates::recordModel($type) ?? abort(404);
        $record = $model::query()->find((int) $request->validated('record_id'));
        abort_if($record === null, 422, 'That record no longer exists.');

        return response()->json(['data' => [
            'type' => $type,
            'record' => DetailTemplates::presentRecord($type, $record, $request),
            'detail_template' => DetailTemplates::present(0, self::normalised($request->validated('blocks'))),
        ]]);
    }

    private function staff(Request $request): User
    {
        $user = $request->user();
        abort_unless($user instanceof User, 403, 'You do not have permission to perform this action.');

        return $user;
    }

    private function authoriseType(User $user, string $type): void
    {
        abort_unless(DetailTemplates::allows($user, $type), 403, 'You do not have permission to perform this action.');
    }

    /**
     * The builder's stored shape, through JSON so the objects `normalise()`
     * returns for `data` are arrays in the column.
     *
     * @return list<array<string, mixed>>
     */
    private static function normalised(mixed $blocks): array
    {
        return json_decode((string) json_encode(SectionRules::normalise($blocks)), true);
    }
}
