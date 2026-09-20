<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\JobExperienceLevel;
use App\Models\JobQualification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The two lists a vacancy form picks from: qualifications and experience levels.
 *
 * One controller for both because they are the same shape — a name, an order,
 * and nothing else that behaves. Two near-identical controllers would be two
 * places to fix the same thing.
 *
 * **Neither delete detaches quietly.** A qualification in use by a live vacancy
 * cannot be removed without saying so: the pivot would cascade and the role
 * would silently lose a requirement it was published with.
 */
class JobReferenceController extends Controller
{
    /* ------------------------------------------------------- qualifications */

    public function qualifications(): JsonResponse
    {
        return response()->json([
            'data' => JobQualification::withCount('jobs')
                ->orderBy('sort_order')->orderBy('name')->get()
                ->map(fn (JobQualification $q) => [
                    'id' => $q->id, 'name' => $q->name,
                    'sort_order' => $q->sort_order, 'job_count' => $q->jobs_count,
                ]),
        ]);
    }

    public function storeQualification(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160', Rule::unique('job_qualifications', 'name')],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:65535'],
        ]);

        return response()->json(['data' => JobQualification::create($data)], 201);
    }

    public function updateQualification(Request $request, JobQualification $job_qualification): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:160',
                Rule::unique('job_qualifications', 'name')->ignore($job_qualification)],
            'sort_order' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:65535'],
        ]);

        $job_qualification->update($data);

        return response()->json(['data' => $job_qualification]);
    }

    public function destroyQualification(JobQualification $job_qualification): JsonResponse
    {
        if (($used = $job_qualification->jobs()->count()) > 0) {
            return response()->json([
                'message' => "That qualification is required by {$used} vacancy(s). Remove it from those first.",
            ], 422);
        }

        $job_qualification->delete();

        return response()->json(['message' => 'Qualification deleted.']);
    }

    /* ----------------------------------------------------- experience levels */

    public function experienceLevels(): JsonResponse
    {
        return response()->json([
            'data' => JobExperienceLevel::withCount('jobs')
                ->orderBy('sort_order')->orderBy('min_years')->get()
                ->map(fn (JobExperienceLevel $l) => [
                    'id' => $l->id, 'name' => $l->name, 'range' => $l->range(),
                    'min_years' => $l->min_years, 'max_years' => $l->max_years,
                    'sort_order' => $l->sort_order, 'job_count' => $l->jobs_count,
                ]),
        ]);
    }

    public function storeExperienceLevel(Request $request): JsonResponse
    {
        return response()->json(['data' => JobExperienceLevel::create($this->levelRules($request))], 201);
    }

    public function updateExperienceLevel(Request $request, JobExperienceLevel $job_experience_level): JsonResponse
    {
        $job_experience_level->update($this->levelRules($request, true));

        return response()->json(['data' => $job_experience_level]);
    }

    public function destroyExperienceLevel(JobExperienceLevel $job_experience_level): JsonResponse
    {
        if (($used = $job_experience_level->jobs()->count()) > 0) {
            return response()->json([
                'message' => "That level is used by {$used} vacancy(s). Point those at another level first.",
            ], 422);
        }

        $job_experience_level->delete();

        return response()->json(['message' => 'Experience level deleted.']);
    }

    private function levelRules(Request $request, bool $partial = false): array
    {
        $required = $partial ? ['sometimes', 'required'] : ['required'];
        $optional = $partial ? ['sometimes', 'nullable'] : ['nullable'];

        return $request->validate([
            'name' => [...$required, 'string', 'max:80'],
            'min_years' => [...$optional, 'integer', 'min:0', 'max:60'],
            // `gte` against the minimum, or "5-2 years" is publishable. Null is
            // allowed and means "and above".
            'max_years' => [...$optional, 'integer', 'min:0', 'max:60', 'gte:min_years'],
            'sort_order' => [...$optional, 'integer', 'min:0', 'max:65535'],
        ], ['max_years.gte' => 'The upper bound cannot be below the lower one.']);
    }
}
