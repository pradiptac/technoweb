<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\Search\Embeddings;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticIndexTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings(); // no test may reach the real OpenRouter
    }

    public function test_enabling_makes_the_switch_a_real_true(): void
    {
        $this->assertTrue(Setting::get('semantic_search_enabled'));
        $this->assertTrue(SemanticSettings::enabled());
    }

    public function test_embed_sends_the_batch_and_returns_unit_vectors_in_order(): void
    {
        $vectors = Embeddings::embed(['wifi keeps dropping', 'a firewall']);

        $this->assertCount(2, $vectors);
        $this->assertEqualsWithDelta(1.0, array_sum(array_map(fn ($x) => $x * $x, $vectors[0])), 1e-6);
        $this->assertGreaterThan(0.9, $vectors[0][0]);
        $this->assertGreaterThan(0.9, $vectors[1][1]);
        Http::assertSent(fn (Request $r) => $r->url() === Embeddings::ENDPOINT
            && $r->hasHeader('Authorization', 'Bearer sk-or-v1-test')
            && $r['model'] === 'openai/text-embedding-3-small'
            && $r['dimensions'] === SemanticSettings::DIMENSIONS
            && $r['input'] === ['wifi keeps dropping', 'a firewall']);
    }

    public function test_a_refusal_returns_null_and_records_the_error_and_a_success_clears_it(): void
    {
        $this->fakeEmbeddings(status: 401);
        $this->assertNull(Embeddings::embed(['x']));
        $this->assertStringContainsString('Refused for the test', (string) Setting::get('semantic_search_error'));

        $this->fakeEmbeddings();
        $this->assertNotNull(Embeddings::embed(['x']));
        $this->assertNull(Setting::get('semantic_search_error'));
    }

    public function test_no_key_returns_null_without_a_request(): void
    {
        Setting::query()->where('key', 'openrouter_api_key')->update(['value' => null]);
        Setting::flushCache();
        config(['services.openrouter.key' => null]);
        $before = count(Http::recorded());

        $this->assertNull(Embeddings::embed(['x']));
        $this->assertCount($before, Http::recorded());
    }

    public function test_a_non_openai_model_is_not_sent_dimensions(): void
    {
        Setting::query()->where('key', 'semantic_search_model')->update(['value' => 'qwen/qwen3-embedding-0.6b']);
        Setting::flushCache();

        Embeddings::embed(['x']);

        Http::assertSent(fn (Request $r) => ! array_key_exists('dimensions', $r->data()));
    }
}
