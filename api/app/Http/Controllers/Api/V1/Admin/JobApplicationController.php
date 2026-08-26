<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Console\Commands\PruneJobApplications;
use App\Enums\ApplicationStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\AdminJobApplicationResource;
use App\Models\JobApplication;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * The people who applied.
 *
 * `role:admin`, not `content_manager`: a CV and an employment history are not
 * content, and whoever edits the blog has no business reading them.
 */
class JobApplicationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $applications = JobApplication::query()
            ->status($request->string('status')->toString() ?: null)
            ->forOpening($request->integer('job') ?: null)
            ->search($request->string('q')->toString() ?: null)
            ->with(['opening:id,title,slug', 'reviewer:id,name'])
            // Newest first, but unread ahead of everything: this screen is a
            // queue before it is an archive.
            ->orderByRaw("CASE WHEN status = 'new' THEN 0 ELSE 1 END")
            ->orderByDesc('created_at')
            ->paginate(min((int) $request->integer('per_page', 25), 100))
            ->withQueryString();

        return AdminJobApplicationResource::collection($applications)
            ->additional(['meta' => [
                'new_count' => JobApplication::where('status', ApplicationStatus::New)->count(),
                'retention_days' => max(
                    PruneJobApplications::MINIMUM_DAYS,
                    (int) Setting::get('application_retention_days', 180),
                ),
            ]])
            ->response();
    }

    public function show(JobApplication $job_application): JsonResponse
    {
        $job_application->load(['opening:id,title,slug', 'reviewer:id,name']);

        return response()->json(['data' => new AdminJobApplicationResource($job_application)]);
    }

    /** Move a candidate along, with a note for colleagues. */
    public function status(Request $request, JobApplication $job_application): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(ApplicationStatus::values())],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $job_application->forceFill([
            'status' => $data['status'],
            'status_note' => $data['note'] ?? $job_application->status_note,
            'reviewed_by' => $request->user()->id,
            'reviewed_at' => now(),
        ])->save();

        return response()->json([
            'data' => new AdminJobApplicationResource($job_application->load(['opening:id,title,slug', 'reviewer:id,name'])),
        ]);
    }

    /**
     * The CV, streamed.
     *
     * The only way to read one. It lives on the private disk under a hashed
     * name, so there is no URL to guess and nothing to leak by sharing a link —
     * this route is behind the admin session, and the file has no existence
     * outside it.
     *
     * `Content-Disposition: attachment` is not decoration: a PDF rendered
     * inline is a document from a stranger executing in the console's origin.
     */
    public function downloadCv(JobApplication $job_application): StreamedResponse
    {
        abort_unless($job_application->hasCv(), 404);

        $disk = Storage::disk($job_application->cv_disk ?? 'local');

        abort_unless($disk->exists($job_application->cv_path), 404);

        return $disk->download(
            $job_application->cv_path,
            $job_application->cv_filename ?: 'cv',
            ['Content-Disposition' => 'attachment'],
        );
    }

    /**
     * Delete a candidate's record on request.
     *
     * Somebody who applied has no account to come back and remove themselves,
     * so "please delete my details" has to be something staff can act on. The
     * CV goes with the row — the model's `deleting` hook sees to that however
     * the record is removed.
     */
    public function destroy(JobApplication $job_application): JsonResponse
    {
        $job_application->delete();

        return response()->json(['message' => 'Application deleted, CV included.']);
    }
}
