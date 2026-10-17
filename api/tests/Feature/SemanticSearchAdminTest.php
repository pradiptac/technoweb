<?php

namespace Tests\Feature;

use App\Models\SearchPassage;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SemanticSearchAdminTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_settings_are_seeded_off_with_their_defaults(): void
    {
        $this->seed(SettingsSeeder::class);

        $this->assertFalse(SemanticSettings::enabled());
        $this->assertSame('openai/text-embedding-3-small', SemanticSettings::model());
        $this->assertSame(2000, SemanticSettings::dailyCap());
        $this->assertSame(0.35, SemanticSettings::floor());
    }

    public function test_the_write_checks(): void
    {
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_model', 'qwen/qwen3-embedding-0.6b'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_model', 'not a model'));
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_daily_cap', '500'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_daily_cap', '100001'));
        $this->assertNull(SemanticSettings::refusalFor('semantic_search_floor', '0.42'));
        $this->assertNotNull(SemanticSettings::refusalFor('semantic_search_floor', '1.5'));
    }

    public function test_a_passage_round_trips_its_binary_vector(): void
    {
        $bytes = pack('g*', 0.5, -0.25);
        $p = SearchPassage::create([
            'subject_type' => 'page', 'subject_id' => 1, 'position' => 0, 'heading' => null,
            'text' => 'Words', 'hash' => sha1('Words'), 'model' => 'm', 'vector' => $bytes, 'embedded_at' => now(),
        ]);

        $this->assertSame($bytes, $p->fresh()->vector);
    }
}
