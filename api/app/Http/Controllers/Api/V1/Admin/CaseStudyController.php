<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreCaseStudyRequest;
use App\Http\Requests\UpdateCaseStudyRequest;
use App\Http\Resources\Admin\CaseStudyResource;
use App\Models\CaseStudy;
use App\Models\Industry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Case-study CRUD. Behind auth:sanctum + role:content_manager.
 *
 * Unlike posts and articles, case_studies has no published_at column — status
 * alone decides whether one is live — so nothing here touches publish dates.
 */
class CaseStudyController extends Controller
{
    use WritesCmsEntities;

    public function index(Request $request): AnonymousResourceCollection
    {
        $studies = CaseStudy::query()
            ->with('industry')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('industry_id'), fn ($q) => $q->where('industry_id', $request->integer('industry_id')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $term = $request->string('q')->value();
                $q->where(fn ($w) => $w->where('title', 'like', "%{$term}%")
                    ->orWhere('client_name', 'like', "%{$term}%")
                    ->orWhere('summary', 'like', "%{$term}%"));
            })
            ->orderByDesc('updated_at')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return CaseStudyResource::collection($studies);
    }

    /** Industries for the picker. Small, fixed list — no pagination. */
    public function industries(): JsonResponse
    {
        return response()->json([
            'data' => Industry::orderBy('sort_order')->orderBy('name')->get(['id', 'name', 'slug']),
        ]);
    }

    public function show(CaseStudy $caseStudy): JsonResource
    {
        return new CaseStudyResource($caseStudy->load(['industry', 'seo']));
    }

    public function store(StoreCaseStudyRequest $request): JsonResponse
    {
        $study = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            $study = CaseStudy::create($attributes);

            $this->saveSeo($study, $seo);

            return $study;
        });

        return response()->json(
            ['data' => new CaseStudyResource($study->load(['industry', 'seo']))],
            201
        );
    }

    public function update(UpdateCaseStudyRequest $request, CaseStudy $caseStudy): JsonResource
    {
        DB::transaction(function () use ($request, $caseStudy) {
            [$attributes, $seo] = $this->splitSeo($request->validated());

            $caseStudy->update($attributes);

            $this->saveSeo($caseStudy, $seo);
        });

        return new CaseStudyResource($caseStudy->fresh(['industry', 'seo']));
    }

    public function destroy(CaseStudy $caseStudy): JsonResponse
    {
        DB::transaction(function () use ($caseStudy) {
            $caseStudy->seo()->delete();
            $caseStudy->delete();
        });

        return response()->json(['message' => 'Case study deleted.']);
    }
}
