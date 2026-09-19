<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\AiModel;
use App\Enums\SeoAiAction;
use App\Enums\SeoSuggestionStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\SeoSuggestionResource;
use App\Jobs\RunSeoSuggestion;
use App\Models\SeoSuggestion;
use App\Support\Chat\AiProvider;
use App\Support\QueueHealth;
use App\Support\Seo\Ai\SeoAiSettings;
use App\Support\Seo\Ai\SeoAssistant;
use App\Support\Seo\Ai\SeoContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The AI half of the SEO screens.
 *
 * Everything here is **admin-triggered**. There is no path from a public
 * request to any of it, which is how the specification's "never call OpenAI
 * during page rendering" is kept — by there being no such call to make rather
 * than by a rule somebody has to remember.
 *
 * **Nothing here writes an SEO field.** Running an action stores a suggestion;
 * accepting one records that a person accepted it. The values themselves reach
 * the record through its own form and its own update endpoint, with
 * `SeoRules` validating and `HtmlSanitiser` cleaning, exactly as a typed value
 * does. That is what makes "AI suggestions must not overwrite existing SEO
 * fields automatically" structural instead of remembered.
 */
class SeoAiController extends Controller
{
    /**
     * Run one action against one record.
     *
     * Refusals are 422 with a sentence somebody can act on — switched off, no
     * key, cap reached, provider silent. Never the provider's own words: those
     * carry model names, quota messages and organisation ids.
     */
    public function run(Request $request, string $action, SeoAssistant $assistant): JsonResponse
    {
        $case = SeoAiAction::tryFrom($action);

        abort_if($case === null, 404, 'No such AI action.');

        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(SeoController::types())],
            'id' => ['required', 'integer', 'min:1'],
        ]);

        $record = SeoController::locate($data['type'], $data['id']);

        abort_if($record === null, 404, 'That record no longer exists.');

        $result = $assistant->run($case, $record, $request->user()?->id);

        if (! $result->ok) {
            return response()->json([
                'message' => $result->error,
                'errors' => ['ai' => [$result->error]],
            ], 422);
        }

        return (new SeoSuggestionResource($result->suggestion))->response();
    }

    /**
     * Run one action against many records, on the queue.
     *
     * The overview names the records that fail a check; this queues one
     * `RunSeoSuggestion` per record and answers at once with what it did.
     * Three things bound it. The three refusals the assistant makes — off,
     * no key, cap reached — are made **here, before anything is queued**,
     * so a switched-off assistant does not fill the queue with jobs that
     * each refuse. A record that already holds a *pending* suggestion for
     * this action is skipped rather than asked again: the editor has an
     * answer waiting and has not read it, and a second one is a second
     * bill for the same question. And the number queued never exceeds what
     * is left of today's cap, so a bulk press cannot spend past it — the
     * jobs count runs as they land, so a press that queues more than the
     * cap allows would have the tail refuse one by one.
     *
     * 202, because nothing has been suggested yet: the suggestions arrive
     * as the queue drains, on each record's SEO panel and under `?ai=pending`
     * on the overview.
     */
    public function bulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', Rule::enum(SeoAiAction::class)],
            'type' => ['required', 'string', Rule::in(SeoController::types())],
            'ids' => ['required', 'array', 'min:1', 'max:25'],
            'ids.*' => ['integer', 'min:1'],
        ]);

        $action = SeoAiAction::from($data['action']);

        $refusal = match (true) {
            ! SeoAiSettings::enabled() => 'The AI SEO assistant is switched off. Turn it on in Settings → SEO defaults.',
            ! filled(SeoAiSettings::apiKey()) => 'No OpenAI key is configured. Add one in Settings → API keys.',
            ! SeoAssistant::underDailyCap() => 'The daily limit of '.SeoAiSettings::dailyCap().' AI requests has been reached. It resets at midnight.',
            default => null,
        };

        if ($refusal !== null) {
            return response()->json(['message' => $refusal, 'errors' => ['ai' => [$refusal]]], 422);
        }

        $cap = SeoAiSettings::dailyCap();
        $room = $cap === 0 ? PHP_INT_MAX : max(0, $cap - SeoAssistant::runsToday());

        $pending = SeoSuggestion::query()
            ->where('seoable_type', $data['type'])
            ->where('action', $action->value)
            ->where('status', SeoSuggestionStatus::Pending)
            ->whereIn('seoable_id', $data['ids'])
            ->pluck('seoable_id')
            ->all();

        $queued = 0;
        $skippedPending = 0;
        $skippedCap = 0;

        foreach (array_values(array_unique($data['ids'])) as $id) {
            if (in_array($id, $pending, true)) {
                $skippedPending++;

                continue;
            }

            if ($queued >= $room) {
                $skippedCap++;

                continue;
            }

            RunSeoSuggestion::dispatch($data['type'], (int) $id, $action, $request->user()?->id);
            $queued++;
        }

        return response()->json([
            'queued' => $queued,
            'skipped_pending' => $skippedPending,
            'skipped_cap' => $skippedCap,
            'delivering' => QueueHealth::delivering(),
        ], 202);
    }

    /** What has been suggested about one record, newest first. */
    public function suggestions(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(SeoController::types())],
            'id' => ['required', 'integer', 'min:1'],
        ]);

        $rows = SeoSuggestion::query()
            ->where('seoable_type', $data['type'])
            ->where('seoable_id', $data['id'])
            ->with(['user', 'decider'])
            ->latest()
            ->limit(50)
            ->get();

        return response()->json([
            'data' => SeoSuggestionResource::collection($rows)->resolve(),
            'meta' => self::meta(),
        ]);
    }

    /**
     * Record what somebody decided.
     *
     * Both decisions are reversible, and a decided suggestion may be decided
     * again: an editor who rejects a title and reconsiders an hour later should
     * not have to pay for the same call twice.
     */
    public function decide(Request $request, SeoSuggestion $seoSuggestion): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'string', Rule::in(SeoSuggestionStatus::decisions())],
        ]);

        $seoSuggestion->update([
            'status' => $data['status'],
            'decided_by' => $request->user()?->id,
            'decided_at' => now(),
        ]);

        return (new SeoSuggestionResource($seoSuggestion->fresh(['user', 'decider'])))->response();
    }

    /**
     * Exactly what the model would be told about this record.
     *
     * The specification asks for small prompts; this is what makes that a
     * measurement rather than a hope — the chatbot only knows its own prompt is
     * 718 tokens because somebody counted. It is also the one screen on which an
     * operator can see a prompt-injection attempt sitting in their own content,
     * fenced, before it costs anything.
     */
    public function context(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', Rule::in(SeoController::types())],
            'id' => ['required', 'integer', 'min:1'],
            'action' => ['nullable', 'string', Rule::in(array_column(SeoAiAction::cases(), 'value'))],
        ]);

        $record = SeoController::locate($data['type'], $data['id']);

        abort_if($record === null, 404, 'That record no longer exists.');

        $action = SeoAiAction::tryFrom((string) ($data['action'] ?? '')) ?? SeoAiAction::Generate;
        $text = SeoContext::build($action, $record);

        return response()->json([
            'data' => [
                'action' => $action->value,
                'context' => $text,
                'characters' => mb_strlen($text),
                'approximate_tokens' => SeoContext::approximateTokens($text),
            ],
        ]);
    }

    /**
     * One real call, to prove a model id is one this account can use.
     *
     * The `/admin/settings/mail/test` pattern, and it exists for the same
     * reason: a wrong model name and an account without access to a model are
     * both invisible until something tries, and the list of models offered in
     * the console will go stale because providers ship faster than this
     * application deploys.
     *
     * **This is allowed to report the provider's own words**, and that is the
     * whole value — "The model `gpt-5-turbo` does not exist" is what tells
     * somebody what to fix, where "could not connect" tells them nothing. It is
     * safe here in a way it is not on a visitor-facing path because the caller
     * is an authenticated `seo_manager` and the only thing they influence is
     * the model name.
     */
    public function testModel(Request $request, AiProvider $provider): JsonResponse
    {
        $data = $request->validate([
            'model' => ['nullable', 'string', 'max:64'],
        ]);

        if (! filled(SeoAiSettings::apiKey())) {
            return response()->json([
                'message' => 'No OpenAI key is configured. Add one in Settings → API keys.',
            ], 422);
        }

        $model = trim((string) ($data['model'] ?? '')) ?: SeoAiSettings::model();

        $reply = $provider->complete(
            [['role' => 'user', 'content' => 'Reply with the single word: ready.']],
            5,
            ['model' => $model],
        );

        if (! $reply->ok) {
            return response()->json([
                'message' => $reply->error,
                'errors' => ['model' => [$reply->error]],
            ], 422);
        }

        return response()->json([
            'data' => ['model' => $model, 'ok' => true, 'tokens' => $reply->tokens],
        ]);
    }

    /**
     * The lists and figures the console draws its controls from.
     *
     * Sent rather than retyped in TypeScript — the rule `schema_type_options`
     * and `meta.transitions` follow. `remaining` is **null when no cap is set**,
     * because zero means "no ceiling" in the setting and would read on a screen
     * as "none left", which is the opposite claim.
     */
    /** Public: the overview (`SeoController::index`) sends it too, so "Draft with AI" can know the assistant is on. */
    public static function meta(): array
    {
        $cap = SeoAiSettings::dailyCap();
        $used = SeoAssistant::runsToday();

        return [
            'enabled' => SeoAiSettings::enabled(),
            'configured' => filled(SeoAiSettings::apiKey()),
            'model' => SeoAiSettings::model(),
            'models' => AiModel::options(SeoAiSettings::model()),
            'actions' => SeoAiAction::options(),
            'today' => [
                'runs' => $used,
                'cap' => $cap,
                'remaining' => $cap === 0 ? null : max(0, $cap - $used),
                'reached' => $cap !== 0 && $used >= $cap,
            ],
            'usage' => self::usage(),
        ];
    }

    /**
     * What each model has produced and how much of it was accepted, over
     * the last ninety days — the retention window, so the figures describe
     * what is still on file. One grouped query. `acceptance` is applied over
     * decided, and **null rather than zero while nothing has been decided**
     * (the dashboard's rule for a rate over no sample): forty pending
     * suggestions are not a 0% acceptance rate. This is how the client
     * learns which model to keep paying for.
     *
     * @return array<int, array{model: string, suggestions: int, applied: int, rejected: int, pending: int, tokens: int, acceptance: float|null}>
     */
    public static function usage(): array
    {
        return SeoSuggestion::query()
            ->where('created_at', '>=', now()->subDays(90))
            ->selectRaw('model, count(*) as n, sum(status = ?) as applied, sum(status = ?) as rejected, sum(status = ?) as pending, coalesce(sum(tokens), 0) as tokens', [
                SeoSuggestionStatus::Applied->value, SeoSuggestionStatus::Rejected->value, SeoSuggestionStatus::Pending->value,
            ])
            ->groupBy('model')
            ->orderByDesc('n')
            ->get()
            ->map(function ($row) {
                $applied = (int) $row->getAttribute('applied');
                $rejected = (int) $row->getAttribute('rejected');
                $decided = $applied + $rejected;

                return [
                    'model' => (string) $row->getAttribute('model'),
                    'suggestions' => (int) $row->getAttribute('n'),
                    'applied' => $applied,
                    'rejected' => $rejected,
                    'pending' => (int) $row->getAttribute('pending'),
                    'tokens' => (int) $row->getAttribute('tokens'),
                    'acceptance' => $decided > 0 ? round($applied / $decided, 3) : null,
                ];
            })
            ->values()
            ->all();
    }
}
