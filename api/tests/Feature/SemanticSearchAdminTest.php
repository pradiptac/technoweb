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
}
