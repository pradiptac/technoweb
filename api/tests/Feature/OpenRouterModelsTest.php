<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Chat\OpenRouterModels;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Typing any OpenRouter model id (0.165.0): the shape, OpenRouter's live list,
 * the hour's cache, and the rule that an unreachable list never blocks a save.
 */
class OpenRouterModelsTest extends TestCase
{
    use RefreshDatabase;

    private const LIST = 'openrouter.ai/api/v1/models';

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        config(['services.openrouter.key' => null, 'services.openrouter.model' => null]);
    }

    private ?User $admin = null;

    private function admin(): User
    {
        return $this->admin ??= $this->makeAdmin();
    }

    private function makeAdmin(): User
    {
        $user = User::create([
            'name' => 'Test admin', 'email' => 'admin@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => 'admin'], ['name' => 'admin'])->id);

        return $user->load('roles');
    }

    private function setting(string $key, ?string $value, string $group = 'integrations'): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => $group, 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    private function listing(): void
    {
        Http::fake([self::LIST => Http::response(['data' => [
            ['id' => 'meta-llama/llama-4-scout:free', 'name' => 'Llama 4 Scout (free)', 'architecture' => ['input_modalities' => ['text']], 'pricing' => ['prompt' => '0', 'completion' => '0']],
            ['id' => 'mistralai/mistral-small-3.2', 'name' => 'Mistral Small', 'architecture' => ['input_modalities' => ['text', 'image']], 'pricing' => ['prompt' => '0.1', 'completion' => '0.3']],
        ]])]);
    }

    private function save(string $key, string $value)
    {
        return $this->actingAs($this->admin())->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => $key, 'value' => $value]],
        ]);
    }

    public function test_a_typed_id_on_openrouters_list_is_saved(): void
    {
        $this->listing();
        $this->setting('seo_ai_model', null, 'seo');

        $this->save('seo_ai_model', 'meta-llama/llama-4-scout:free')->assertOk();

        $this->assertSame('meta-llama/llama-4-scout:free', Setting::query()->where('key', 'seo_ai_model')->value('value'));
    }

    public function test_an_id_openrouter_does_not_list_is_refused_with_the_row_named(): void
    {
        $this->listing();
        $this->setting('chatbot_model', null, 'chatbot');

        $this->save('chatbot_model', 'meta-llama/llama-9-imaginary')
            ->assertStatus(422)
            ->assertJsonPath('errors', ['settings.0.value' => ['OpenRouter has no model called “meta-llama/llama-9-imaginary”. Copy the id from openrouter.ai/models.']]);

        $this->assertNull(Setting::query()->where('key', 'chatbot_model')->value('value'));
    }

    public function test_a_bad_shape_is_refused_without_asking_openrouter(): void
    {
        Http::fake();
        $this->setting('seo_ai_model', null, 'seo');

        foreach (['Not A Model', 'no-slash', 'UPPER/case', 'a/b/c', '/leading', 'openai/'.str_repeat('x', 100)] as $bad) {
            $this->save('seo_ai_model', $bad)->assertStatus(422);
        }

        Http::assertNothingSent();
    }

    public function test_when_openrouter_cannot_be_reached_the_id_is_accepted_on_its_shape(): void
    {
        Http::fake([self::LIST => Http::response('down', 503)]);
        $this->setting('seo_ai_model', null, 'seo');

        $this->save('seo_ai_model', 'meta-llama/llama-4-scout:free')->assertOk();

        $this->assertSame('meta-llama/llama-4-scout:free', Setting::query()->where('key', 'seo_ai_model')->value('value'));
    }

    public function test_a_connection_failure_is_the_same_as_an_error_status(): void
    {
        Http::fake([self::LIST => Http::failedConnection()]);

        $this->assertNull(OpenRouterModels::has('meta-llama/llama-4-scout:free'));
        $this->assertNull(OpenRouterModels::refusalFor('meta-llama/llama-4-scout:free'));
    }

    public function test_the_list_is_fetched_once_for_two_saves(): void
    {
        $this->listing();
        $this->setting('seo_ai_model', null, 'seo');
        $this->setting('chatbot_model', null, 'chatbot');

        $this->save('seo_ai_model', 'meta-llama/llama-4-scout:free')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->save('chatbot_model', 'mistralai/mistral-small-3.2')->assertOk();

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $r) => $r->url() === 'https://openrouter.ai/api/v1/models' && ! $r->hasHeader('Authorization'));
    }

    public function test_a_models_own_ids_never_cost_a_fetch(): void
    {
        Http::fake();
        $this->setting('seo_ai_model', null, 'seo');

        $this->save('seo_ai_model', 'google/gemma-4-31b-it:free')->assertOk();

        Http::assertNothingSent();
    }

    public function test_the_stored_value_is_not_re_checked(): void
    {
        Http::fake();
        $this->setting('seo_ai_model', 'somebody/their-own-model', 'seo');

        $this->save('seo_ai_model', 'somebody/their-own-model')->assertOk();

        Http::assertNothingSent();
    }

    public function test_describe_says_what_a_model_is(): void
    {
        $this->listing();

        $this->assertSame(['name' => 'Llama 4 Scout (free)', 'free' => true, 'images' => false], OpenRouterModels::describe('meta-llama/llama-4-scout:free'));
        $this->assertSame(['name' => 'Mistral Small', 'free' => false, 'images' => true], OpenRouterModels::describe('mistralai/mistral-small-3.2'));
        $this->assertNull(OpenRouterModels::describe('nobody/nothing'));
        $this->assertSame(['meta-llama/llama-4-scout:free', 'mistralai/mistral-small-3.2'], OpenRouterModels::ids());
    }

    public function test_test_model_takes_a_custom_id_up_to_a_hundred_characters(): void
    {
        $this->listing();
        $this->setting('openrouter_api_key', 'sk-or-v1-test');
        Http::fake([
            self::LIST => Http::response(['data' => [['id' => 'meta-llama/llama-4-scout:free']]]),
            'openrouter.ai/api/v1/chat/completions' => Http::response(['choices' => [['message' => ['content' => 'ready']]], 'usage' => ['total_tokens' => 11]]),
        ]);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'meta-llama/llama-4-scout:free'])
            ->assertOk()
            ->assertJsonPath('data.model', 'meta-llama/llama-4-scout:free');

        Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/chat/completions') && $r->data()['model'] === 'meta-llama/llama-4-scout:free');
    }

    public function test_test_model_refuses_an_unlisted_id_before_spending_a_call(): void
    {
        $this->setting('openrouter_api_key', 'sk-or-v1-test');
        Http::fake([self::LIST => Http::response(['data' => [['id' => 'meta-llama/llama-4-scout:free']]])]);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'nobody/nothing'])
            ->assertStatus(422)
            ->assertJsonPath('errors.model.0', 'OpenRouter has no model called “nobody/nothing”. Copy the id from openrouter.ai/models.');

        Http::assertSentCount(1);
        Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/chat/completions'));
    }

    public function test_test_model_refuses_a_bad_shape_and_anything_over_a_hundred_characters(): void
    {
        $this->setting('openrouter_api_key', 'sk-or-v1-test');
        Http::fake();
        $user = $this->admin();

        $this->actingAs($user)->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'No Slash Here'])->assertStatus(422);
        $this->actingAs($user)->postJson('/api/v1/admin/seo/ai/test-model', ['model' => 'a/'.str_repeat('b', 100)])->assertStatus(422);

        Http::assertNothingSent();
    }
}
