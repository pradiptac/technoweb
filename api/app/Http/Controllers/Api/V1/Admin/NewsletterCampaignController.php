<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\CampaignStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\NewsletterCampaignResource;
use App\Mail\CampaignMessage;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterCampaignRecipient;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterTemplate;
use App\Models\Setting;
use App\Support\HtmlSanitiser;
use App\Support\Newsletter\AudienceResolver;
use App\Support\Newsletter\CampaignSender;
use App\Support\Newsletter\EmailRenderer;
use App\Support\Newsletter\HealthCheck;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class NewsletterCampaignController extends Controller
{
    public function index(Request $request): JsonResource
    {
        $campaigns = NewsletterCampaign::query()
            ->with(['groups:id,name', 'author:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('q'), fn ($q) => $q->where(fn ($w) => $w
                ->where('name', 'like', '%'.$request->string('q').'%')
                ->orWhere('subject', 'like', '%'.$request->string('q').'%')))
            ->latest('id')
            ->paginate(min($request->integer('per_page', 20), 100))
            ->withQueryString();

        return NewsletterCampaignResource::collection($campaigns)->additional([
            'meta' => ['statuses' => CampaignStatus::options()],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, creating: true);

        /*
         * A template's blocks are copied here, not by the browser.
         *
         * The gallery deliberately omits `blocks` — ten templates at six
         * kilobytes each is sixty to draw a grid of names — so a client asked
         * to post them back has nothing to post and the campaign arrives
         * empty. That is exactly what happened: the template was chosen, the
         * campaign was created, and the body was blank with nothing saying so.
         *
         * **Copied rather than referenced.** Editing a template later must not
         * rewrite a campaign somebody already wrote, and a sent campaign is
         * immutable by design — a reference would be a promise this cannot
         * keep.
         */
        if (blank($data['blocks'] ?? null) && filled($data['newsletter_template_id'] ?? null)) {
            $template = NewsletterTemplate::find($data['newsletter_template_id']);

            if ($template !== null) {
                $data['blocks'] = $template->blocks ?? [];
            }
        }

        $campaign = NewsletterCampaign::create([
            ...$this->prepare($data),
            'created_by' => $request->user()?->id,
            'status' => CampaignStatus::Draft,
        ]);

        $this->syncGroups($campaign, $data);

        /*
         * `->response()`, never `response()->json($resource)`.
         *
         * The second serialises a resource through `jsonSerialize()`, which
         * returns the resolved array **without** the `data` wrapper — so a
         * created campaign came back shaped unlike every other read of one,
         * the client's `res.data` was undefined, and the console reported
         * "could not be created" for a campaign that had just been created.
         * Measured; the row existed and the screen denied it.
         */
        return (new NewsletterCampaignResource($campaign->load('groups')))
            ->response()
            ->setStatusCode(201);
    }

    public function show(NewsletterCampaign $campaign): JsonResource
    {
        return new NewsletterCampaignResource($campaign->load(['groups', 'author']));
    }

    public function update(Request $request, NewsletterCampaign $campaign): JsonResponse
    {
        /*
         * A campaign that has started is frozen, and this is the guard that
         * matters most after the send lock itself.
         *
         * Editing the HTML of a campaign mid-send would mean two halves of the
         * audience receiving different messages, and editing one after it has
         * gone would rewrite history the report is drawn from — the figures
         * would describe a message nobody was sent.
         */
        if (! $campaign->status->isEditable()) {
            return response()->json([
                'message' => 'This campaign has been sent and can no longer be edited. Duplicate it to make a new one.',
            ], 422);
        }

        $data = $this->validated($request);

        $campaign->update($this->prepare($data));
        $this->syncGroups($campaign, $data);

        return (new NewsletterCampaignResource($campaign->fresh()->load('groups')))->response();
    }

    public function destroy(NewsletterCampaign $campaign): JsonResponse
    {
        if ($campaign->status === CampaignStatus::Sending) {
            return response()->json(['message' => 'This campaign is being sent. Wait for it to finish.'], 422);
        }

        $campaign->delete();

        return response()->json(null, 204);
    }

    /**
     * A duplicate, which is the only way to "send again".
     *
     * Re-sending a campaign is refused everywhere else, so this is the escape
     * hatch: the copy is a draft with no recipients, no events and no history,
     * which is what makes the original's report remain true.
     */
    public function duplicate(NewsletterCampaign $campaign): JsonResponse
    {
        $copy = $campaign->replicate([
            'status', 'scheduled_at', 'started_at', 'completed_at',
            'recipient_count', 'health_score', 'test_sent_at',
        ]);

        $copy->name = mb_substr($campaign->name.' (copy)', 0, 190);
        $copy->status = CampaignStatus::Draft;
        $copy->save();

        $copy->groups()->sync($campaign->groups->pluck('id'));

        return (new NewsletterCampaignResource($copy->load('groups')))->response()->setStatusCode(201);
    }

    /** Who this would go to, and what was removed on the way. */
    public function audience(NewsletterCampaign $campaign): JsonResponse
    {
        $groupIds = $campaign->groups()->pluck('newsletter_groups.id')->all();

        return response()->json(['data' => AudienceResolver::preview($groupIds)]);
    }

    /** The deliverability heuristic. Stored, so the list can show it. */
    public function health(NewsletterCampaign $campaign): JsonResponse
    {
        $result = HealthCheck::run($campaign);

        $campaign->update(['health_score' => $result['score']]);

        return response()->json(['data' => $result]);
    }

    /**
     * Send one test message.
     *
     * Rendered exactly as the campaign will be, personalised against the
     * signed-in administrator so `{{first_name}}` is exercised rather than
     * skipped — and **it is not a recipient**: no row, no event, nothing that
     * reaches the report. A test that moved the numbers would make every
     * campaign's open rate wrong by however many times somebody checked it.
     */
    public function test(Request $request, NewsletterCampaign $campaign): JsonResponse
    {
        $data = $request->validate([
            'email' => ['nullable', 'string', 'email:rfc', 'max:190'],
        ]);

        $to = $data['email'] ?? $request->user()?->email;

        if (blank($to)) {
            return response()->json(['message' => 'No address to send the test to.'], 422);
        }

        $subscriber = new NewsletterSubscriber([
            'email' => $to,
            'first_name' => explode(' ', (string) $request->user()?->name)[0] ?? null,
            'company' => Setting::get('company_name'),
        ]);

        $base = rtrim((string) config('app.frontend_url'), '/');
        $fill = ['token' => 'test', 'unsubscribe_url' => $base.'/newsletter/unsubscribe/test'];

        $html = EmailRenderer::personalise((string) $campaign->html_content, $subscriber, $fill);
        $text = EmailRenderer::personalise((string) $campaign->text_content, $subscriber, $fill);

        try {
            /*
             * The one place in this module allowed to fail loudly, the same
             * licence `POST /admin/settings/mail/test` has: the whole point of
             * pressing it is to find out whether mail works, so swallowing the
             * error would answer the opposite of the question asked.
             */
            // `forceFill`, because `token` is deliberately outside `$fillable`:
            // it identifies a recipient in a tracking URL and is minted by the
            // model, never accepted from anything resembling input.
            $stand_in = (new NewsletterCampaignRecipient)->forceFill(['email' => $to, 'token' => 'test']);

            Mail::to($to)->send(new CampaignMessage($campaign, $html, $text, $stand_in));
        } catch (\Throwable $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        $campaign->update(['test_sent_at' => now()]);

        return response()->json(['message' => 'Test sent to '.$to.'.']);
    }

    /**
     * Send, or schedule.
     *
     * The blocking checks are re-run **here**, on the server, at the moment of
     * sending — not read from the stored score. A campaign edited after its
     * last health check would otherwise go out on a number that describes a
     * previous version of it, and the checks being blocked on are the legal
     * ones: an unsubscribe link, a sender identity, a text part.
     */
    public function send(Request $request, NewsletterCampaign $campaign): JsonResponse
    {
        $data = $request->validate([
            'scheduled_at' => ['nullable', 'date', 'after:now'],
        ]);

        if ($campaign->status->hasStarted()) {
            return response()->json(['message' => 'This campaign has already been sent.'], 422);
        }

        if ($campaign->groups()->count() === 0) {
            return response()->json([
                'message' => 'Choose at least one group to send to.',
                'errors' => ['group_ids' => ['A campaign with no audience has nobody to go to.']],
            ], 422);
        }

        $health = HealthCheck::run($campaign);
        $campaign->update(['health_score' => $health['score']]);

        if ($health['blocking'] !== []) {
            return response()->json([
                'message' => 'This campaign is not ready to send.',
                'errors' => ['health' => $health['blocking']],
            ], 422);
        }

        if (filled($data['scheduled_at'] ?? null)) {
            $campaign->update([
                'status' => CampaignStatus::Scheduled,
                'scheduled_at' => $data['scheduled_at'],
            ]);

            return response()->json([
                'data' => new NewsletterCampaignResource($campaign->fresh()->load('groups')),
                'message' => 'Scheduled.',
            ]);
        }

        $campaign->update(['status' => CampaignStatus::Ready]);

        $result = CampaignSender::queue($campaign->fresh());

        if (! $result['queued']) {
            return response()->json(['message' => $result['reason']], 422);
        }

        return response()->json([
            'data' => new NewsletterCampaignResource($campaign->fresh()->load('groups')),
            'message' => 'Sending to '.$result['recipients'].' recipients.',
        ]);
    }

    /** Stop a scheduled campaign before it goes. */
    public function cancel(NewsletterCampaign $campaign): JsonResponse
    {
        if ($campaign->status->hasStarted()) {
            return response()->json(['message' => 'This campaign has already started sending.'], 422);
        }

        $campaign->update(['status' => CampaignStatus::Cancelled]);

        return (new NewsletterCampaignResource($campaign->fresh()->load('groups')))->response();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $creating = false): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:190'],
            'subject' => [$creating ? 'required' : 'sometimes', 'string', 'max:190'],
            'preheader' => ['nullable', 'string', 'max:200'],
            'from_name' => ['nullable', 'string', 'max:120'],
            'from_email' => ['nullable', 'string', 'email:rfc', 'max:190'],
            'reply_to' => ['nullable', 'string', 'email:rfc', 'max:190'],
            'newsletter_template_id' => ['nullable', 'integer', 'exists:newsletter_templates,id'],
            'blocks' => ['sometimes', 'array'],
            'text_content' => ['nullable', 'string'],
            'group_ids' => ['sometimes', 'array'],
            'group_ids.*' => ['integer', 'exists:newsletter_groups,id'],
            'status' => ['sometimes', Rule::in([CampaignStatus::Draft->value, CampaignStatus::Ready->value])],
        ]);
    }

    /**
     * Render the blocks, and derive the text part.
     *
     * Rendering happens on **save** rather than on send, so what the health
     * check scores and what the preview shows is the same string that will go
     * out. Deriving it at send time would mean the thing reviewed is not the
     * thing sent.
     */
    private function prepare(array $data): array
    {
        $blocks = $data['blocks'] ?? null;

        if ($blocks === null) {
            return collect($data)->except(['group_ids', 'blocks'])->all();
        }

        $branding = [
            'company' => Setting::get('newsletter_company') ?: Setting::get('company_name'),
            'address' => Setting::get('newsletter_address'),
            'logo_url' => Setting::get('logo_path') ? asset('storage/'.Setting::get('logo_path')) : null,
            'preheader' => $data['preheader'] ?? null,
        ];

        $html = EmailRenderer::render($blocks, $branding);

        return [
            ...collect($data)->except(['group_ids'])->all(),
            'html_content' => $html,
            /*
             * The text part is generated when the editor has not written one,
             * and left alone when they have — `toText()` rather than
             * `strip_tags`, because that deletes a tag without leaving
             * anything in its place and runs the end of one block into the
             * start of the next. This project has already published a meta
             * description that way.
             */
            'text_content' => filled($data['text_content'] ?? null)
                ? $data['text_content']
                : HtmlSanitiser::toText($html),
        ];
    }

    private function syncGroups(NewsletterCampaign $campaign, array $data): void
    {
        if (array_key_exists('group_ids', $data)) {
            $campaign->groups()->sync($data['group_ids'] ?? []);
        }
    }
}
