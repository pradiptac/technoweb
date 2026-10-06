<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\FormResource;
use App\Models\Form;
use App\Models\FormSubmission;
use App\Notifications\FormAcknowledged;
use App\Notifications\FormSubmitted;
use App\Support\Crm\LeadIntake;
use App\Support\Forms\FormUploads;
use App\Support\FormValidator;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class FormController extends Controller
{
    /**
     * The definition a page needs to render the form.
     *
     * A form with nothing to answer is a 404 — and a form made only of
     * headings and step breaks has nothing to answer, so it counts.
     */
    public function show(string $slug): JsonResource
    {
        $form = Form::query()->published()->where('slug', $slug)->with('fields')->first();

        abort_if(! $form || $form->valueFields()->isEmpty(), 404);

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

        abort_if(! $form || $form->valueFields()->isEmpty(), 404);

        // Silently accepted, never stored. Telling a bot it was caught is
        // telling it what to change.
        if (filled($request->input('website'))) {
            return response()->json([
                'message' => $form->success_message ?: 'Thank you — we will be in touch shortly.',
                'redirect_url' => $form->redirect_url,
            ], 201);
        }

        /*
         * `all()` is the input and the files together, so one validator reads
         * a JSON body and a `multipart/form-data` one alike — the second being
         * what a form with a file field has to send. What comes back is only
         * what the definition asked for: unknown keys gone, a field its
         * `show_if` hid gone with whatever was posted for it, a hidden
         * field's value taken from the definition rather than the request.
         */
        ['data' => $data, 'uploads' => $uploads] = FormValidator::validate($form, $request->all());

        // After validation, so nothing is written for a refused submission;
        // before the row, so the row is never without the files it names.
        $files = FormUploads::store($form, $uploads);

        try {
            $submission = FormSubmission::create([
                'form_id' => $form->id,
                // Kept alongside the id so a submission still says which form
                // it came through after that form is renamed or deleted.
                'form_slug' => $form->slug,
                'data' => $data,
                'files' => $files ?: null,
                'ip_address' => $request->ip(),
            ]);
        } catch (\Throwable $e) {
            FormUploads::discard($files);

            throw $e;
        }

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

        /*
         * And a receipt to whoever sent it, which for a long time nothing sent.
         *
         * The desk was told and the person who filled the form in was not, so
         * somebody who mistyped their address found out days later when a reply
         * bounced — having spent that time believing they had been in touch.
         * The same order as the careers form: desk first, sender second, both
         * through `Notifier`, which swallows a mail failure because the
         * submission is already saved.
         *
         * `submitterEmail()` returns null for a form that never asked for an
         * address, and `Notifier::to()` treats that as no recipient — so a
         * three-question poll acknowledges nobody and nothing here has to
         * remember to check.
         */
        Notifier::to($form->submitterEmail($submission), new FormAcknowledged($form, $submission));

        return response()->json([
            'message' => $form->success_message ?: 'Thank you — we will be in touch shortly.',
            // Where to send the visitor instead of showing `message`, or null.
            'redirect_url' => $form->redirect_url,
            'data' => ['id' => $submission->id],
        ], 201);
    }
}
