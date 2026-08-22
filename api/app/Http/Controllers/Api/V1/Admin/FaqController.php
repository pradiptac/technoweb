<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreFaqRequest;
use App\Http\Requests\UpdateFaqRequest;
use App\Http\Resources\Admin\FaqResource;
use App\Models\Faq;
use App\Models\Page;
use App\Models\Product;
use App\Models\Service;
use App\Models\Solution;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * FAQs across every entity that has them. Behind role:content_manager.
 *
 * The per-entity editors already manage a record's own FAQs inline. This is
 * the cross-cutting view: every question on the site in one list, so a
 * duplicate or a stale answer can be found without opening nine screens.
 *
 * An FAQ must belong to something. The table allows a null owner, but nothing
 * on the public site renders an unattached one — it would be written, saved,
 * and then never seen. Requiring an owner keeps every answer reachable.
 */
class FaqController extends Controller
{
    /**
     * The morph keys an FAQ may attach to, with the column each one calls its
     * title. Products are named `name`; the rest use `title`. Spelling that
     * out here beats branching on the model inside the query.
     */
    public const OWNERS = [
        'solution' => [Solution::class, 'title', 'Solutions'],
        'service' => [Service::class, 'title', 'Services'],
        'product' => [Product::class, 'name', 'Products'],
        'page' => [Page::class, 'title', 'Pages'],
    ];

    public function index(Request $request): AnonymousResourceCollection
    {
        $faqs = Faq::query()
            ->with('faqable')
            ->when($request->filled('owner_type'), fn ($q) => $q->where('faqable_type', $request->string('owner_type')))
            ->when($request->filled('owner_id'), fn ($q) => $q->where('faqable_id', $request->integer('owner_id')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('question', 'like', "%{$term}%")
                    ->orWhere('answer', 'like', "%{$term}%"));
            })
            // Grouped by what they hang off, then in the order they render.
            ->orderBy('faqable_type')
            ->orderBy('faqable_id')
            ->orderBy('sort_order')
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        return FaqResource::collection($faqs);
    }

    /** Everything an FAQ can be attached to, for the owner picker. */
    public function owners(): JsonResponse
    {
        $groups = [];

        foreach (self::OWNERS as $key => [$class, $titleColumn, $label]) {
            $groups[] = [
                'type' => $key,
                'label' => $label,
                'options' => $class::query()
                    ->orderBy($titleColumn)
                    ->get(['id', $titleColumn])
                    ->map(fn ($row) => ['id' => $row->id, 'name' => $row->{$titleColumn}])
                    ->all(),
            ];
        }

        return response()->json(['data' => $groups]);
    }

    public function show(Faq $faq): JsonResource
    {
        return new FaqResource($faq->load('faqable'));
    }

    public function store(StoreFaqRequest $request): JsonResponse
    {
        $data = $request->validated();

        $faq = new Faq(['question' => $data['question'], 'answer' => $data['answer'], 'sort_order' => $data['sort_order'] ?? 0]);
        // associate(), never a hand-set faqable_type — the morph map stores
        // "solution", not the FQCN.
        $faq->faqable()->associate($this->owner($data['owner_type'], $data['owner_id']));
        $faq->save();

        return response()->json(['data' => new FaqResource($faq->load('faqable'))], 201);
    }

    public function update(UpdateFaqRequest $request, Faq $faq): JsonResource
    {
        $data = $request->validated();

        $faq->fill(array_intersect_key($data, array_flip(['question', 'answer', 'sort_order'])));

        if (isset($data['owner_type'], $data['owner_id'])) {
            $faq->faqable()->associate($this->owner($data['owner_type'], $data['owner_id']));
        }

        $faq->save();

        return new FaqResource($faq->fresh('faqable'));
    }

    public function destroy(Faq $faq): JsonResponse
    {
        $faq->delete();

        return response()->json(['message' => 'FAQ deleted.']);
    }

    private function owner(string $type, int $id): object
    {
        [$class] = self::OWNERS[$type];

        return $class::findOrFail($id);
    }
}
