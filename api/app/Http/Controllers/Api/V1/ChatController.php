<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\Chat\ChatConversationResource;
use App\Http\Resources\Chat\ChatMessageResource;
use App\Models\ChatConversation;
use App\Models\ChatEvent;
use App\Support\Chat\Assistant;
use App\Support\Chat\ChatSettings;
use App\Support\Crm\PageContext;
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
            'customer_id' => $request->user()?->getKey(),
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
}
