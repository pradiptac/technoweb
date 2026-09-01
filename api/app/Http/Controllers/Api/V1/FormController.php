<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FormResource;
use App\Models\Form;
use App\Models\FormSubmission;
use App\Notifications\FormSubmitted;
use App\Support\Crm\LeadIntake;
use App\Support\FormValidator;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FormController extends Controller
{
    /** The definition a page needs to render the form. */
    public function show(string $slug): JsonResource
    {
        $form = Form::query()->published()->where('slug', $slug)->with('fields')->first();

        abort_if(! $form || $form->fields->isEmpty(), 404);

        return new FormResource($form);
    }

    /**
     * A submission.
     *
     * Throttled at the route, like `/enquiries`, and carrying the same
     * honeypot: a field a person never sees and a bot fills in. Both are
     * necessary — a throttle alone lets a slow bot through, and a honeypot
     * alone does nothing against one that reads the markup.
     */
    public function store(Request $request, string $slug): JsonResponse
    {
        $form = Form::query()->published()->where('slug', $slug)->with('fields')->first();

        abort_if(! $form || $form->fields->isEmpty(), 404);

        // Silently accepted, never stored. Telling a bot it was caught is
        // telling it what to change.
        if (filled($request->input('website'))) {
            return response()->json(['message' => $form->success_message ?: 'Thank you — we will be in touch shortly.'], 201);
        }

        $data = FormValidator::make($form, $request->all())->validate();

        $submission = FormSubmission::create([
            'form_id' => $form->id,
            // Kept alongside the id so a submission still says which form it
            // came through after that form is renamed or deleted.
            'form_slug' => $form->slug,
            'data' => $data,
            'ip_address' => $request->ip(),
        ]);

        /*
         * The pipeline record.
         *
         * Built from `$request` rather than from `$data`, and that is the point
         * of the underscore prefix: `FormValidator` drops every key the form
         * does not declare, so the page context would be discarded here along
         * with anything else somebody chose to POST. It is envelope, not an
         * answer, and it is read off the request accordingly.
         */
        $lead = LeadIntake::fromFormSubmission($submission, $form, $request);

        // A mail failure is logged and swallowed: the submission is already
        // saved, and telling somebody their message failed while it sits in
        // the database means they send it twice.
        if ($form->notify_email) {
            Notifier::to($form->notify_email, new FormSubmitted($form, $submission, $lead));
        } else {
            Notifier::route('sales_email', new FormSubmitted($form, $submission, $lead));
        }

        return response()->json([
            'message' => $form->success_message ?: 'Thank you — we will be in touch shortly.',
            'data' => ['id' => $submission->id],
        ], 201);
    }
}
