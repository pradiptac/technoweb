<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\Admin\Concerns\HandlesBulk;
use App\Http\Controllers\Concerns\WritesCmsEntities;
use App\Http\Controllers\Controller;
use App\Http\Requests\BulkActionRequest;
use App\Http\Requests\StoreCaseStudyRequest;
use App\Http\Requests\UpdateCaseStudyRequest;
use App\Http\Resources\Admin\CaseStudyResource;
use App\Models\CaseStudy;
use App\Support\CustomFields\CustomFields;
use App\Support\PageSections\RecordSections;
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
    use HandlesBulk;
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

        // The custom field groups that apply, for the console's Fields tab.
        return CaseStudyResource::collection($studies)->additional(['meta' => [
            'custom_field_groups' => CustomFields::definitions('case_study'),
        ]]);
    }

    public function show(CaseStudy $caseStudy): JsonResource
    {
        return new CaseStudyResource($caseStudy->load(['industry', 'seo', 'customValues.field.group']));
    }

    public function store(StoreCaseStudyRequest $request): JsonResponse
    {
        $study = DB::transaction(function () use ($request) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);

            $study = CaseStudy::create($attributes);

            $this->saveSeo($study, $seo);

            $this->saveCustomFields($study, $custom);

            return $study;
        });

        return response()->json(
            ['data' => new CaseStudyResource($study->load(['industry', 'seo', 'customValues.field.group']))],
            201
        );
    }

    public function update(UpdateCaseStudyRequest $request, CaseStudy $caseStudy): JsonResource
    {
        DB::transaction(function () use ($request, $caseStudy) {
            [$attributes, $seo] = $this->splitSeo($request->validated());
            $custom = $this->pullCustomFields($attributes);
            $attributes = RecordSections::store($attributes);

            $caseStudy->update($attributes);

            $this->saveSeo($caseStudy, $seo);

            $this->saveCustomFields($caseStudy, $custom);
        });

        return new CaseStudyResource($caseStudy->fresh(['industry', 'seo', 'customValues.field.group']));
    }

    public function destroy(CaseStudy $caseStudy): JsonResponse
    {
        $this->remove($caseStudy);

        return response()->json(['message' => 'Case study deleted.']);
    }

    /** `POST /admin/case-studies/bulk` — publish, draft, archive or delete the ticked case studies. */
    public function bulk(BulkActionRequest $request): JsonResponse
    {
        return $this->runBulk($request, CaseStudy::query(), $this->remove(...));
    }

    /** What deleting a case study does, for `destroy()` and the bulk path alike. */
    private function remove(CaseStudy $caseStudy): void
    {
        DB::transaction(function () use ($caseStudy) {
            $caseStudy->seo()->delete();
            $caseStudy->delete();
        });
    }
}
