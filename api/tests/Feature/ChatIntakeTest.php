<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\ChatConversation;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Setting;
use App\Support\Chat\Intake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * The assistant asks who it is talking to before it answers anything.
 *
 * Driven through the **endpoints**, not through `Intake` directly. Staging a
 * state machine by calling it by hand tests the mechanism and proves nothing
 * about the wiring — the trap this codebase records for `RepathsLandingPages`,
 * where the test called `$page->touch()` after a rename and therefore never
 * discovered that nothing was calling it.
 */
class ChatIntakeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Setting::query()->updateOrCreate(['key' => 'chatbot_enabled'], ['group' => 'chatbot', 'value' => '1', 'type' => 'boolean']);
        Setting::query()->updateOrCreate(['key' => 'chatbot_intake_enabled'], ['group' => 'chatbot', 'value' => '1', 'type' => 'boolean']);
        Setting::query()->updateOrCreate(['key' => 'chatbot_intake_questions'], ['group' => 'chatbot', 'value' => null, 'type' => 'text']);
    }

    /** @return array{token: string, body: array<string, mixed>} */
    private function open(): array
    {
        $res = $this->postJson('/api/v1/chat/conversations')->assertCreated();

        return ['token' => $res->json('data.token'), 'body' => $res->json('data')];
    }

    private function say(string $token, string $message): TestResponse
    {
        return $this->postJson("/api/v1/chat/conversations/{$token}/messages", ['message' => $message]);
    }

    public function test_the_first_question_arrives_with_the_conversation_and_is_stored(): void
    {
        ['token' => $token, 'body' => $body] = $this->open();

        // The opening turn rides on the create response, so the panel renders it
        // without a second round trip.
        $this->assertCount(1, $body['messages']);
        $this->assertStringContainsString('name', mb_strtolower($body['messages'][0]['content']));

        // And it is a real message, not chrome — otherwise every stored
        // transcript would begin with an answer to nothing.
        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertSame(1, $conversation->messages()->where('role', 'assistant')->count());
    }

    public function test_nothing_is_suggested_while_a_question_is_outstanding(): void
    {
        ['body' => $body] = $this->open();

        // The chips are suggestions, and the brief is that nothing is suggested
        // before the visitor has been asked who they are. Withheld by the API
        // rather than hidden by the widget.
        $this->assertSame([], $body['quick_actions']);
    }

    public function test_it_walks_the_steps_one_at_a_time_and_files_a_lead(): void
    {
        ['token' => $token] = $this->open();

        $this->say($token, 'Neil Basu')->assertOk();
        $this->say($token, 'neil@example.in')->assertOk();
        $this->say($token, '+91 98311 00758')->assertOk();
        $this->say($token, 'Meridian Foods')->assertOk();

        $this->assertNull(Lead::query()->first(), 'The lead is written when intake completes, not before.');

        // The closing step's answer is the requirement *and* the first real
        // question, so this turn also produces an ordinary answer.
        $this->say($token, 'Do you supply network switches?')->assertOk();

        $lead = Lead::query()->firstOrFail();
        $this->assertSame('Neil Basu', $lead->name);
        $this->assertSame('neil@example.in', $lead->email);
        $this->assertSame('Meridian Foods', $lead->company);
        $this->assertSame('chatbot', $lead->channel);
        $this->assertStringContainsString('switches', (string) $lead->message);

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertNotNull($conversation->intake_completed_at);
        $this->assertSame($lead->id, $conversation->lead_id);
    }

    public function test_a_step_can_be_declined_and_the_conversation_carries_on(): void
    {
        ['token' => $token] = $this->open();

        $this->say($token, 'Neil Basu');
        $this->say($token, 'neil@example.in');
        $reply = $this->say($token, 'skip')->assertOk();

        // Declining the phone moves to the next question rather than asking
        // again — a visitor who will not give a number still gets an answer.
        $this->assertStringContainsString('company', mb_strtolower($reply->json('data.content')));

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertContains('phone', $conversation->intake_data['_skipped'] ?? []);
    }

    public function test_a_bad_answer_is_queried_once_and_then_let_go(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Neil Basu');

        $first = $this->say($token, 'not an address')->assertOk();
        $this->assertStringContainsString('email address', mb_strtolower($first->json('data.content')));

        // Second miss: let it go rather than ask a third time. A loop is a
        // conversation somebody escapes by closing the panel.
        $second = $this->say($token, 'still not an address')->assertOk();
        $this->assertStringContainsString('number', mb_strtolower($second->json('data.content')));

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertContains('email', $conversation->intake_data['_skipped'] ?? []);
    }

    public function test_a_question_is_not_taken_as_a_name(): void
    {
        ['token' => $token] = $this->open();

        $reply = $this->say($token, 'do you sell switches?')->assertOk();

        // Without this, "do you sell switches?" is filed as somebody's name and
        // sent to the sales desk — wrong, and wrong silently.
        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertArrayNotHasKey('name', $conversation->intake_data ?? []);
        $this->assertStringContainsString('name', mb_strtolower($reply->json('data.content')));
    }

    public function test_no_lead_is_written_without_a_way_to_reach_anybody(): void
    {
        ['token' => $token] = $this->open();

        $this->say($token, 'Neil Basu');
        $this->say($token, 'skip');
        $this->say($token, 'skip');
        $this->say($token, 'skip');
        $this->say($token, 'Do you supply switches?');

        // A row carrying a name and no way to reach anybody is not a lead; it
        // is a row somebody has to delete.
        $this->assertNull(Lead::query()->first());
    }

    public function test_a_signed_in_customer_is_not_asked_for_what_the_account_holds(): void
    {
        // Created rather than factoried: there are no model factories in this
        // application, and `ChatJourneyTest` builds its customer the same way.
        $customer = Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.in',
            'phone' => '+91 98311 00758',
            'company' => 'Meridian Foods',
            'password' => bcrypt('irrelevant'),
            'status' => CustomerStatus::Active,
        ]);

        $token = $customer->createToken('portal')->plainTextToken;

        $res = $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/v1/chat/conversations')
            ->assertCreated();

        // Only the closing question is left. Asking a signed-in customer for
        // their own email address is the clearest possible signal that nothing
        // on the other end is paying attention.
        $this->assertCount(1, $res->json('data.messages'));
        $this->assertStringContainsString('help you with', mb_strtolower($res->json('data.messages.0.content')));
    }

    public function test_switching_it_off_restores_the_previous_behaviour(): void
    {
        Setting::query()->where('key', 'chatbot_intake_enabled')->update(['value' => '0']);

        ['body' => $body] = $this->open();

        $this->assertSame([], $body['messages']);
        $this->assertNotSame([], $body['quick_actions'], 'The chips come back when nothing is being asked.');
    }

    public function test_the_whatsapp_hand_off_is_absent_until_a_number_is_configured(): void
    {
        ['body' => $body] = $this->open();
        $this->assertNull($body['whatsapp']);

        Setting::query()->updateOrCreate(
            ['key' => 'chatbot_whatsapp_number'],
            ['group' => 'chatbot', 'value' => '+91 98311 00758', 'type' => 'string'],
        );

        ['body' => $body] = $this->open();

        // Digits only in the URL: a `wa.me` link carrying a `+` or a space does
        // not fail, it opens WhatsApp on a search for a contact nobody has.
        $this->assertStringStartsWith('https://wa.me/919831100758?text=', $body['whatsapp']['url']);
    }

    public function test_resuming_returns_the_same_opening_payload_as_starting(): void
    {
        ['token' => $token, 'body' => $started] = $this->open();

        $resumed = $this->getJson("/api/v1/chat/conversations/{$token}")->assertOk()->json('data');

        /*
         * The resume path used to read the public settings map and re-parse the
         * quick actions in TypeScript — a second implementation of
         * `ChatSettings::quickActions()` on the far side of the wire. These keys
         * are what stops it needing one.
         */
        foreach (['name', 'welcome', 'quick_actions', 'max_message_chars', 'auto_open', 'whatsapp'] as $key) {
            $this->assertArrayHasKey($key, $resumed);
            $this->assertSame($started[$key], $resumed[$key]);
        }
    }

    public function test_the_intake_state_cannot_be_set_from_a_request(): void
    {
        ['token' => $token] = $this->open();

        $this->postJson("/api/v1/chat/conversations/{$token}/messages", [
            'message' => 'Neil Basu',
            // Neither column is fillable, so a body claiming intake is finished
            // is a body that changes nothing. That is the whole reason they are
            // written with `forceFill`.
            'intake_completed_at' => now()->toIso8601String(),
            'intake_data' => ['name' => 'Somebody Else'],
        ])->assertOk();

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertSame('Neil Basu', $conversation->intake_data['name'] ?? null);
        $this->assertNull($conversation->intake_completed_at);
    }

    /**
     * An answer the website could not ground offers a way through.
     *
     * This is the one reply in the module with no sources and, for a general
     * intent, no actions — so before this the visitor was told "I cannot
     * confirm that from the website" and given **nothing at all** to press. The
     * desk already hears about it through `chatbot_forward_unanswered`; this is
     * the half for the person still sitting there.
     */
    public function test_an_unanswered_reply_offers_the_whatsapp_hand_off(): void
    {
        Setting::query()->updateOrCreate(
            ['key' => 'chatbot_whatsapp_number'],
            ['group' => 'chatbot', 'value' => '+91 98311 00758', 'type' => 'string'],
        );
        Setting::flushCache();

        ['token' => $token] = $this->open();
        $this->say($token, 'Neil Basu');
        $this->say($token, 'neil@example.in');
        $this->say($token, '+91 98311 00758');
        $this->say($token, 'skip');

        $reply = $this->say($token, 'Do you resell Zyxel XGS4600 in Antarctica?')->assertOk()->json('data');

        $this->assertFalse($reply['grounded'], 'Nothing was retrieved, so this is the dead-end case.');

        $handoff = collect($reply['actions'])->firstWhere('label', 'Continue on WhatsApp');

        $this->assertNotNull($handoff, 'An ungrounded answer must offer a way through.');
        $this->assertTrue($handoff['primary'], 'It is the only thing to press on that message.');

        // Digits only: a `wa.me` URL carrying a `+` or a space opens WhatsApp on
        // a search for a contact nobody has.
        $this->assertStringStartsWith('https://wa.me/919831100758?text=', $handoff['url']);

        // The question travels with it, so the person on the other end opens a
        // chat that already says what was asked.
        $this->assertStringContainsString('Zyxel', urldecode($handoff['url']));
        $this->assertStringContainsString('Neil Basu', urldecode($handoff['url']));
    }

    /** No number configured, no button — absent rather than dead. */
    public function test_the_hand_off_is_absent_from_an_unanswered_reply_without_a_number(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Neil Basu');
        $this->say($token, 'neil@example.in');
        $this->say($token, 'skip');
        $this->say($token, 'skip');

        $reply = $this->say($token, 'Do you resell Zyxel XGS4600 in Antarctica?')->assertOk()->json('data');

        $this->assertFalse($reply['grounded']);
        $this->assertSame([], $reply['actions'] ?? []);
    }

    public function test_the_allowlist_drops_a_field_nothing_knows_how_to_store(): void
    {
        Setting::query()->where('key', 'chatbot_intake_questions')->update([
            'value' => "name|Your name?\nfavourite_colour|Your favourite colour?\nrequirement|What do you need?",
        ]);

        ['token' => $token] = $this->open();

        $this->say($token, 'Neil Basu');

        // Straight to the closing question: a field outside `Intake::FIELDS`
        // would otherwise be a question whose answer nothing can keep.
        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertSame(['name', 'requirement'], array_column(Intake::steps($conversation), 'field'));
    }
}
