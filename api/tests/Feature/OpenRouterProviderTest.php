<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\Chat\AiProvider;
use App\Support\Chat\ChatSettings;
use App\Support\Chat\Providers\OpenRouterProvider;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Tests\TestCase;

/**
 * The one provider every AI feature calls (0.116.0), against a faked network.
 *
 * `Http::preventStrayRequests()` in every test: nothing here may reach
 * OpenRouter, and a request the fake did not expect is a failure rather
 * than a bill.
 */
class OpenRouterProviderTest extends TestCase
{
    use RefreshDatabase;

    private const URL = 'https://openrouter.ai/api/v1/chat/completions';

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        config(['services.openrouter.key' => null, 'services.openrouter.model' => 'openai/gpt-4o-mini']);
    }

    private function setting(string $key, ?string $value, string $group = 'integrations'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    private function key(string $value = 'sk-or-v1-test'): void
    {
        $this->setting('openrouter_api_key', $value);
    }

    /** @param  array<string, mixed>|string  $body */
    private function answers(array|string $body, int $status = 200): void
    {
        Http::fake(['openrouter.ai/*' => Http::response($body, $status)]);
    }

    private function ok(string $content = 'Hello.'): array
    {
        return ['choices' => [['message' => ['content' => $content], 'finish_reason' => 'stop']], 'usage' => ['total_tokens' => 11]];
    }

    private function ask(int $maxTokens = 500, array $options = [])
    {
        return (new OpenRouterProvider)->complete([['role' => 'user', 'content' => 'hi']], $maxTokens, $options);
    }

    // ---- the request ---------------------------------------------------------

    public function test_it_is_the_provider_the_container_resolves(): void
    {
        $provider = app(AiProvider::class);

        $this->assertInstanceOf(OpenRouterProvider::class, $provider);
        $this->assertSame('openrouter', $provider->name());
    }

    public function test_it_sends_the_bearer_key_and_the_attribution_headers(): void
    {
        $this->key();
        $this->setting('company_name', "Acme Networks\r\nX-Injected: yes", 'general');
        config(['app.frontend_url' => 'https://www.acme.example']);
        $this->answers($this->ok());

        $reply = $this->ask();

        $this->assertTrue($reply->ok);
        $this->assertSame('Hello.', $reply->text);
        $this->assertSame(11, $reply->tokens);

        Http::assertSent(function (Request $request) {
            return $request->url() === self::URL
                && $request->method() === 'POST'
                && $request->hasHeader('Authorization', 'Bearer sk-or-v1-test')
                && $request->hasHeader('HTTP-Referer', 'https://www.acme.example')
                // The company's own name, on one line: a header value cannot
                // carry a line break, and this one was typed by a person.
                && $request->hasHeader('X-Title', 'Acme Networks X-Injected: yes')
                && ! $request->hasHeader('X-Injected');
        });
    }

    public function test_the_title_falls_back_to_the_application_name(): void
    {
        $this->key();
        $this->setting('company_name', null, 'general');
        config(['app.name' => 'Fallback Co']);
        $this->answers($this->ok());

        $this->ask();

        Http::assertSent(fn (Request $request) => $request->hasHeader('X-Title', 'Fallback Co'));
    }

    public function test_the_body_is_the_openai_shape_and_response_format_is_absent_unless_asked_for(): void
    {
        $this->key();
        $this->answers($this->ok());

        $this->ask(120);

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return $body['model'] === 'openai/gpt-4o-mini'
                && $body['messages'] === [['role' => 'user', 'content' => 'hi']]
                && $body['max_tokens'] === 120
                && $body['temperature'] === 0.2
                // Not `null`: absent. The two are different requests.
                && ! array_key_exists('response_format', $body)
                // A local knob, never sent on.
                && ! array_key_exists('timeout', $body);
        });
    }

    public function test_the_callers_model_temperature_and_json_mode_are_sent(): void
    {
        $this->key();
        $this->answers($this->ok('{"a": 1}'));

        $this->ask(300, [
            'model' => 'google/gemini-2.5-flash-lite',
            'temperature' => 0,
            'response_format' => ['type' => 'json_object'],
            'timeout' => 90,
        ]);

        Http::assertSent(function (Request $request) {
            $body = $request->data();

            return $body['model'] === 'google/gemini-2.5-flash-lite'
                && $body['temperature'] === 0
                && $body['response_format'] === ['type' => 'json_object']
                && $body['max_tokens'] === 300
                && ! array_key_exists('timeout', $body);
        });
    }

    /**
     * A model that thinks first draws its thinking from the same allowance
     * as its answer, so a cap sized for the answer alone — five tokens to
     * prove a model — comes back empty. It is given headroom; a model that
     * does not think, and one from outside the list, are sent the caller's
     * figure untouched.
     */
    public function test_a_thinking_model_is_given_headroom_and_no_other_model_is(): void
    {
        $this->key();
        $this->answers($this->ok());

        $this->ask(5, ['model' => 'google/gemini-2.5-pro']);
        $this->ask(3500, ['model' => 'google/gemini-2.5-flash']);
        $this->ask(5, ['model' => 'openai/gpt-4.1']);
        $this->ask(5, ['model' => 'google/gemini-2.5-flash-lite']);
        $this->ask(5, ['model' => 'somebody/unknown-thinker']);

        $sent = Http::recorded()->map(fn (array $pair) => [$pair[0]->data()['model'], $pair[0]->data()['max_tokens']])->all();

        $this->assertSame([
            ['google/gemini-2.5-pro', 5 + 1024],
            ['google/gemini-2.5-flash', 7000],
            ['openai/gpt-4.1', 5],
            ['google/gemini-2.5-flash-lite', 5],
            ['somebody/unknown-thinker', 5],
        ], $sent);
    }

    public function test_no_key_is_a_failure_and_nothing_is_sent(): void
    {
        Http::fake();

        $provider = new OpenRouterProvider;

        $this->assertFalse($provider->isConfigured());

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('No OpenRouter key is configured.', $reply->error);
        Http::assertNothingSent();
    }

    // ---- where the key and the model come from --------------------------------

    public function test_the_key_is_the_setting_first_and_the_environment_second(): void
    {
        config(['services.openrouter.key' => 'sk-or-from-env']);

        $this->assertSame('sk-or-from-env', ChatSettings::apiKey());

        $this->key('sk-or-from-settings');

        $this->assertSame('sk-or-from-settings', ChatSettings::apiKey());
    }

    /** An OpenAI key left in the old row is not an OpenRouter key, and is not read as one. */
    public function test_the_old_openai_key_setting_is_not_read(): void
    {
        $this->setting('openai_api_key', 'sk-an-openai-key');

        $this->assertNull(ChatSettings::apiKey());
        $this->assertFalse((new OpenRouterProvider)->isConfigured());
    }

    public function test_the_model_is_the_setting_then_the_environment_then_the_default(): void
    {
        $this->setting('chatbot_model', null, 'chatbot');
        config(['services.openrouter.model' => null]);

        // Nothing chosen anywhere: the Google default.
        $this->assertSame('google/gemini-2.5-flash', ChatSettings::model());

        config(['services.openrouter.model' => 'google/gemini-2.5-pro']);

        $this->assertSame('google/gemini-2.5-pro', ChatSettings::model());

        // An `AI_MODEL` written when OpenAI was called directly: the same
        // model, under the name OpenRouter has for it.
        config(['services.openrouter.model' => 'gpt-4o']);

        $this->assertSame('openai/gpt-4o', ChatSettings::model());

        // A stored value is sent exactly as written, whatever it is.
        $this->setting('chatbot_model', 'somebody/their-own-model', 'chatbot');

        $this->assertSame('somebody/their-own-model', ChatSettings::model());
    }

    // ---- OpenRouter's three ways of saying no ----------------------------------

    public function test_an_http_refusal_is_a_failure_in_openrouters_words(): void
    {
        $this->key();
        $this->answers(['error' => ['code' => 401, 'message' => 'No auth credentials found']], 401);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('', $reply->text);
        $this->assertSame('No auth credentials found', $reply->error);
    }

    /**
     * What the maker itself said is in `metadata.raw`, and OpenRouter's own
     * message is often only "Provider returned error" — so both are kept,
     * with the maker named. This is what `test-model` shows an administrator.
     */
    public function test_a_refusal_carries_what_the_maker_said(): void
    {
        $this->key();
        $this->answers(['error' => [
            'code' => 400,
            'message' => 'Provider returned error',
            'metadata' => [
                'provider_name' => 'Google AI Studio',
                'raw' => json_encode(['error' => ['code' => 400, 'message' => "API key not valid.\nPlease pass a valid API key.", 'status' => 'INVALID_ARGUMENT']]),
            ],
        ]], 400);

        $reply = $this->ask(5, ['model' => 'google/gemini-2.5-flash-lite']);

        $this->assertFalse($reply->ok);
        $this->assertSame(
            'Provider returned error — Google AI Studio: API key not valid. Please pass a valid API key.',
            $reply->error,
        );
    }

    /**
     * A free Google AI Studio key is rate-limited, and its 429 is the refusal
     * an install is likeliest to meet. It is sent **once** — retrying a 429
     * on the spot is how a limit becomes a ban — logged with the maker's
     * words, and returned with them whole, down to how long to wait.
     */
    public function test_a_rate_limit_is_reported_in_the_makers_words_logged_and_never_retried(): void
    {
        $this->key();
        $google = 'You exceeded your current quota, please check your plan and billing details. '
            .'For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. '
            .'* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10 '
            .'Please retry in 34.2s.';
        $this->answers(['error' => [
            'code' => 429,
            'message' => 'Provider returned error',
            'metadata' => [
                'provider_name' => 'Google AI Studio',
                'raw' => json_encode(['error' => ['code' => 429, 'message' => $google, 'status' => 'RESOURCE_EXHAUSTED']]),
            ],
        ]], 429);
        Log::spy();

        $reply = $this->ask(120, ['model' => 'google/gemini-2.5-flash']);

        $this->assertFalse($reply->ok);
        $this->assertSame('Provider returned error — Google AI Studio: '.$google, $reply->error);

        Http::assertSentCount(1);

        Log::shouldHaveReceived('warning')->once()->withArgs(function (string $message, array $context) use ($google) {
            return $message === 'The AI provider refused a request'
                && $context['status'] === 429
                && $context['code'] === '429'
                && $context['maker'] === 'Google AI Studio'
                && $context['raw'] === $google
                && $context['model'] === 'google/gemini-2.5-flash'
                // The key is in no log line.
                && ! str_contains((string) json_encode($context), 'sk-or-v1-test');
        });
    }

    /** OpenRouter's own rate limit, which has no maker behind it: its words, once. */
    public function test_openrouters_own_rate_limit_and_a_server_error_are_each_sent_once(): void
    {
        $this->key();
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['error' => ['code' => 429, 'message' => 'Rate limit exceeded: free-models-per-min.']], 429)
            ->push(['error' => ['code' => 503, 'message' => 'No instances available']], 503)
            ->push(['choices' => [['message' => ['content' => 'Should never be asked for.']]]]),
        ]);

        $this->assertSame('Rate limit exceeded: free-models-per-min.', $this->ask()->error);
        Http::assertSentCount(1);

        $this->assertSame('No instances available', $this->ask()->error);
        Http::assertSentCount(2);
    }

    public function test_a_plain_text_raw_and_a_refusal_with_no_message_are_both_readable(): void
    {
        $this->key();
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['error' => ['code' => 404, 'message' => 'No endpoints found for openai/gpt-9.', 'metadata' => ['raw' => 'upstream said no']]], 404)
            ->push('<html>Bad gateway</html>', 502),
        ]);

        $this->assertSame('No endpoints found for openai/gpt-9. — upstream said no', $this->ask()->error);
        $this->assertSame('HTTP 502', $this->ask()->error);
    }

    /**
     * OpenRouter answers 200 with an `error` object when a maker fails after
     * the request was accepted. Read as a success that is an empty answer
     * somebody renders.
     */
    public function test_a_200_carrying_an_error_object_is_a_failure(): void
    {
        $this->key();
        $this->answers(['error' => ['code' => 502, 'message' => 'Provider returned error', 'metadata' => ['provider_name' => 'OpenAI']]]);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('', $reply->text);
        $this->assertSame('Provider returned error (OpenAI)', $reply->error);
    }

    /** …and it wins over choices that came with it. */
    public function test_an_error_object_beside_choices_is_still_a_failure(): void
    {
        $this->key();
        $this->answers($this->ok('Half an answer') + ['error' => ['message' => 'Upstream timed out']]);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('Upstream timed out', $reply->error);
    }

    public function test_an_error_on_the_choice_is_a_failure(): void
    {
        $this->key();
        $this->answers(['choices' => [[
            'message' => ['content' => ''],
            'finish_reason' => 'error',
            'error' => ['code' => 429, 'message' => 'Rate limited upstream'],
        ]]]);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('Rate limited upstream', $reply->error);
    }

    public function test_empty_choices_is_a_failure(): void
    {
        $this->key();
        $this->answers(['id' => 'gen-1', 'choices' => [], 'usage' => ['total_tokens' => 9]]);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('', $reply->text);
        $this->assertSame('OpenRouter answered without a reply in it (no choices).', $reply->error);
    }

    public function test_a_choice_with_nothing_in_it_is_a_failure_that_names_why(): void
    {
        $this->key();
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['choices' => [['message' => ['content' => null], 'finish_reason' => 'length']]])
            ->push(['choices' => [['message' => ['content' => '   '], 'finish_reason' => 'content_filter']]])
            ->push(['choices' => [['message' => ['content' => '']]]]),
        ]);

        $this->assertSame('The model used its whole allowance of tokens before writing an answer.', $this->ask()->error);
        $this->assertSame('The provider returned an empty reply (finish reason: content_filter).', $this->ask()->error);
        $this->assertSame('The provider returned an empty reply.', $this->ask()->error);
    }

    /** A maker answering in the multimodal shape: the text parts are the reply. */
    public function test_a_reply_in_parts_is_read_as_its_text(): void
    {
        $this->key();
        $this->answers(['choices' => [['message' => ['content' => [
            ['type' => 'text', 'text' => '{"alt": '],
            ['type' => 'text', 'text' => '"A switch"}'],
        ]]]], 'usage' => ['total_tokens' => 20]]);

        $reply = $this->ask();

        $this->assertTrue($reply->ok);
        $this->assertSame('{"alt": "A switch"}', $reply->text);
    }

    public function test_a_network_failure_is_a_failure_and_not_an_exception(): void
    {
        $this->key();
        Http::fake(['openrouter.ai/*' => fn () => throw new ConnectionException('Connection timed out')]);

        $reply = $this->ask();

        $this->assertFalse($reply->ok);
        $this->assertSame('Connection timed out', $reply->error);
    }
}
