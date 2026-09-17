<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\ChatConversation;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Setting;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
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

        /*
         * Asserted on the *field* rather than on the wording. The first cut
         * matched a phrase out of the closing question and broke the day that
         * question was reworded — a test failing because somebody improved a
         * sentence is a test that teaches people to edit tests.
         */
        $conversation = ChatConversation::latest('id')->firstOrFail();
        $this->assertSame(['requirement'], array_column(Intake::steps($conversation), 'field'));
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

    /**
     * An enquiry typed into the name box is not a name.
     *
     * Reported from a real conversation: "I want to buy laptop" was filed as
     * somebody's name and reached the sales desk as `name: "I want to buy
     * laptop"`. The old check caught a trailing question mark and nothing else,
     * so a plain statement of intent walked through it.
     */
    public function test_a_statement_of_intent_is_not_taken_as_a_name(): void
    {
        ['token' => $token] = $this->open();

        $reply = $this->say($token, 'I want to buy laptop')->assertOk();

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertArrayNotHasKey('name', $conversation->intake_data ?? []);
        $this->assertStringContainsString('name', mb_strtolower($reply->json('data.content')));
    }

    /** And it is not a company either, for the same reason. */
    public function test_a_statement_of_intent_is_not_taken_as_a_company(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Pradipta Chowdhury');
        $this->say($token, 'pradiptac@gmail.com');
        $this->say($token, '9831100758');

        $this->say($token, 'I want to buy a laptop')->assertOk();

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertArrayNotHasKey('company', $conversation->intake_data ?? []);
    }

    /**
     * An address with no dot in the domain is a typo, every time.
     *
     * `FILTER_VALIDATE_EMAIL` alone accepts `you@localhost` — legal on an
     * intranet and meaningless on a public contact form. Still no DNS lookup:
     * this is syntax, and it costs nothing.
     */
    public function test_an_address_without_a_real_domain_is_refused(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Pradipta Chowdhury');

        $reply = $this->say($token, 'pradiptac@gmail')->assertOk();

        $this->assertStringContainsString('email address', mb_strtolower($reply->json('data.content')));

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertArrayNotHasKey('email', $conversation->intake_data ?? []);
    }

    /** One digit repeated is what people type to get past a field. */
    public function test_a_repeated_digit_is_not_a_telephone_number(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Pradipta Chowdhury');
        $this->say($token, 'pradiptac@gmail.com');

        $reply = $this->say($token, '9999999999')->assertOk();

        $this->assertStringContainsString('telephone number', mb_strtolower($reply->json('data.content')));
    }

    /**
     * Letting a field go is said out loud.
     *
     * It used to move to the next question in silence, so somebody who typed an
     * address twice that would not validate watched it ask for their telephone
     * number and concluded the address had been taken. It had not — the lead
     * reached the desk with a null email and nothing anywhere said so.
     */
    public function test_abandoning_a_field_is_acknowledged_rather_than_silent(): void
    {
        ['token' => $token] = $this->open();
        $this->say($token, 'Pradipta Chowdhury');

        $this->say($token, 'ppp')->assertOk();
        $second = $this->say($token, 'pradiptac@gmail')->assertOk();

        $content = $second->json('data.content');

        $this->assertStringContainsString('leave the email address', mb_strtolower($content));
        // And it carries the next question, rather than being a bubble of its own.
        $this->assertStringContainsString('number', mb_strtolower($content));

        $conversation = ChatConversation::where('session_token', $token)->firstOrFail();
        $this->assertContains('email', $conversation->intake_data['_skipped'] ?? []);
    }

    /**
     * A model that answers the judge's JSON and the assistant's prose from one
     * script: the judge asks in JSON mode, the assistant does not, so the
     * fake tells them apart by the option and never needs HTTP.
     *
     * @param  array<string, array{kind: string, value?: ?string}>  $verdicts  keyed by the message the judge is shown
     */
    private function fakeJudge(array $verdicts, string $prose = 'A grounded answer.'): void
    {
        $this->app->bind(AiProvider::class, fn () => new class($verdicts, $prose) implements AiProvider
        {
            public function __construct(private array $verdicts, private string $prose) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                if (($options['response_format']['type'] ?? null) !== 'json_object') {
                    return AiReply::of($this->prose, 30);
                }
                $shown = (string) end($messages)['content'];
                foreach ($this->verdicts as $needle => $verdict) {
                    if (str_contains($shown, $needle)) {
                        return AiReply::of(json_encode(['kind' => $verdict['kind'], 'value' => $verdict['value'] ?? null]), 20);
                    }
                }

                return AiReply::of('{"kind":"answer","value":null}', 20);
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'fake-judge';
            }
        });
    }

    /**
     * The judge (`IntakeJudge`): with a model configured, the visitor's message
     * is read before the rules see it — junk is refused where the shape test
     * would have let it through, a name is lifted out of its sentence, and a
     * question asked mid-intake is answered with the intake's question put
     * back on the table in the same message.
     */
    public function test_the_judge_refuses_junk_lifts_a_name_out_and_answers_a_question_mid_intake(): void
    {
        $this->fakeJudge([
            'asdfgh' => ['kind' => 'junk'],
            'my name is Priya Nair' => ['kind' => 'answer', 'value' => 'Priya Nair'],
            'do you sell switches' => ['kind' => 'question'],
            'priya@example.in' => ['kind' => 'answer', 'value' => 'priya@example.in'],
        ], 'Yes — we supply managed switches.');

        ['token' => $token] = $this->open();

        // "asdfgh" passes every structural rule for a name; the judge does not.
        $first = $this->say($token, 'asdfgh')->assertOk()->json('data.content');
        $this->assertStringContainsString('did not catch', $first, 'Junk takes the ordinary retry, in the ordinary words.');

        // A question instead of an answer: answered, and the step re-asked in the same message.
        // (Nothing is published here, so the assistant's answer is its
        // honest fallback — the point is that it answered rather than retried.)
        $reply = $this->say($token, 'do you sell switches?')->assertOk()->json('data.content');
        $this->assertStringNotContainsString('did not catch', $reply);
        $this->assertStringContainsString('website', $reply, 'The assistant answered the question.');
        $this->assertStringEndsWith('may I take your name?', $reply, 'The intake question comes back on the same message.');

        // The name, lifted out of the sentence around it.
        $this->say($token, 'my name is Priya Nair')->assertOk();
        $this->say($token, 'priya@example.in')->assertOk();
        $this->say($token, 'skip');
        $this->say($token, 'skip');
        $this->say($token, 'I need a 24-port PoE switch');

        $lead = Lead::query()->firstOrFail();
        $this->assertSame('Priya Nair', $lead->name);
        $this->assertSame('priya@example.in', $lead->email);
    }

    /** The judge is a suggestion, never a verdict: its "answer" still goes through the rules. */
    public function test_the_judge_cannot_pass_what_the_rules_refuse(): void
    {
        $this->fakeJudge(['Neil Basu' => ['kind' => 'answer', 'value' => 'Neil Basu'], 'you@gmail' => ['kind' => 'answer', 'value' => 'you@gmail']]);

        ['token' => $token] = $this->open();
        $this->say($token, 'Neil Basu');
        $reply = $this->say($token, 'you@gmail')->assertOk()->json('data.content');

        $this->assertStringContainsString('email', mb_strtolower($reply), 'A bare hostname is still refused by the regex whatever the model said.');
    }

    /** Switched off, or with no key, the rules decide alone — the behaviour before the judge existed. */
    public function test_with_the_judge_off_the_rules_decide_alone(): void
    {
        Setting::query()->updateOrCreate(['key' => 'chatbot_smart_intake'], ['group' => 'chatbot', 'value' => '0', 'type' => 'boolean']);
        Setting::flushCache();
        $this->fakeJudge(['asdfgh' => ['kind' => 'junk']]);

        ['token' => $token] = $this->open();
        $this->say($token, 'asdfgh');
        $reply = $this->say($token, 'neil@example.in')->assertOk()->json('data.content');

        $this->assertStringContainsString('number', mb_strtolower($reply), 'The shape test accepted the name and moved on to the phone.');
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
