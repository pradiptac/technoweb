<?php

namespace Tests\Feature;

use App\Enums\AiModel;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Seo\Ai\SeoAssistant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Choosing and proving a model: `GET /admin/seo/ai/models`, which the
 * console's "Test a model" control reads, and `POST /admin/seo/ai/test-model`,
 * which makes the one real call (0.116.0).
 *
 * `test-model` is driven through the **real provider over a faked network**
 * here, unlike the rest of the SEO tests: what is being pinned is that
 * OpenRouter's own words — and the maker's, from `error.metadata.raw` —
 * reach the 422, and that is a fact about the provider and the controller
 * together.
 */
class SeoAiModelsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        // No key and no `AI_MODEL` from this machine's environment: the
        // defaults under test are the application's own.
        config(['services.openrouter.key' => null, 'services.openrouter.model' => null]);
    }

    private function staff(string $slug): User
    {
        $user = User::create([
            'name' => 'Test '.$slug,
            'email' => $slug.'@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(['slug' => $slug], ['name' => $slug])->id);

        return $user->load('roles');
    }

    private function setting(string $key, ?string $value, string $type = 'string', string $group = 'seo'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => $type]);
        Setting::flushCache();
    }

    private function key(): void
    {
        $this->setting('openrouter_api_key', 'sk-or-v1-test', 'string', 'integrations');
    }

    // ---- GET seo/ai/models ---------------------------------------------------

    public function test_the_models_endpoint_lists_the_seven_and_says_what_is_in_use(): void
    {
        $this->key();
        $this->setting('seo_ai_model', 'google/gemini-2.5-flash');
        $this->setting('chatbot_model', 'openai/gpt-4.1-mini', 'string', 'chatbot');
        // Off: the list is wanted before anything is switched on.
        $this->setting('seo_ai_enabled', '0', 'boolean');

        $response = $this->actingAs($this->staff('seo_manager'))
            ->getJson('/api/v1/admin/seo/ai/models')
            ->assertOk()
            ->assertJsonStructure(['data' => [['value', 'label', 'description']], 'meta' => ['seo_model', 'chatbot_model', 'key_configured']])
            ->assertJsonPath('meta.seo_model', 'google/gemini-2.5-flash')
            ->assertJsonPath('meta.chatbot_model', 'openai/gpt-4.1-mini')
            ->assertJsonPath('meta.key_configured', true);

        $this->assertSame([
            'google/gemini-2.5-flash',
            'google/gemini-2.5-flash-lite',
            'google/gemini-2.5-pro',
            'openai/gpt-4o-mini',
            'openai/gpt-4.1-mini',
            'openai/gpt-4o',
            'openai/gpt-4.1',
        ], array_column($response->json('data'), 'value'));

        $this->assertSame('Gemini 2.5 Flash (Google)', collect($response->json('data'))->firstWhere('value', 'google/gemini-2.5-flash')['label']);
        $this->assertSame(['value', 'label', 'description'], array_keys($response->json('data.0')));

        // The same rows the assistant's own meta sends.
        $this->assertSame(AiModel::options('google/gemini-2.5-flash'), $response->json('data'));

        // It read settings. It called nobody, and the key's value is nowhere in it.
        Http::assertNothingSent();
        $this->assertStringNotContainsString('sk-or-v1-test', $response->getContent());
    }

    public function test_a_stored_model_from_outside_the_list_is_its_own_marked_option(): void
    {
        $this->key();
        $this->setting('seo_ai_model', 'anthropic/some-other-model');

        $data = $this->actingAs($this->staff('seo_manager'))
            ->getJson('/api/v1/admin/seo/ai/models')
            ->assertOk()
            ->assertJsonPath('meta.seo_model', 'anthropic/some-other-model')
            ->json('data');

        $this->assertCount(8, $data);
        $this->assertSame('anthropic/some-other-model', $data[7]['value']);
        $this->assertStringContainsString('Set outside this list', $data[7]['description']);
    }

    public function test_with_no_key_and_nothing_chosen_it_says_so_and_falls_through(): void
    {
        $this->setting('seo_ai_model', null);
        $this->setting('chatbot_model', null, 'string', 'chatbot');

        $this->actingAs($this->staff('seo_manager'))
            ->getJson('/api/v1/admin/seo/ai/models')
            ->assertOk()
            ->assertJsonPath('meta.key_configured', false)
            // Blank SEO model → the chatbot's → the default, which is a
            // Google model a free AI Studio key can call.
            ->assertJsonPath('meta.seo_model', 'google/gemini-2.5-flash')
            ->assertJsonPath('meta.chatbot_model', 'google/gemini-2.5-flash')
            ->assertJsonPath('data.0.value', 'google/gemini-2.5-flash')
            ->assertJsonCount(7, 'data');
    }

    public function test_the_models_endpoint_is_the_seo_managers_and_an_administrators(): void
    {
        $this->actingAs($this->staff('content_manager'))->getJson('/api/v1/admin/seo/ai/models')->assertStatus(403);

        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff('admin'))->getJson('/api/v1/admin/seo/ai/models')->assertOk();

        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/seo/ai/models')->assertStatus(401);
    }

    // ---- POST seo/ai/test-model ----------------------------------------------

    public function test_a_model_is_proved_with_one_real_call_even_while_the_assistant_is_off(): void
    {
        $this->key();
        $this->setting('seo_ai_enabled', '0', 'boolean');
        $this->setting('seo_ai_daily_cap', '1');
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => 'ready'], 'finish_reason' => 'stop']],
            'usage' => ['total_tokens' => 14],
        ])]);

        $this->actingAs($this->staff('seo_manager'))
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'google/gemini-2.5-flash-lite'])
            ->assertOk()
            ->assertJsonPath('data.model', 'google/gemini-2.5-flash-lite')
            ->assertJsonPath('data.ok', true)
            ->assertJsonPath('data.tokens', 14);

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->url() === 'https://openrouter.ai/api/v1/chat/completions'
            && $request->data()['model'] === 'google/gemini-2.5-flash-lite'
            && $request->hasHeader('Authorization', 'Bearer sk-or-v1-test'));

        // A test is not a suggestion: it spends none of the day's cap.
        $this->assertSame(0, SeoAssistant::runsToday());
    }

    public function test_with_no_model_named_it_tests_the_one_the_seo_assistant_would_call(): void
    {
        $this->key();
        $this->setting('seo_ai_model', 'openai/gpt-4.1');
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'ready']]], 'usage' => ['total_tokens' => 9]])]);

        $this->actingAs($this->staff('seo_manager'))
            ->postJson('/api/v1/admin/seo/ai/test-model')
            ->assertOk()
            ->assertJsonPath('data.model', 'openai/gpt-4.1');
    }

    /**
     * The whole point of the button: what OpenRouter said, and what the
     * maker behind it said, in the 422.
     */
    public function test_a_refusal_reaches_the_administrator_in_the_providers_own_words(): void
    {
        $this->key();
        Http::fake(['openrouter.ai/*' => Http::sequence()
            // A model id nobody serves.
            ->push(['error' => ['code' => 404, 'message' => 'No endpoints found for openai/gpt-9-enormous.']], 404)
            // The maker's own key was never added at OpenRouter (BYOK).
            ->push(['error' => [
                'code' => 401,
                'message' => 'Provider returned error',
                'metadata' => ['provider_name' => 'Google AI Studio', 'raw' => '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}'],
            ]], 401)
            // A 200 that is not an answer.
            ->push(['error' => ['code' => 502, 'message' => 'Provider returned error', 'metadata' => ['provider_name' => 'OpenAI', 'raw' => 'upstream connect error']]]),
        ]);
        $user = $this->staff('seo_manager');

        $this->actingAs($user)
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'openai/gpt-9-enormous'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No endpoints found for openai/gpt-9-enormous.')
            ->assertJsonPath('errors.model.0', 'No endpoints found for openai/gpt-9-enormous.');

        $this->actingAs($user)
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'google/gemini-2.5-flash-lite'])
            ->assertStatus(422)
            ->assertJsonPath('errors.model.0', 'Provider returned error — Google AI Studio: API key not valid. Please pass a valid API key.');

        $this->actingAs($user)
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'openai/gpt-4o'])
            ->assertStatus(422)
            ->assertJsonPath('errors.model.0', 'Provider returned error — OpenAI: upstream connect error');
    }

    /**
     * A free Google AI Studio key's rate limit: the 422 says what Google
     * said, to the last word — which limit, and how long to wait — and the
     * model was asked once.
     */
    public function test_a_rate_limited_key_is_reported_verbatim_and_asked_once(): void
    {
        $this->key();
        $google = 'You exceeded your current quota, please check your plan and billing details. '
            .'* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10 '
            .'Please retry in 34.2s.';
        Http::fake(['openrouter.ai/*' => Http::response(['error' => [
            'code' => 429,
            'message' => 'Provider returned error',
            'metadata' => ['provider_name' => 'Google AI Studio', 'raw' => json_encode(['error' => ['code' => 429, 'message' => $google, 'status' => 'RESOURCE_EXHAUSTED']])],
        ]], 429)]);

        // No model named and none stored: the default, a Google model.
        $this->setting('seo_ai_model', null);
        $this->setting('chatbot_model', null, 'string', 'chatbot');

        $this->actingAs($this->staff('seo_manager'))
            ->postJson('/api/v1/admin/seo/ai/test-model')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Provider returned error — Google AI Studio: '.$google)
            ->assertJsonPath('errors.model.0', 'Provider returned error — Google AI Studio: '.$google);

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->data()['model'] === 'google/gemini-2.5-flash');
    }

    public function test_with_no_key_it_refuses_without_calling_anybody(): void
    {
        Http::fake();
        // Switched on, to show it is the key and not the switch that refuses.
        $this->setting('seo_ai_enabled', '1', 'boolean');

        $this->actingAs($this->staff('seo_manager'))
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'openai/gpt-4o-mini'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'No OpenRouter key is configured. Add one in Settings → API keys.');

        Http::assertNothingSent();
    }

    public function test_a_content_manager_cannot_test_a_model(): void
    {
        $this->key();
        Http::fake();

        $this->actingAs($this->staff('content_manager'))
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'openai/gpt-4o-mini'])
            ->assertStatus(403);

        Http::assertNothingSent();
    }
}
