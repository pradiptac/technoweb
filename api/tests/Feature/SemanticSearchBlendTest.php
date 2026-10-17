<?php

namespace Tests\Feature;

use App\Models\KnowledgeArticle;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Chat\Retriever;
use App\Support\Search\SearchFile;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
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

    private function article(string $slug, string $title, string $body): void
    {
        KnowledgeArticle::create(['title' => $title, 'slug' => $slug, 'excerpt' => 'x', 'body' => $body, 'status' => 'published']);
    }

    public function test_a_passage_excerpt_is_at_most_600_characters_with_its_ellipsis(): void
    {
        $this->article('long', 'Channel planning', '<p>Wireless signal disconnects. '.str_repeat('Overlapping channels cause wireless disconnects. ', 40).'</p>');

        $sources = Retriever::for('my network keeps dropping');

        $this->assertNotEmpty($sources);
        foreach ($sources as $source) {
            $this->assertLessThanOrEqual(600, mb_strlen($source['excerpt']));
        }
    }

    public function test_a_page_the_words_already_carry_is_not_added_twice(): void
    {
        $this->article('channels', 'Dropping network guide', '<p>Wireless signal disconnects.</p>');

        $urls = array_column(Retriever::for('my network keeps dropping'), 'url');

        $this->assertSame(1, count(array_keys($urls, '/knowledge-base/channels', true)));
    }

    public function test_meaning_adds_at_most_four_passages(): void
    {
        foreach (range(1, 6) as $i) {
            $this->article("guide-{$i}", "Guide {$i}", '<p>Wireless signal disconnects.</p>');
        }

        $this->assertCount(4, Retriever::for('my network keeps dropping'));
    }

    public function test_a_failing_semantic_search_leaves_the_word_sources(): void
    {
        $this->article('switch-guide', 'Switch buying guide', '<p>Ports and PoE.</p>');
        $this->fakeEmbeddings(fn () => throw new \RuntimeException('embedding down'));

        $urls = array_column(Retriever::for('switch buying'), 'url');

        $this->assertContains('/knowledge-base/switch-guide', $urls);
    }

    public function test_two_phrasings_with_the_same_terms_each_get_their_own_meaning(): void
    {
        $this->article('wifi', 'Guide one', '<p>Wireless signal and disconnects.</p>');
        $this->article('storage', 'Guide two', '<p>Backup disk and raid.</p>');
        $this->fakeEmbeddings(fn (string $text) => str_contains($text, 'best') ? $this->vectorFor('backup disk') : $this->vectorFor($text));

        $plain = array_column(Retriever::for('dropping'), 'url');
        $other = array_column(Retriever::for('best dropping'), 'url');

        $this->assertContains('/knowledge-base/wifi', $plain);
        $this->assertContains('/knowledge-base/storage', $other);
        $this->assertNotContains('/knowledge-base/wifi', $other);
    }

    public function test_a_failed_embedding_is_not_remembered(): void
    {
        $this->article('wifi', 'Guide one', '<p>Wireless signal and disconnects.</p>');
        // Terms that match no word source, so only meaning could answer.
        $this->fakeEmbeddings(null, 500);
        $this->assertSame([], Retriever::for('dropping'));

        $this->fakeEmbeddings();
        $before = count(Http::recorded());
        $urls = array_column(Retriever::for('dropping'), 'url');

        $this->assertContains('/knowledge-base/wifi', $urls);
        $this->assertGreaterThan($before, count(Http::recorded()));
    }
}
