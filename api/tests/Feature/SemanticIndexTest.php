<?php

namespace Tests\Feature;

use App\Jobs\IndexSearch;
use App\Models\Brand;
use App\Models\KnowledgeArticle;
use App\Models\Page;
use App\Models\Product;
use App\Models\SearchPassage;
use App\Models\Service;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Search\Document;
use App\Support\Search\Embeddings;
use App\Support\Search\Indexable;
use App\Support\Search\Indexer;
use App\Support\Search\SearchFile;
use App\Support\Search\SemanticSettings;
use App\Support\Search\Vectors;
use App\Support\Upgrade\Steps\FirstSearchIndex;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticIndexTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
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

    public function test_only_prose_keys_of_a_section_are_read(): void
    {
        $page = Page::create(['title' => 'Mixed', 'slug' => 'mixed', 'status' => 'published', 'template' => 'builder', 'blocks' => [
            ['id' => 'a', 'type' => 'countdown', 'data' => ['heading' => 'Launch day', 'ends_at' => '2026-12-31T18:00', 'tone' => 'brand']],
            ['id' => 'b', 'type' => 'video', 'data' => ['caption' => 'Watch the demo', 'youtube' => 'dQw4w9WgXcQ', 'source' => 'youtube']],
            ['id' => 'c', 'type' => 'features', 'data' => ['display' => 'cards', 'items' => [['title' => 'Fast roaming', 'body' => 'Clients move without drops.', 'icon' => 'wifi']]]],
            ['id' => 'd', 'type' => 'checklist', 'data' => ['items' => ['Survey the site', 'Mount the access points']]],
            ['id' => 'e', 'type' => 'timeline', 'data' => ['items' => [['date' => '2026-01-05', 'title' => 'Kick-off']]]],
        ]]);

        $text = implode(' ', array_column(Document::sections($page), 'text'));

        foreach (['Launch day', 'Watch the demo', 'Fast roaming', 'Clients move without drops.', 'Survey the site', 'Mount the access points', 'Kick-off'] as $prose) {
            $this->assertStringContainsString($prose, $text);
        }
        foreach (['2026-12-31', 'brand', 'dQw4w9WgXcQ', 'cards', 'wifi', '2026-01-05'] as $notProse) {
            $this->assertStringNotContainsString($notProse, $text);
        }
    }

    public function test_the_written_body_is_indexed_only_while_the_page_draws_it(): void
    {
        $service = Service::create(['title' => 'Cabling', 'slug' => 'cabling', 'summary' => 'x', 'body' => '<p>Old written body.</p>', 'status' => 'published',
            'blocks' => [['id' => 'a', 'type' => 'rich_text', 'data' => ['body' => '<p>Section words.</p>']]]]);

        $text = fn () => implode(' ', array_column(Document::sections($service->fresh()), 'text'));

        $this->assertStringContainsString('Old written body.', $text()); // body_layout is still 'body'
        $this->assertStringNotContainsString('Section words.', $text());

        $service->update(['body_layout' => 'sections']);

        $this->assertStringContainsString('Section words.', $text());
        $this->assertStringNotContainsString('Old written body.', $text());

        $page = Page::create(['title' => 'Built', 'slug' => 'built-body', 'status' => 'published', 'template' => 'builder', 'body' => '<p>Stale page body.</p>',
            'blocks' => [['id' => 'a', 'type' => 'rich_text', 'data' => ['body' => '<p>Builder words.</p>']]]]);
        $pageText = implode(' ', array_column(Document::sections($page), 'text'));
        $this->assertStringContainsString('Builder words.', $pageText);
        $this->assertStringNotContainsString('Stale page body.', $pageText);

        $page->update(['template' => 'default']);
        $pageText = implode(' ', array_column(Document::sections($page->fresh()), 'text'));
        $this->assertStringContainsString('Stale page body.', $pageText);
        $this->assertStringNotContainsString('Builder words.', $pageText);
    }

    public function test_a_product_document_names_its_brand_and_spec_sheet(): void
    {
        $brand = Brand::create(['name' => 'Aruba', 'slug' => 'aruba']);
        $product = Product::create(['brand_id' => $brand->id, 'name' => 'Access point', 'slug' => 'ap', 'status' => 'published', 'specifications' => ['Radios' => 'Tri-band']]);

        $text = implode(' ', array_column(Document::sections(Product::find($product->id)), 'text'));

        $this->assertStringContainsString('Aruba', $text);
        $this->assertStringContainsString('Radios: Tri-band', $text);
    }

    private function article(array $attributes = []): KnowledgeArticle
    {
        return KnowledgeArticle::create($attributes + [
            'title' => 'Wi-Fi drops', 'slug' => 'wifi-drops', 'excerpt' => 'Why wireless drops.',
            'body' => '<p>Busy channels make the wireless network drop.</p>', 'status' => 'published',
        ]);
    }

    public function test_a_save_indexes_and_embeds_the_record(): void
    {
        $article = $this->article();

        $rows = SearchPassage::query()->where('subject_type', 'knowledge_article')->where('subject_id', $article->id)->get();
        $this->assertCount(1, $rows);
        $this->assertNotNull($rows[0]->embedded_at);
        $this->assertSame('openai/text-embedding-3-small', $rows[0]->model);
        $this->assertCount(8, Vectors::unpack($rows[0]->vector));
    }

    public function test_an_unchanged_passage_is_not_embedded_again(): void
    {
        $long = '<p>'.str_repeat('Two words here. ', 200).'</p>';
        $article = $this->article(['body' => '<p>One.</p><h2>Two</h2>'.$long]);

        $before = count(Http::recorded());
        $article->update(['excerpt' => 'Why wireless drops.']); // nothing changed in the text
        $this->assertSame(0, count(Http::recorded()) - $before);

        $article->update(['body' => '<p>One changed.</p><h2>Two</h2>'.$long]);
        $this->assertSame(1, count(Http::recorded()) - $before);
        $this->assertCount(1, Http::recorded()->last()[0]['input']); // only the changed passage
    }

    public function test_unpublishing_removes_the_passages(): void
    {
        $article = $this->article();

        $article->update(['status' => 'draft']);

        $this->assertSame(0, SearchPassage::query()->where('subject_id', $article->id)->count());
    }

    public function test_deleting_removes_the_passages(): void
    {
        $article = $this->article();

        $article->delete();

        $this->assertSame(0, SearchPassage::count());
    }

    public function test_switched_off_nothing_is_indexed_or_sent(): void
    {
        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $before = count(Http::recorded());

        $this->article();

        $this->assertSame(0, SearchPassage::count());
        $this->assertSame(0, count(Http::recorded()) - $before);
    }

    public function test_a_draft_owners_faq_is_never_indexed(): void
    {
        $service = Service::create(['title' => 'Draft service', 'slug' => 'draft-service', 'summary' => 'S', 'body' => '<p>B</p>', 'status' => 'draft']);
        $service->faqs()->create(['question' => 'Secret question?', 'answer' => '<p>Secret.</p>', 'sort_order' => 0]);

        Indexer::index($service->fresh());

        $this->assertSame(0, SearchPassage::count());
    }

    public function test_a_refused_embedding_leaves_the_passage_waiting(): void
    {
        $this->fakeEmbeddings(status: 500);

        $this->article();

        $this->assertNull(SearchPassage::sole()->embedded_at);
    }

    public function test_a_model_change_marks_every_passage_waiting(): void
    {
        $this->article();

        Indexer::markAllWaiting();

        $this->assertSame(0, SearchPassage::whereNotNull('embedded_at')->count());
    }

    public function test_the_nightly_run_indexes_records_saved_without_events_and_resumes_after_a_slice(): void
    {
        KnowledgeArticle::withoutEvents(fn () => $this->article(['slug' => 'a']) && $this->article(['slug' => 'b', 'title' => 'Firewall rules', 'body' => '<p>A firewall blocks attacks.</p>']));
        $this->assertSame(0, SearchPassage::count());

        IndexSearch::$budgetSeconds = 0;
        try {
            $this->artisan('technoware:index-search')->assertSuccessful();
        } finally {
            IndexSearch::$budgetSeconds = 40;
        }

        $this->assertSame(2, SearchPassage::whereNotNull('embedded_at')->count());
    }

    public function test_a_model_change_while_a_run_is_mid_way_strands_no_passage(): void
    {
        $this->article();
        $this->article(['slug' => 'fw', 'title' => 'Firewall rules', 'body' => '<p>A firewall blocks attacks.</p>']);

        // The model changes; a slice still running under the old one stamps a row with it.
        Indexer::markAllWaiting();
        SearchPassage::query()->orderBy('id')->limit(1)->update(['model' => 'openai/text-embedding-3-small', 'embedded_at' => now()]);
        Setting::query()->where('key', 'semantic_search_model')->update(['value' => 'qwen/qwen3-embedding-0.6b']);
        Setting::flushCache();

        $this->artisan('technoware:index-search')->assertSuccessful();

        $this->assertSame(0, Indexer::waiting(SemanticSettings::model())->count());
        $this->assertSame(SearchPassage::count(), SearchPassage::where('model', 'qwen/qwen3-embedding-0.6b')->whereNotNull('embedded_at')->count());
        $this->assertCount(SearchPassage::count(), iterator_to_array(SearchFile::records(SearchFile::load()), false));
    }

    public function test_editing_or_deleting_an_faq_or_answer_block_reindexes_its_owner(): void
    {
        $service = Service::create(['title' => 'Site surveys', 'slug' => 'surveys', 'summary' => 'S', 'body' => '<p>We survey sites.</p>', 'status' => 'published']);
        $text = fn () => SearchPassage::query()->where('subject_type', 'service')->where('subject_id', $service->id)->pluck('text')->implode(' ');

        $faq = $service->faqs()->create(['question' => 'Which districts?', 'answer' => '<p>Every district.</p>', 'sort_order' => 0]);
        $this->assertStringContainsString('Every district', $text());

        $faq->update(['answer' => '<p>Only the city.</p>']);
        $this->assertStringContainsString('Only the city', $text());
        $this->assertStringNotContainsString('Every district', $text());

        $faq->delete();
        $this->assertStringNotContainsString('Only the city', $text());

        $block = $service->answerBlocks()->create(['kind' => 'definition', 'answer' => 'A survey maps every cable run.', 'status' => 'published', 'sort_order' => 0]);
        $this->assertStringContainsString('every cable run', $text());
        $block->delete();
        $this->assertStringNotContainsString('every cable run', $text());
    }

    public function test_an_edit_that_only_deletes_a_passage_rebuilds_the_file(): void
    {
        $long = '<p>'.str_repeat('Two words here. ', 200).'</p>';
        $article = $this->article(['body' => '<p>One.</p><h2>Two</h2>'.$long]);
        $inFile = fn () => count(iterator_to_array(SearchFile::records(SearchFile::load()), false));
        $this->assertGreaterThan(1, $inFile());
        $before = count(Http::recorded());

        $article->update(['body' => '<p>One.</p>']);

        $this->assertSame(0, count(Http::recorded()) - $before); // nothing to embed: the first passage is unchanged
        $this->assertSame(SearchPassage::count(), $inFile());
    }

    public function test_an_update_queues_the_first_index_only_when_switched_on(): void
    {
        Queue::fake();
        (new FirstSearchIndex)->run();
        Queue::assertPushed(IndexSearch::class);

        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        Queue::fake();
        (new FirstSearchIndex)->run();
        Queue::assertNothingPushed();
    }
}
