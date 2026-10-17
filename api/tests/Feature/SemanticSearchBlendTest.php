<?php

namespace Tests\Feature;

use App\Models\KnowledgeArticle;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Chat\Retriever;
use App\Support\Search\SearchFile;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticSearchBlendTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        SearchFile::flushMemo();
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
    }

    private function group(array $json, string $type): ?array
    {
        return collect($json['data']['groups'])->firstWhere('type', $type);
    }

    public function test_a_meaning_only_article_is_found_and_counted(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Plan your channels.', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']);

        $json = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->json();

        $group = $this->group($json, 'article');
        $this->assertNotNull($group);
        $this->assertSame('Channel planning', $group['results'][0]['title']);
        $this->assertSame(1, $group['total']);
        $this->assertSame(['excerpt', 'path', 'title'], collect(array_keys($group['results'][0]))->sort()->values()->all());
    }

    public function test_an_exact_sku_still_comes_first(): void
    {
        StoreProduct::create(['name' => 'Wireless access point', 'slug' => 'ap', 'sku' => 'AP-200', 'type' => 'physical', 'price_paise' => 100, 'status' => 'published', 'description' => '<p>Wireless signal for offices.</p>']);
        StoreProduct::create(['name' => 'Wi-Fi mesh kit', 'slug' => 'mesh', 'sku' => 'MESH-1', 'type' => 'physical', 'price_paise' => 100, 'status' => 'published', 'description' => '<p>Wireless network signal everywhere.</p>']);

        $json = $this->getJson('/api/v1/search?q=AP-200')->assertOk()->json();

        $this->assertStringContainsString('Wireless access point', $this->group($json, 'store_product')['results'][0]['title']);
    }

    public function test_a_record_found_by_both_appears_once_at_its_word_position(): void
    {
        KnowledgeArticle::create(['title' => 'Wireless signal guide', 'slug' => 'wsg', 'excerpt' => 'x', 'body' => '<p>Wireless signal disconnects.</p>', 'status' => 'published']);

        $json = $this->getJson('/api/v1/search?q='.urlencode('wireless signal'))->assertOk()->json();

        $this->assertCount(1, $this->group($json, 'article')['results']);
    }

    public function test_switched_off_the_response_is_exactly_the_word_search(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']);
        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();

        $json = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->json();

        $this->assertNull($this->group($json, 'article'));
    }

    public function test_no_passage_text_reaches_the_response(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Short excerpt.', 'body' => '<p>Wireless signal and disconnects. A unique-passage-sentence.</p>', 'status' => 'published']);

        $body = $this->getJson('/api/v1/search?q='.urlencode('network keeps dropping'))->assertOk()->getContent();

        $this->assertStringNotContainsString('unique-passage-sentence', $body);
    }

    public function test_the_assistant_retrieves_a_meaning_only_passage(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'Plan your channels.',
            'body' => '<p>Intro.</p><h2>Why it drops</h2><p>Wireless signal disconnects when channels overlap.</p>', 'status' => 'published']);

        $sources = Retriever::for('my network keeps dropping');

        $passage = collect($sources)->firstWhere('url', '/knowledge-base/channels');
        $this->assertNotNull($passage);
        $this->assertStringContainsString('channels overlap', $passage['excerpt']);
    }

    public function test_switched_off_the_assistant_retrieves_as_before(): void
    {
        KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal disconnects.</p>', 'status' => 'published']);
        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();

        $this->assertSame([], Retriever::for('my network keeps dropping'));
    }
}
