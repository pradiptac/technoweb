<?php

namespace Tests\Feature;

use App\Models\KnowledgeArticle;
use App\Models\SearchPassage;
use App\Models\SearchQueryVector;
use App\Models\Setting;
use App\Support\Search\Indexer;
use App\Support\Search\SearchFile;
use App\Support\Search\Semantic;
use App\Support\Search\SemanticSettings;
use App\Support\Search\Vectors;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticMatchTest extends TestCase
{
    use FakesEmbeddings, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local'); // the packed file must not leak between tests
        SearchFile::flushMemo(); // and neither may its per-process memo
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
    }

    private function articles(): array
    {
        return [
            KnowledgeArticle::create(['title' => 'Channel planning', 'slug' => 'channels', 'excerpt' => 'x', 'body' => '<p>Wireless signal and disconnects.</p>', 'status' => 'published']),
            KnowledgeArticle::create(['title' => 'Rules', 'slug' => 'rules', 'excerpt' => 'x', 'body' => '<p>A firewall stops an attack.</p>', 'status' => 'published']),
        ];
    }

    public function test_meaning_finds_the_record_without_a_shared_word(): void
    {
        [$wifi] = $this->articles();

        $hits = Semantic::match('network keeps dropping', ['knowledge_article']);

        $this->assertSame($wifi->id, $hits[0]['subject_id']);
        $this->assertCount(1, $hits); // the firewall article is under the floor
    }

    public function test_passages_returns_the_passage_text_for_the_assistant(): void
    {
        [$wifi] = $this->articles();

        $rows = Semantic::passages('network keeps dropping', ['knowledge_article'], 5);

        $this->assertCount(1, $rows);
        $this->assertSame($wifi->id, $rows[0]['subject_id']);
        $this->assertStringContainsString('Wireless signal', $rows[0]['text']);
    }

    public function test_the_same_phrase_is_embedded_once(): void
    {
        $this->articles();
        $before = count(Http::recorded());

        Semantic::match('Network keeps dropping?', ['knowledge_article']);
        Semantic::match('network   keeps dropping', ['knowledge_article']);

        $this->assertSame(1, count(Http::recorded()) - $before);
        $this->assertSame(1, SearchQueryVector::count());
    }

    public function test_the_query_cache_is_per_model(): void
    {
        $this->articles();
        Semantic::match('network keeps dropping', ['knowledge_article']);

        Setting::query()->where('key', 'semantic_search_model')->update(['value' => 'qwen/qwen3-embedding-0.6b']);
        Setting::flushCache();
        Indexer::markAllWaiting(); // the real change re-embeds everything under the new model
        Indexer::embedWaiting();
        Semantic::match('network keeps dropping', ['knowledge_article']);

        $this->assertSame(2, SearchQueryVector::count());
    }

    public function test_an_empty_index_matches_nothing(): void
    {
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
    }

    public function test_a_part_number_or_a_short_phrase_skips_meaning(): void
    {
        $this->articles();
        $before = count(Http::recorded());

        $this->assertSame([], Semantic::match('CBS350-24T', ['knowledge_article']));
        $this->assertSame([], Semantic::match('ab', ['knowledge_article']));
        $this->assertSame($before, count(Http::recorded()));
    }

    public function test_a_phrase_of_punctuation_is_not_embedded(): void
    {
        $before = count(Http::recorded());

        $this->assertSame([], Semantic::match('???  --', ['knowledge_article']));
        $this->assertSame($before, count(Http::recorded()));
    }

    public function test_the_daily_cap_falls_back_to_words(): void
    {
        $this->articles();
        Setting::query()->where('key', 'semantic_search_daily_cap')->update(['value' => '1']);
        Setting::flushCache();

        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
        $this->assertSame([], Semantic::match('wireless signal problem', ['knowledge_article'])); // a second new phrase today
        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article'])); // cached: free
    }

    public function test_switched_off_or_failing_matches_nothing(): void
    {
        $this->articles();
        $this->fakeEmbeddings(status: 503);
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));

        Setting::query()->where('key', 'semantic_search_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->fakeEmbeddings();
        $this->assertSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
    }

    public function test_only_the_asked_kinds_are_returned(): void
    {
        $this->articles();

        $this->assertSame([], Semantic::match('network keeps dropping', ['blog_post']));
    }

    public function test_the_search_file_round_trips_the_vectors(): void
    {
        $model = SemanticSettings::model();
        $a = [0.6, 0.8, 0.0];
        $b = [0.0, 0.28, 0.96];
        foreach ([['knowledge_article', 7, $a], ['page', 9, $b]] as $i => [$type, $id, $vector]) {
            SearchPassage::create(['subject_type' => $type, 'subject_id' => $id, 'position' => 0, 'heading' => null, 'text' => 't', 'hash' => 'h'.$i, 'model' => $model, 'vector' => Vectors::pack($vector), 'embedded_at' => now()]);
        }
        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 10, 'position' => 0, 'heading' => null, 'text' => 't', 'hash' => 'h9', 'model' => $model, 'vector' => null, 'embedded_at' => null]); // not embedded: left out

        SearchFile::rebuild();
        $rows = SearchFile::load();
        $this->assertIsString($rows[0][3]); // held packed, unpacked only while scoring
        $rows = array_map(fn ($r) => [$r[0], $r[1], $r[2], Vectors::unpack($r[3])], $rows);

        $this->assertCount(2, $rows);
        $this->assertSame(['knowledge_article', 7], [$rows[0][1], $rows[0][2]]);
        $this->assertSame(['page', 9], [$rows[1][1], $rows[1][2]]);
        foreach ([$a, $b] as $i => $vector) {
            foreach ($vector as $j => $x) {
                $this->assertEqualsWithDelta($x, $rows[$i][3][$j], 1e-6);
            }
        }
        Storage::disk('local')->assertExists(SearchFile::path());
    }

    public function test_a_truncated_file_loads_only_its_complete_records(): void
    {
        $this->articles();
        SearchFile::rebuild();
        $full = SearchFile::load();
        $this->assertCount(2, $full);

        $disk = Storage::disk('local');
        $disk->put(SearchFile::path(), substr((string) $disk->get(SearchFile::path()), 0, -5));
        SearchFile::flushMemo();

        $this->assertCount(1, SearchFile::load());
        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
    }

    public function test_a_concurrent_insert_of_the_same_phrase_does_not_throw(): void
    {
        $this->articles();
        $hash = sha1(Semantic::normalise('network keeps dropping').'|'.SemanticSettings::model());

        // The other request's insert lands while this one is waiting for the embedding.
        $this->fakeEmbeddings(function (string $text) use ($hash) {
            SearchQueryVector::query()->insert(['hash' => $hash, 'model' => SemanticSettings::model(), 'vector' => Vectors::pack($this->vectorFor($text)), 'last_used_at' => now()]);

            return $this->vectorFor($text);
        });

        $this->assertNotSame([], Semantic::match('network keeps dropping', ['knowledge_article']));
        $this->assertSame(1, SearchQueryVector::count());
    }
}
