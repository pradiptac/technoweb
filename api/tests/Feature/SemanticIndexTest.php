<?php

namespace Tests\Feature;

use App\Models\Brand;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\Service;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Search\Document;
use App\Support\Search\Embeddings;
use App\Support\Search\Indexable;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
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
            && $r['input'] === ['wifi keeps dropping', 'a firewall']
            && $r['provider'] === ['only' => ['openai'], 'allow_fallbacks' => false]
            && $r->hasHeader('X-Title')
            && $r->hasHeader('HTTP-Referer'));
    }

    public function test_a_malformed_answer_is_a_failure_not_an_exception(): void
    {
        foreach ([['oops'], [['index' => 0, 'embedding' => []]], [['index' => 0]]] as $data) {
            Setting::query()->where('key', 'semantic_search_error')->update(['value' => null]);
            Setting::flushCache();
            // A fresh factory: the trait's stub is first in line for this URL on the shared one.
            Http::swap($factory = new Factory);
            $factory->fake(['openrouter.ai/api/v1/embeddings' => Http::response(['data' => $data])]);

            $this->assertNull(Embeddings::embed(['x']));
            $this->assertNotEmpty(Setting::get('semantic_search_error'));
        }
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

    public function test_every_indexable_kind_has_a_published_query_and_a_title(): void
    {
        foreach (Indexable::aliases() as $alias) {
            $this->assertNotNull(Indexable::query($alias), $alias);
            $this->assertNotSame('', Indexable::label($alias), $alias);
        }
        $this->assertNotContains('faq', Indexable::aliases());
    }

    public function test_a_document_reads_the_body_sections_faqs_and_answer_blocks_never_a_price(): void
    {
        $article = KnowledgeArticle::create([
            'title' => 'Wi-Fi drops', 'slug' => 'wifi-drops', 'excerpt' => 'Why the wireless drops.',
            'body' => '<p>Start here.</p><h2>Check the channel</h2><p>Busy channels cause drops.</p>', 'status' => 'published',
        ]);
        $article->faqs()->create(['question' => 'Does a mesh help?', 'answer' => '<p>Often.</p>', 'sort_order' => 1]);
        $article->answerBlocks()->create(['kind' => 'definition', 'answer' => 'A drop is a lost association.', 'status' => 'published', 'sort_order' => 1]);
        $article->answerBlocks()->create(['kind' => 'definition', 'answer' => 'Unpublished secret.', 'status' => 'draft', 'sort_order' => 2]);

        $sections = Document::sections($article->fresh());
        $text = implode(' ', array_column($sections, 'text'));

        $this->assertContains('Check the channel', array_column($sections, 'heading'));
        $this->assertStringContainsString('Busy channels cause drops.', $text);
        $this->assertStringContainsString('Does a mesh help? Often.', $text);
        $this->assertStringContainsString('A drop is a lost association.', $text);
        $this->assertStringNotContainsString('Unpublished secret', $text);
        $this->assertStringNotContainsString('<p>', $text);

        $product = StoreProduct::create(['name' => 'Switch', 'slug' => 'switch', 'type' => 'physical', 'price_paise' => 987654, 'status' => 'published', 'description' => '<p>24 ports.</p>']);
        $this->assertStringNotContainsString('9876', implode(' ', array_column(Document::sections($product), 'text')));
    }

    public function test_a_draft_owners_faqs_are_not_indexed(): void
    {
        $draft = Service::create(['title' => 'Draft service', 'slug' => 'draft-service', 'summary' => 'x', 'body' => '<p>x</p>', 'status' => 'draft']);
        $draft->faqs()->create(['question' => 'Secret question?', 'answer' => '<p>Secret.</p>', 'sort_order' => 1]);

        $this->assertFalse(Indexable::isIndexed($draft));
    }

    public function test_visible_builder_sections_are_read_and_hidden_or_code_ones_are_not(): void
    {
        $page = Page::create(['title' => 'Built', 'slug' => 'built', 'status' => 'published', 'template' => 'builder', 'blocks' => [
            ['id' => 'a', 'type' => 'rich_text', 'data' => ['heading' => 'Visible words', 'image_path' => 'x.png']],
            ['id' => 'b', 'type' => 'rich_text', 'hidden' => true, 'data' => ['heading' => 'Hidden words']],
            ['id' => 'c', 'type' => 'custom_code', 'data' => ['html' => 'script words']],
            ['id' => 'd', 'type' => 'divider'], // no data at all
        ]]);

        $text = implode(' ', array_column(Document::sections($page), 'text'));

        $this->assertStringContainsString('Visible words', $text);
        $this->assertStringNotContainsString('x.png', $text);
        $this->assertStringNotContainsString('Hidden words', $text);
        $this->assertStringNotContainsString('script words', $text);
    }

    public function test_a_product_document_names_its_brand_and_spec_sheet(): void
    {
        $brand = Brand::create(['name' => 'Aruba', 'slug' => 'aruba']);
        $product = Product::create(['brand_id' => $brand->id, 'name' => 'Access point', 'slug' => 'ap', 'status' => 'published', 'specifications' => ['Radios' => 'Tri-band']]);

        $text = implode(' ', array_column(Document::sections(Product::find($product->id)), 'text'));

        $this->assertStringContainsString('Aruba', $text);
        $this->assertStringContainsString('Radios: Tri-band', $text);
    }
}
