<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\SurveyRating;
use App\Http\Controllers\Controller;
use App\Models\TicketSurvey;
use App\Support\Tickets\Survey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The satisfaction survey page's two calls (2026-09-30).
 *
 * Public, addressed by the 64-character token in the emailed link — which
 * stands in for a login the way an order's token does. A wrong token is a 404
 * and says nothing else. The token is never in a response, and the ticket is
 * named by reference and subject only: the same two things the email itself
 * carries.
 *
 * **Answering is a POST, and reading is not an answer.** The five links in
 * the email are GETs that mail scanners follow; recording on the GET would
 * let a scanner rate every ticket. The website's page records the rating the
 * link carried by POSTing from the browser as it opens, and again on every
 * press — one click for the customer, and a link that is merely fetched
 * records nothing.
 *
 * An answer may be changed, the chatbot's rating rule: one that cannot be
 * taken back is one people stop giving. `answered_at` keeps the moment of the
 * first answer.
 */
class TicketSurveyController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $survey = $this->find($token);

        return response()->json(['data' => $this->present($survey)]);
    }

    public function answer(Request $request, string $token): JsonResponse
    {
        $survey = $this->find($token);

        $data = $request->validate([
            'rating' => ['required', 'integer', Rule::in(array_map(fn (SurveyRating $r) => $r->value, SurveyRating::cases()))],
            'comment' => ['nullable', 'string', 'max:'.Survey::COMMENT_MAX],
        ]);

        $comment = trim((string) ($data['comment'] ?? ''));

        $survey->forceFill([
            'rating' => (int) $data['rating'],
            'comment' => $comment === '' ? null : $comment,
            'answered_at' => $survey->answered_at ?? now(),
        ])->save();

        return response()->json(['data' => $this->present($survey)]);
    }

    private function find(string $token): TicketSurvey
    {
        // A token has one shape; anything else is not worth a query.
        abort_unless(preg_match('/^[a-f0-9]{64}$/', $token) === 1, 404);

        $survey = TicketSurvey::query()->with('ticket')->where('token', $token)->first();

        abort_if($survey === null || $survey->ticket === null, 404);

        return $survey;
    }

    /** @return array<string, mixed> */
    private function present(TicketSurvey $survey): array
    {
        return [
            'reference' => $survey->ticket->reference,
            'subject' => $survey->ticket->subject,
            'answered' => $survey->isAnswered(),
            'rating' => $survey->rating,
            'rating_label' => $survey->ratingCase()?->label(),
            'comment' => $survey->comment,
            'ratings' => SurveyRating::options(),
            'comment_max' => Survey::COMMENT_MAX,
        ];
    }
}
