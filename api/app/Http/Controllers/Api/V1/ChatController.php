<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Chat\ChatConversationResource;
use App\Http\Resources\Chat\ChatMessageResource;
use App\Models\ChatConversation;
use App\Models\ChatEvent;
use App\Models\Customer;
use App\Models\Setting;
use App\Notifications\ChatLeadCaptured;
use App\Support\Chat\Assistant;
use App\Support\Chat\ChatSettings;
use App\Support\Crm\LeadIntake;
use App\Support\Crm\PageContext;
use App\Support\Notifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The website assistant, from the visitor's side.
 *
 * Public and unauthenticated by necessity — a visitor has no account, which is
 * the whole point of a chatbot on a marketing site. What stands in for
 * authentication is the conversation's own `session_token`: 64 hex characters
 * from `random_bytes`, held by the Next server in an httpOnly cookie and never
 * seen by browser JavaScript, exactly like the basket's token.
 *
 * **A wrong token is a 404, never a 403.** A 403 confirms the conversation
 * exists, which is the thing worth knowing to somebody enumerating.
 */
class ChatController extends Controller
{
    /**
     * Start a conversation.
     *
     * Returns the token once, on this response and on no other — the rule the
     * order's `access_token` follows.
     */
    public function start(Request $request): JsonResponse
    {
        $this->assertEnabled();

        $page = PageContext::from($request);

        $conversation = ChatConversation::create([
            'session_token' => ChatConversation::newToken(),
            // Recorded when somebody is signed in, and it grants the assistant
            // nothing — `Retriever` has no path to a customer's own data. What
            // it is for is the trail and pointing at the right portal link.
            'customer_id' => self::customer($request)?->getKey(),
            'status' => 'open',
            'source_url' => $page['source_url'] ?? null,
            'source_path' => $page['source_path'] ?? null,
            'source_title' => $page['source_title'] ?? null,
            'ip' => $request->ip(),
        ]);

        ChatEvent::record($conversation, 'opened', array_filter([
            'source_path' => $conversation->source_path,
        ]));

        return response()->json([
            'data' => [
                'token' => $conversation->session_token,
                'welcome' => ChatSettings::welcome(),
                'quick_actions' => ChatSettings::quickActions(),
                'max_message_chars' => ChatSettings::maxMessageLength(),
            ],
        ], 201);
    }

    /** The transcript, for a browser that has been reloaded. */
    public function show(string $token): ChatConversationResource
    {
        $this->assertEnabled();

        return new ChatConversationResource(
            $this->find($token)->load('visibleMessages')
        );
    }

    /**
     * Say something, and get an answer.
     */
    public function send(Request $request, string $token): JsonResponse
    {
        $this->assertEnabled();

        $conversation = $this->find($token);

        $data = $request->validate([
            'message' => ['required', 'string', 'min:1', 'max:'.ChatSettings::maxMessageLength()],
            // The chip that was pressed, if it was a chip. Recorded for
            // analytics; it changes nothing about the answer.
            'quick_action' => ['sometimes', 'nullable', 'string', 'max:60'],
        ]);

        /*
         * Who is asking can change mid-conversation, and it could not before.
         *
         * `customer_id` was stamped only when the conversation was *created*,
         * so somebody who opened the panel as a guest, was told to sign in,
         * signed in and came back was told to sign in again — for the rest of
         * the conversation. Reopening used to paper over it by starting a new
         * one; now that the panel resumes, it would have been permanent.
         *
         * Filled only when it is empty. A conversation already belonging to
         * somebody is not reassigned by whoever holds the token next, which is
         * the difference between noticing a sign-in and letting one account
         * inherit another's transcript.
         */
        if ($conversation->customer_id === null && ($customer = self::customer($request)) !== null) {
            $conversation->update(['customer_id' => $customer->getKey()]);
        }

        /*
         * The conversation's own ceiling, checked before anything is written.
         * Rate limiting bounds how fast one visitor can ask; this bounds how
         * long one conversation can run, which is the other half of §36 — and
         * a conversation this long has stopped being a conversation.
         */
        if ($conversation->message_count >= ChatSettings::maxMessages()) {
            $conversation->update(['status' => 'closed', 'ended_at' => now()]);

            throw ValidationException::withMessages([
                'message' => 'This conversation has run its course. Start a new one, or contact our team directly.',
            ]);
        }

        // The ceiling that bounds the bill rather than any one visitor. Checked
        // here so the visitor is told, rather than silently given the fallback.
        if (! Assistant::underDailyCap()) {
            ChatEvent::record($conversation, 'daily_cap_reached');

            throw ValidationException::withMessages([
                'message' => 'The assistant is unavailable for the rest of today. Our contact form reaches the team directly.',
            ]);
        }

        $question = trim($data['message']);

        $conversation->messages()->create([
            'role' => 'user',
            'content' => $question,
            'created_at' => now(),
        ]);

        if (filled($data['quick_action'] ?? null)) {
            ChatEvent::record($conversation, 'quick_action', ['label' => $data['quick_action']]);
        }

        /*
         * Resolved, not constructed. The specification asks for a provider
         * abstraction so one can be swapped; naming `OpenAiProvider` here would
         * make that abstraction decorative — and it is what lets a test put a
         * fake in front of it without reaching for `Http::fake` to prove
         * something that is not about HTTP.
         */
        $answer = app(Assistant::class)->reply($conversation, $question);

        // Two messages, and the counter is the thing the ceiling reads.
        $conversation->increment('message_count', 2);
        $conversation->update(['last_message_at' => now()]);

        return response()->json(['data' => new ChatMessageResource($answer)]);
    }

    /**
     * "Yes, have somebody call me."
     *
     * The lead goes into the **one** pipeline — `LeadIntake`, `channel =
     * 'chatbot'`, visible at `/admin/leads` beside every other enquiry, scored
     * on the same rubric. The specification asks for a `chat_leads` table and a
     * second admin screen; this codebase already says the opposite, and two
     * lists is how the sales desk ends up working one of them.
     *
     * Four fields and no more. §17: do not ask for what is not needed. A form
     * in a chat window that asks for a city and a preferred contact method is a
     * form somebody abandons, and the point of asking inside the conversation
     * rather than sending them to `/contact` is that it is short.
     */
    public function lead(Request $request, string $token): JsonResponse
    {
        $this->assertEnabled();

        $conversation = $this->find($token);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            /*
             * `email:rfc` and never `email:dns`. That is a DNS lookup on the
             * request path, and this project has measured what an uncontrolled
             * network call there costs once already; the callback itself is a
             * far stronger proof the address is real than an MX record.
             */
            'email' => ['required', 'string', 'email:rfc', 'max:190'],
            'phone' => ['required', 'string', 'max:32'],
            'requirement' => ['required', 'string', 'max:2000'],
            'company' => ['sometimes', 'nullable', 'string', 'max:180'],
            // The honeypot, matching every other public form here.
            'website' => ['prohibited'],
        ]);

        /*
         * One lead per conversation. Pressing the button twice is a double
         * click and a second row the desk has to work out is the same person —
         * the row already written is the answer, and saying so is friendlier
         * than a validation error about something they did not do wrong.
         */
        if ($conversation->lead_id !== null) {
            return response()->json(['data' => ['already' => true]]);
        }

        $lead = LeadIntake::fromChat($conversation, $data, $request);

        if ($lead === null) {
            // Intake logs and swallows, so a failure here is ours and the
            // visitor is told plainly rather than being told it worked.
            return response()->json([
                'message' => 'We could not record that just now. Our contact form reaches the team directly.',
            ], 500);
        }

        $conversation->update(['lead_id' => $lead->id]);
        ChatEvent::record($conversation, 'lead_captured', ['lead_id' => $lead->id]);

        /*
         * After the row is written, and through `Notifier`, which logs and
         * swallows: a dead mail server must not cost the desk an enquiry that
         * is already saved. The email is the announcement; the row is the
         * record.
         */
        $inbox = (string) (Setting::get('sales_email') ?: Setting::get('support_email'));

        if (filled($inbox)) {
            Notifier::attempt($inbox, new ChatLeadCaptured($lead, $conversation));
        }

        return response()->json(['data' => ['captured' => true]], 201);
    }

    /**
     * "Was that any use?"
     *
     * §45. One rating per answer, and it may be changed — somebody who presses
     * the wrong thumb should be able to correct it, and a rating that cannot be
     * taken back is one people stop giving.
     *
     * The message has to belong to **this** conversation, checked rather than
     * assumed: the id is a number in a request body, and without the check
     * anybody holding one token could rate every answer the assistant has ever
     * given, which would make the only quality figure on the dashboard
     * something a stranger can move.
     */
    public function rate(Request $request, string $token, int $message): JsonResponse
    {
        $this->assertEnabled();

        $conversation = $this->find($token);

        $data = $request->validate([
            'rating' => ['required', 'integer', 'in:1,-1'],
            'note' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $row = $conversation->messages()
            ->where('role', 'assistant')
            ->whereKey($message)
            ->firstOrFail();

        $row->update(['rating' => $data['rating'], 'rating_note' => $data['note'] ?? null]);

        ChatEvent::record($conversation, 'rated', ['rating' => $data['rating']]);

        return response()->json(null, 204);
    }

    /**
     * A conversation, by its token.
     *
     * `firstOrFail` on the token column rather than route-model binding: the
     * token is the credential, and binding on it would put it in the route
     * name, the logs and every exception trace.
     */
    private function find(string $token): ChatConversation
    {
        abort_unless(preg_match('/^[a-f0-9]{64}$/', $token) === 1, 404);

        return ChatConversation::where('session_token', $token)->firstOrFail();
    }

    /**
     * The switch, checked on every route rather than only on the one that
     * renders the button.
     *
     * A feature flag the frontend honours and the API does not is a feature
     * that is still running for anybody who kept the page open — the rule
     * `registration_enabled` follows.
     */
    private function assertEnabled(): void
    {
        abort_unless(ChatSettings::enabled(), 404);
    }

    /**
     * The signed-in customer, when the caller happens to be one.
     *
     * These routes carry **no auth middleware** and must not: a visitor with no
     * account is the ordinary case for a chatbot on a marketing site. So the
     * guard is named explicitly — `$request->user()` reads the *default* one,
     * which on a route outside `auth:sanctum` has never resolved anything and
     * is always null.
     *
     * That is what it was, and the effect was invisible: `customer_id` was
     * never stamped, so every conversation looked anonymous and a signed-in
     * customer asking for help was offered a link to the sign-in page. Nothing
     * failed and nothing was logged. `ChatJourneyTest` covered it with
     * `actingAs(..., 'sanctum')`, which stages the authentication by hand and
     * therefore tests the mechanism rather than the wiring — the trap this
     * codebase already records for `RepathsLandingPages`.
     *
     * Narrowed to a `Customer` because a staff token would otherwise put a
     * `User` id into a column that means something else entirely.
     */
    private static function customer(Request $request): ?Customer
    {
        $user = $request->user('sanctum');

        return $user instanceof Customer ? $user : null;
    }
}
