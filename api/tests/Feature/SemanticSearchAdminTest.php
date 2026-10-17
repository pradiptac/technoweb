<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Jobs\IndexSearch;
use App\Models\Role;
use App\Models\SearchPassage;
use App\Models\User;
use App\Support\Search\SemanticSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\Concerns\FakesEmbeddings;
use Tests\TestCase;

class SemanticSearchAdminTest extends TestCase
{
    use FakesEmbeddings;
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

    private function asStaff(RoleEnum $role): static
    {
        $user = User::firstOrCreate(['email' => $role->value.'-ss@example.test'],
            ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function save(string $key, string $value): void
    {
        $this->asStaff(RoleEnum::Admin)->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $value]]])->assertOk();
    }

    public function test_switching_on_or_changing_the_model_queues_the_index(): void
    {
        $this->seed(SettingsSeeder::class);
        Queue::fake();

        $this->save('semantic_search_enabled', '1');
        Queue::assertPushed(IndexSearch::class, 1);

        $this->save('semantic_search_enabled', '1'); // already on: nothing new
        Queue::assertPushed(IndexSearch::class, 1);

        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 1, 'position' => 0, 'heading' => null,
            'text' => 'Words', 'hash' => sha1('Words'), 'model' => 'm', 'vector' => pack('g', 1.0), 'embedded_at' => now()]);
        $this->save('semantic_search_model', 'qwen/qwen3-embedding-0.6b');

        Queue::assertPushed(IndexSearch::class, 2);
        $this->assertNull(SearchPassage::sole()->embedded_at);
    }

    public function test_an_unrelated_save_queues_nothing(): void
    {
        $this->seed(SettingsSeeder::class);
        Queue::fake();

        $this->save('semantic_search_floor', '0.4');

        Queue::assertNothingPushed();
    }

    public function test_the_status_counts_passages_and_todays_phrases(): void
    {
        $this->seed(SettingsSeeder::class);
        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 1, 'position' => 0, 'text' => 'a', 'hash' => sha1('a'), 'model' => 'm', 'vector' => 'x', 'embedded_at' => now()]);
        SearchPassage::create(['subject_type' => 'page', 'subject_id' => 1, 'position' => 1, 'text' => 'b', 'hash' => sha1('b')]);

        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/search/semantic')->assertOk()
            ->assertJsonPath('data.passages.total', 2)->assertJsonPath('data.passages.waiting', 1)
            ->assertJsonPath('data.today.cap', 2000)->assertJsonPath('data.enabled', false);
    }

    public function test_the_model_test_answers_dimensions_or_openrouters_words(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->enableSemanticSearch();
        $this->fakeEmbeddings();
        $this->asStaff(RoleEnum::Admin)->postJson('/api/v1/admin/search/semantic/test')->assertOk()->assertJsonPath('data.dimensions', 8);

        $this->fakeEmbeddings(status: 401);
        $this->asStaff(RoleEnum::Admin)->postJson('/api/v1/admin/search/semantic/test')->assertStatus(422)->assertJsonPath('errors.model.0', 'Refused for the test');
    }

    public function test_reindex_queues_the_run_and_only_an_administrator_may(): void
    {
        $this->seed(SettingsSeeder::class);
        Queue::fake();
        $this->asStaff(RoleEnum::ContentManager)->postJson('/api/v1/admin/search/semantic/reindex')->assertForbidden();
        $this->asStaff(RoleEnum::Admin)->postJson('/api/v1/admin/search/semantic/reindex')->assertStatus(202);
        Queue::assertPushed(IndexSearch::class);
    }
}
