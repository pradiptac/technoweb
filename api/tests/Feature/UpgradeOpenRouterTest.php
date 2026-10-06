<?php

namespace Tests\Feature;

use App\Enums\AiModel;
use App\Models\Setting;
use App\Support\Chat\ChatSettings;
use App\Support\Seo\Ai\SeoAiSettings;
use App\Support\Upgrade\Steps\MoveAiToOpenRouter;
use App\Support\Upgrade\UpgradeSteps;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * An install that called OpenAI directly, updated to the release that calls
 * OpenRouter (0.116.0): its chosen models are renamed to OpenRouter's ids,
 * and its OpenAI key is deleted rather than carried over, because an OpenAI
 * key is not an OpenRouter key.
 */
class UpgradeOpenRouterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.openrouter.key' => null, 'services.openrouter.model' => null]);
        $this->seed(SettingsSeeder::class);
    }

    /** The row an install from before 0.116.0 carries, with a stored (encrypted) key. */
    private function oldKey(string $value = 'sk-an-openai-key'): void
    {
        $row = new Setting(['group' => 'integrations', 'key' => 'openai_api_key', 'type' => 'string', 'is_secret' => true]);
        $row->setPlainValue($value);
        $row->save();
    }

    private function stored(string $key): ?string
    {
        return Setting::query()->where('key', $key)->value('value');
    }

    public function test_the_step_is_registered_and_recorded(): void
    {
        $this->assertContains(MoveAiToOpenRouter::class, UpgradeSteps::STEPS);

        UpgradeSteps::run(app(MoveAiToOpenRouter::class));

        $this->assertDatabaseHas('system_upgrade_steps', ['step' => '2026-10-06-move-ai-to-openrouter', 'version' => '0.116.0']);
        $this->assertNotContains(
            '2026-10-06-move-ai-to-openrouter',
            array_map(fn ($step) => $step->id(), UpgradeSteps::pending()),
        );
    }

    public function test_the_seeder_makes_the_new_key_row_and_not_the_old_one(): void
    {
        $this->assertDatabaseHas('settings', ['key' => 'openrouter_api_key', 'group' => 'integrations', 'is_secret' => true]);
        $this->assertDatabaseMissing('settings', ['key' => 'openai_api_key']);
    }

    public function test_bare_openai_models_are_renamed_and_the_old_key_is_deleted(): void
    {
        $this->oldKey();
        Setting::put('chatbot_model', 'gpt-4.1');
        Setting::put('seo_ai_model', 'gpt-4o-mini');

        app(MoveAiToOpenRouter::class)->run();

        $this->assertSame('openai/gpt-4.1', $this->stored('chatbot_model'));
        $this->assertSame('openai/gpt-4o-mini', $this->stored('seo_ai_model'));
        $this->assertDatabaseMissing('settings', ['key' => 'openai_api_key']);

        // And they are read that way at once: the cached map was dropped.
        $this->assertSame('openai/gpt-4.1', ChatSettings::model());
        $this->assertSame('openai/gpt-4o-mini', SeoAiSettings::model());

        // Both are now models the console offers, so the picker shows the
        // choice rather than an "outside this list" extra.
        $this->assertNotNull(AiModel::tryFrom('openai/gpt-4.1'));
        $this->assertCount(count(AiModel::cases()), AiModel::options($this->stored('chatbot_model')));
    }

    /** An OpenAI key is refused at OpenRouter, so it is not carried into the new row. */
    public function test_the_old_key_is_not_copied_into_the_new_row(): void
    {
        $this->oldKey();

        app(MoveAiToOpenRouter::class)->run();

        $this->assertNull($this->stored('openrouter_api_key'));
        $this->assertNull(ChatSettings::apiKey());
    }

    public function test_a_qualified_model_and_a_blank_one_are_left_alone(): void
    {
        Setting::put('chatbot_model', 'google/gemini-2.5-flash');
        Setting::put('seo_ai_model', null);

        app(MoveAiToOpenRouter::class)->run();

        $this->assertSame('google/gemini-2.5-flash', $this->stored('chatbot_model'));
        $this->assertNull($this->stored('seo_ai_model'));
        // Blank still means "whatever the site uses".
        $this->assertSame('google/gemini-2.5-flash', SeoAiSettings::model());
    }

    /**
     * The two halves of "a stored choice is never swapped for another
     * model": the step leaves a blank blank, and a blank now resolves to the
     * Google default — while `gpt-4o-mini`, which somebody chose, stays
     * OpenAI's model under OpenRouter's name for it and is **not** moved to
     * the default.
     */
    public function test_a_blank_resolves_to_the_google_default_and_a_stored_choice_never_does(): void
    {
        Setting::put('chatbot_model', null);
        Setting::put('seo_ai_model', 'gpt-4o-mini');

        app(MoveAiToOpenRouter::class)->run();

        $this->assertNull($this->stored('chatbot_model'));
        $this->assertSame('google/gemini-2.5-flash', ChatSettings::model());

        $this->assertSame('openai/gpt-4o-mini', $this->stored('seo_ai_model'));
        $this->assertSame('openai/gpt-4o-mini', SeoAiSettings::model());
    }

    /** A key somebody already saved for OpenRouter is theirs. */
    public function test_an_openrouter_key_already_saved_is_kept(): void
    {
        $this->oldKey();
        Setting::put('openrouter_api_key', 'sk-or-v1-already');

        app(MoveAiToOpenRouter::class)->run();

        $this->assertSame('sk-or-v1-already', ChatSettings::apiKey());
        $this->assertDatabaseMissing('settings', ['key' => 'openai_api_key']);
    }

    public function test_running_it_twice_changes_nothing_the_second_time(): void
    {
        $this->oldKey();
        Setting::put('chatbot_model', 'gpt-4o');

        app(MoveAiToOpenRouter::class)->run();
        app(MoveAiToOpenRouter::class)->run();

        $this->assertSame('openai/gpt-4o', $this->stored('chatbot_model'));
        $this->assertDatabaseMissing('settings', ['key' => 'openai_api_key']);
    }

    public function test_an_install_with_none_of_the_rows_is_not_an_error(): void
    {
        Setting::query()->whereIn('key', ['chatbot_model', 'seo_ai_model', 'openai_api_key'])->delete();
        Setting::flushCache();

        app(MoveAiToOpenRouter::class)->run();

        $this->assertDatabaseMissing('settings', ['key' => 'chatbot_model']);
    }
}
