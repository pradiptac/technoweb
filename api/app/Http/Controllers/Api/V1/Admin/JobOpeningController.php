<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreJobOpeningRequest;
use App\Http\Requests\UpdateJobOpeningRequest;
use App\Http\Resources\Admin\AdminJobOpeningResource;
use App\Models\JobOpening;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vacancies. Bound by id, not slug — the edit form changes the slug. */
class JobOpeningController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $openings = JobOpening::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->string('department')))
            ->search($request->string('q')->toString() ?: null)
            ->withCount('applications')
            ->with(['experienceLevel', 'seo'])
            ->orderBy('sort_order')
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 25), 100))
            ->withQueryString();

        return AdminJobOpeningResource::collection($openings)->response();
    }

    public function show(JobOpening $job_opening): JsonResponse
    {
        $job_opening->loadCount('applications')->load(['experienceLevel', 'qualifications', 'seo']);

        return response()->json(['data' => new AdminJobOpeningResource($job_opening)]);
    }

    public function store(StoreJobOpeningRequest $request): JsonResponse
    {
        $opening = JobOpening::create($request->modelData());
        $this->applyRelations($opening, $request);

        return response()->json(['data' => new AdminJobOpeningResource($this->hydrate($opening))], 201);
    }

    public function update(UpdateJobOpeningRequest $request, JobOpening $job_opening): JsonResponse
    {
        $job_opening->update($request->modelData());
        $this->applyRelations($job_opening, $request);

        return response()->json(['data' => new AdminJobOpeningResource($this->hydrate($job_opening->fresh()))]);
    }

    public function destroy(JobOpening $job_opening): JsonResponse
    {
        // Applications survive: `job_opening_id` is nullOnDelete and the title
        // is copied onto each one. Closing a role must not destroy the record
        // of who applied to it.
        $job_opening->delete();

        return response()->json(['message' => 'Vacancy deleted. The applications it received were kept.']);
    }

    /**
     * Relations are replaced wholesale, like `faqs` everywhere else: omitting
     * the key leaves them alone, sending `[]` clears them.
     */
    private function applyRelations(JobOpening $opening, Request $request): void
    {
        if ($request->has('qualification_ids')) {
            $opening->qualifications()->sync($request->input('qualification_ids', []));
        }

        if ($request->has('seo')) {
            $opening->seo()->updateOrCreate([], $request->input('seo', []));
        }
    }

    private function hydrate(JobOpening $opening): JobOpening
    {
        return $opening->loadCount('applications')->load(['experienceLevel', 'qualifications', 'seo']);
    }
}
