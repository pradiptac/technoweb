<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\Copilot\Copilot;
use App\Support\Copilot\Question;
use App\Support\Copilot\Questions;
use App\Support\Seo\Ai\SeoAiSettings;
use App\Support\Seo\Ai\SeoAssistant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Ask ALTIS (0.177.0, `docs/copilot.md`).
 *
 * Staff-wide rather than role-gated, like `/admin/search` and
 * `/admin/new-since`, and for the same reason: every role has questions of
 * its own, and the **controller** narrows the list to the ones this account
 * may ask before anything else happens. A role-gated route would have to
 * pick one role to belong to.
 *
 * The narrowing is `Questions::for($roles)`, which runs before the words
 * are matched and before a model is shown anything — so a support engineer
 * asking about revenue is not refused, it is simply not a question that
 * exists for them, and the model is never even offered it.
 */
class CopilotController extends Controller
{
    public function __construct(private Copilot $copilot) {}

    /**
     * What this account may ask, and whether the model is behind it.
     *
     * The drawer draws its suggestions from this; it lists nothing of its
     * own, the rule every options list in this console follows.
     */
    public function index(Request $request): JsonResponse
    {
        return response()->json([
            'data' => array_map(
                fn (Question $q) => $q->toArray(),
                Questions::for(self::roles($request)),
            ),
            'meta' => [
                /*
                 * Whether a phrasing the words miss can still be matched.
                 * The copilot answers either way — the rules are first and
                 * usually enough — so this is drawn as a note and never as
                 * a refusal.
                 */
                'ai' => SeoAiSettings::enabled()
                    && filled(SeoAiSettings::apiKey())
                    && SeoAssistant::underDailyCap(),
            ],
        ]);
    }

    public function ask(Request $request): JsonResponse
    {
        $data = $request->validate([
            'question' => ['required', 'string', 'max:300'],
        ]);

        return response()->json([
            'data' => $this->copilot->ask($data['question'], self::roles($request)),
        ]);
    }

    /** @return list<string> */
    private static function roles(Request $request): array
    {
        return $request->user()?->roles->pluck('slug')->all() ?? [];
    }
}
