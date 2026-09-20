<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CampaignStatus;
use App\Enums\EnrolmentStatus;
use App\Enums\SequenceStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\NewsletterSequenceEnrolmentResource;
use App\Http\Resources\Admin\NewsletterSequenceResource;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSequence;
use App\Models\NewsletterSequenceEnrolment;
use App\Models\NewsletterTemplate;
use App\Support\HtmlSanitiser;
use App\Support\Newsletter\Branding;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use App\Support\Newsletter\Sequences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Automation sequences and their steps, enrolments and report.
 *
 * A step is a `NewsletterCampaign` row, so its *content* is edited through
 * the campaign endpoints and the console's campaign editor; what is managed
 * here is the shape of the sequence — which steps, in what order, how many
 * days apart — and who is in it.
 */
class NewsletterSequenceController extends Controller
{
    public function index(): JsonResource
    {
        $sequences = NewsletterSequence::query()
            ->with('group:id,name')
            ->withCount([
                'steps',
                'enrolments as active_enrolments' => fn ($q) => $q->where('status', EnrolmentStatus::Active->value),
            ])
            ->orderBy('name')
            ->get();

        return NewsletterSequenceResource::collection($sequences)->additional([
            'meta' => ['statuses' => SequenceStatus::options()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: true);

        $sequence = NewsletterSequence::create([
            ...$data,
            'status' => $data['status'] ?? SequenceStatus::Active->value,
            'created_by' => $request->user()?->id,
        ]);

        return (new NewsletterSequenceResource($this->loaded($sequence)))->response()->setStatusCode(201);
    }

    public function show(NewsletterSequence $sequence): JsonResource
    {
        return new NewsletterSequenceResource($this->loaded($sequence));
    }

    public function update(Request $request, NewsletterSequence $sequence): JsonResponse
    {
        $data = $this->validated($request);

        /*
         * Switching a sequence on is the send gate. A campaign is checked at
         * the moment it is sent; a step is sent by the runner for months, so
         * the moment that corresponds is the one where the sequence starts
         * running. Every step is checked and the first blocking failure
         * names its step — `errors.health`, the same key `send` uses.
         */
        $activating = ($data['status'] ?? null) === SequenceStatus::Active->value
            && $sequence->status !== SequenceStatus::Active;

        if ($activating) {
            foreach ($sequence->steps()->get() as $step) {
                $blocking = HealthCheck::run($step)['blocking'];

                if ($blocking !== []) {
                    return response()->json([
                        'message' => 'Step '.$step->sequence_position.' is not ready to send.',
                        'errors' => ['health' => array_map(fn ($b) => 'Step '.$step->sequence_position.': '.$b, $blocking)],
                    ], 422);
                }
            }
        }

        $sequence->update($data);

        /*
         * The sender lives on the sequence and is copied onto every step,
         * because the step campaign is what `CampaignMessage` reads the From
         * from. Copied on every save so a change here reaches every step;
         * the campaign editor shows the fields disabled on a step.
         */
        if (array_intersect_key($data, array_flip(['from_name', 'from_email', 'reply_to'])) !== []) {
            $sequence->steps()->update([
                'from_name' => $sequence->from_name,
                'from_email' => $sequence->from_email,
                'reply_to' => $sequence->reply_to,
            ]);
        }

        if ($activating) {
            $sequence->steps()->get()->each(fn (NewsletterCampaign $s) => Sequences::prepare($s));
        }

        return (new NewsletterSequenceResource($this->loaded($sequence->fresh())))->response();
    }

    /**
     * Delete a sequence and its steps.
     *
     * Refused while anybody is still enrolled: an active enrolment is a
     * promise of messages to come, and deleting it silently is how somebody
     * who was told to expect a series gets half of one. Pause it, or cancel
     * the enrolments, and then delete.
     */
    public function destroy(NewsletterSequence $sequence): JsonResponse
    {
        $active = $sequence->enrolments()->where('status', EnrolmentStatus::Active->value)->count();

        if ($active > 0) {
            return response()->json([
                'message' => $active.' '.Str::plural('person', $active).' still '.($active === 1 ? 'is' : 'are')
                    .' enrolled in this sequence. Pause it or cancel their enrolments before deleting it.',
            ], 422);
        }

        $sequence->delete();

        return response()->json(null, 204);
    }

    /**
     * Add a step: a new campaign row at the end of the sequence.
     *
     * A template's blocks are copied server-side, the rule the campaigns
     * follow (the gallery omits them, so a browser has nothing to post). The
     * sender is the sequence's. Born `automation`, positioned after the last.
     */
    public function storeStep(Request $request, NewsletterSequence $sequence): JsonResponse
    {
        $data = $request->validate([
            'subject' => ['required', 'string', 'max:190'],
            'delay_days' => ['required', 'integer', 'min:0', 'max:365'],
            'newsletter_template_id' => ['nullable', 'integer', 'exists:newsletter_templates,id'],
        ]);

        $blocks = [];

        if (filled($data['newsletter_template_id'] ?? null)) {
            $template = NewsletterTemplate::find($data['newsletter_template_id']);
            $blocks = $template === null ? [] : ($template->blocks ?? []);
        }

        $html = $blocks === [] ? null : EmailRenderer::render($blocks, Branding::all());
        $position = (int) $sequence->steps()->max('sequence_position') + 1;

        $step = NewsletterCampaign::create([
            'sequence_id' => $sequence->id,
            'sequence_position' => $position,
            'delay_days' => $data['delay_days'],
            'newsletter_template_id' => $data['newsletter_template_id'] ?? null,
            'created_by' => $request->user()?->id,
            'name' => mb_substr($sequence->name.' — step '.$position, 0, 190),
            'subject' => $data['subject'],
            'from_name' => $sequence->from_name,
            'from_email' => $sequence->from_email,
            'reply_to' => $sequence->reply_to,
            'blocks' => $blocks,
            'html_content' => $html,
            'text_content' => $html === null ? null : HtmlSanitiser::toText($html),
            'status' => CampaignStatus::Automation,
        ]);

        Sequences::prepare($step);

        return (new NewsletterSequenceResource($this->loaded($sequence->fresh())))->response()->setStatusCode(201);
    }

    /** Change a step's delay. Its content is the campaign editor's. */
    public function updateStep(Request $request, NewsletterSequence $sequence, NewsletterCampaign $campaign): JsonResponse
    {
        $this->assertStepOf($sequence, $campaign);

        $data = $request->validate(['delay_days' => ['required', 'integer', 'min:0', 'max:365']]);

        $campaign->update(['delay_days' => $data['delay_days']]);

        return (new NewsletterSequenceResource($this->loaded($sequence->fresh())))->response();
    }

    /**
     * Reorder the steps: `ids[]` must be exactly the sequence's steps, and
     * they are renumbered 1..n in that order. An enrolment waits on a
     * position, so whoever was due step 2 gets whatever is now second.
     */
    public function reorderSteps(Request $request, NewsletterSequence $sequence): JsonResponse
    {
        $data = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['integer'],
        ]);

        $current = $sequence->steps()->pluck('id')->all();
        $ids = array_map('intval', $data['ids']);

        if (count($ids) !== count($current) || array_diff($ids, $current) !== [] || count(array_unique($ids)) !== count($ids)) {
            return response()->json([
                'message' => 'The order must name every step of this sequence exactly once.',
                'errors' => ['ids' => ['The order must name every step of this sequence exactly once.']],
            ], 422);
        }

        $this->renumber($sequence, $ids);

        return (new NewsletterSequenceResource($this->loaded($sequence->fresh())))->response();
    }

    /**
     * Remove a step. The rest are renumbered so the positions stay 1..n; an
     * enrolment past the end is completed by the runner the next time it
     * looks, since there is nothing left at its position.
     */
    public function destroyStep(NewsletterSequence $sequence, NewsletterCampaign $campaign): JsonResponse
    {
        $this->assertStepOf($sequence, $campaign);

        $campaign->delete();

        $this->renumber($sequence, $sequence->steps()->pluck('id')->all());

        return response()->json(null, 204);
    }

    /**
     * Enrol by hand: named subscribers, a group's members, pasted addresses.
     * Answers a count per outcome — the refused ones are the interesting
     * ones, as with every import here.
     */
    public function enrol(Request $request, NewsletterSequence $sequence): JsonResponse
    {
        $data = $request->validate([
            'subscriber_ids' => ['sometimes', 'array'],
            'subscriber_ids.*' => ['integer'],
            'group_id' => ['nullable', 'integer', 'exists:newsletter_groups,id'],
            'emails' => ['sometimes', 'array', 'max:500'],
            'emails.*' => ['string', 'max:190'],
        ]);

        $emails = array_values(array_unique(array_filter(array_map(
            fn ($e) => Str::lower(trim((string) $e)),
            $data['emails'] ?? [],
        ))));

        if (($data['subscriber_ids'] ?? []) === [] && blank($data['group_id'] ?? null) && $emails === []) {
            return response()->json([
                'message' => 'Name some subscribers, a group, or paste some addresses.',
                'errors' => ['emails' => ['Name some subscribers, a group, or paste some addresses.']],
            ], 422);
        }

        $tally = Sequences::enrolMany(
            $sequence,
            array_map('intval', $data['subscriber_ids'] ?? []),
            filled($data['group_id'] ?? null) ? (int) $data['group_id'] : null,
            $emails,
        );

        return response()->json(['data' => $tally]);
    }

    public function enrolments(Request $request, NewsletterSequence $sequence): JsonResource
    {
        $rows = $sequence->enrolments()
            ->with('subscriber:id,email,first_name,last_name,status')
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return NewsletterSequenceEnrolmentResource::collection($rows)->additional([
            'meta' => ['statuses' => EnrolmentStatus::options()],
        ]);
    }

    /** Stop one enrolment. Nothing already sent is unsent; nothing more goes. */
    public function cancelEnrolment(NewsletterSequence $sequence, NewsletterSequenceEnrolment $enrolment): JsonResponse
    {
        if ($enrolment->newsletter_sequence_id !== $sequence->id) {
            abort(404);
        }

        if ($enrolment->status !== EnrolmentStatus::Active) {
            return response()->json(['message' => 'This enrolment is already '.strtolower($enrolment->status->label()).'.'], 422);
        }

        $enrolment->update(['status' => EnrolmentStatus::Cancelled, 'cancelled_reason' => 'Cancelled by staff.']);

        return (new NewsletterSequenceEnrolmentResource($enrolment->fresh()->load('subscriber')))->response();
    }

    /**
     * Per step: sent, opened, clicked off the step's recipient rows — the
     * same expressions the subject-test report uses — and the enrolments by
     * status. Counts, never rates: a rate needs its denominator beside it.
     */
    public function report(NewsletterSequence $sequence): JsonResponse
    {
        $steps = $sequence->steps()
            ->withCount([
                'recipients as sent' => fn ($q) => $q->where('status', 'sent'),
                'recipients as opened' => fn ($q) => $q->whereNotNull('opened_at'),
                'recipients as clicked' => fn ($q) => $q->whereNotNull('clicked_at'),
            ])
            ->get()
            ->map(fn (NewsletterCampaign $c) => [
                'id' => $c->id,
                'position' => $c->sequence_position,
                'subject' => $c->subject,
                'delay_days' => $c->delay_days,
                'sent' => (int) $c->getAttribute('sent'),
                'opened' => (int) $c->getAttribute('opened'),
                'clicked' => (int) $c->getAttribute('clicked'),
            ])
            ->values();

        return response()->json(['data' => [
            'sequence' => ['id' => $sequence->id, 'name' => $sequence->name, 'status' => $sequence->status->value],
            'steps' => $steps,
            'enrolments' => $this->enrolmentCounts($sequence),
        ]]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $creating = false): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:190'],
            'status' => ['sometimes', Rule::in(array_column(SequenceStatus::cases(), 'value'))],
            'newsletter_group_id' => ['nullable', 'integer', 'exists:newsletter_groups,id'],
            'from_name' => ['nullable', 'string', 'max:120'],
            'from_email' => ['nullable', 'string', 'email:rfc', 'max:190'],
            'reply_to' => ['nullable', 'string', 'email:rfc', 'max:190'],
        ]);
    }

    private function loaded(NewsletterSequence $sequence): NewsletterSequence
    {
        $sequence->load([
            'group:id,name', 'author:id,name',
            'steps' => fn ($q) => $q->withCount(['recipients as sent_count' => fn ($r) => $r->where('status', 'sent')]),
        ]);
        $sequence->setAttribute('enrolment_counts', $this->enrolmentCounts($sequence));

        return $sequence;
    }

    /** @return array{active: int, completed: int, cancelled: int} */
    private function enrolmentCounts(NewsletterSequence $sequence): array
    {
        $rows = $sequence->enrolments()->toBase()
            ->selectRaw('status, count(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'active' => (int) ($rows[EnrolmentStatus::Active->value] ?? 0),
            'completed' => (int) ($rows[EnrolmentStatus::Completed->value] ?? 0),
            'cancelled' => (int) ($rows[EnrolmentStatus::Cancelled->value] ?? 0),
        ];
    }

    /** @param array<int, int> $orderedIds */
    private function renumber(NewsletterSequence $sequence, array $orderedIds): void
    {
        foreach (array_values($orderedIds) as $i => $id) {
            NewsletterCampaign::whereKey($id)->where('sequence_id', $sequence->id)
                ->update(['sequence_position' => $i + 1, 'updated_at' => now()]);
        }
    }

    private function assertStepOf(NewsletterSequence $sequence, NewsletterCampaign $campaign): void
    {
        // A 404, never a 403: a campaign that is not this sequence's step is
        // not something this address knows about.
        if ($campaign->sequence_id !== $sequence->id || ! $campaign->isStep()) {
            abort(404);
        }
    }
}
