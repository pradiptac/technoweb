<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreJobApplicationRequest;
use App\Http\Resources\JobOpeningResource;
use App\Models\JobApplication;
use App\Models\JobOpening;
use App\Notifications\ApplicationAcknowledged;
use App\Notifications\JobApplicationReceived;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The public careers pages, and the form at the end of one.
 */
class CareersController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $openings = JobOpening::published()
            ->with(['experienceLevel', 'qualifications', 'seo'])
            ->when($request->filled('department'), fn ($q) => $q->where('department', $request->string('department')))
            ->when($request->filled('type'), fn ($q) => $q->where('employment_type', $request->string('type')))
            ->orderBy('sort_order')
            ->orderByDesc('published_at')
            ->get();

        return JobOpeningResource::collection($openings);
    }

    public function show(JobOpening $job_opening): JobOpeningResource
    {
        // `published()` and the 404 have to agree. A role that closed yesterday
        // is gone from the list, and its page must not still be taking
        // applications from whoever has the link.
        abort_unless($job_opening->isOpen(), 404);

        $job_opening->load(['experienceLevel', 'qualifications', 'seo']);

        return new JobOpeningResource($job_opening);
    }

    /**
     * An application.
     *
     * The upload is stored on the **private** disk under a hashed name. It is
     * never served from a URL — `Admin\JobApplicationController::downloadCv`
     * streams it to signed-in staff and nothing else can reach it. A public
     * path here would turn a careers form into file hosting for anyone who
     * finds it.
     */
    public function apply(StoreJobApplicationRequest $request, JobOpening $job_opening): JsonResponse
    {
        // Checked again here, not just on the page. A tab left open across a
        // closing date would otherwise post into a role nobody is hiring for.
        if (! $job_opening->isOpen()) {
            return response()->json([
                'message' => 'This role has closed. Have a look at what else is open.',
            ], 422);
        }

        // Answered exactly like a success: telling a bot it was caught tells it
        // what to change.
        if (filled($request->input('website'))) {
            return $this->received();
        }

        /*
         * The `local` disk, which is Laravel's private one -- its root is
         * `storage/app/private`, and it has no URL. The name is confusing and
         * worth stating: there is no disk called "private", and asking for one
         * throws. `StoresTicketAttachments` uses the same disk for the same
         * reason.
         */
        $path = $request->file('cv')->store('applications/'.$job_opening->id, 'local');

        $application = JobApplication::create([
            'job_opening_id' => $job_opening->id,
            // Copied, so the record still reads after the vacancy is deleted.
            'job_title' => $job_opening->title,
            'name' => trim((string) $request->string('name')),
            'email' => mb_strtolower(trim((string) $request->string('email'))),
            'phone' => $request->filled('phone') ? trim((string) $request->string('phone')) : null,
            'current_company' => $request->filled('current_company') ? trim((string) $request->string('current_company')) : null,
            'experience_years' => $request->filled('experience_years') ? $request->integer('experience_years') : null,
            'cover_letter' => $request->filled('cover_letter') ? trim((string) $request->string('cover_letter')) : null,
            'portfolio_url' => $request->filled('portfolio_url') ? trim((string) $request->string('portfolio_url')) : null,
            'cv_disk' => 'local',
            'cv_path' => $path,
            // The name they gave it, kept for the download only. The stored
            // path is hashed and is what everything else uses.
            'cv_filename' => mb_substr($request->file('cv')->getClientOriginalName(), 0, 255),
            'cv_mime' => $request->file('cv')->getClientMimeType(),
            'cv_size' => $request->file('cv')->getSize(),
            'ip_address' => $request->ip(),
        ]);

        Notifier::route('careers_email', new JobApplicationReceived($application), Notifier::setting('support_email'));
        Notifier::to($application->email, new ApplicationAcknowledged($application));

        return $this->received();
    }

    private function received(): JsonResponse
    {
        return response()->json([
            'message' => 'Thank you — your application is with us. We read every one, and we will be in touch if there is a fit.',
        ], 202);
    }
}
