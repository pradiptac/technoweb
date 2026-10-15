<?php

namespace App\Support\Upgrade\Steps;

use App\Enums\AiModel;
use App\Models\Setting;
use App\Support\Upgrade\UpgradeStep;

/**
 * An install that called OpenAI directly, moved onto OpenRouter (0.116.0).
 *
 * Every AI feature calls OpenRouter from this release on — one key, with the
 * maker as a prefix on the model id (`App\Enums\AiModel`). Two things an
 * existing install carries are in the old arrangement's terms:
 *
 * **The chosen models.** `chatbot_model` and `seo_ai_model` hold an id as
 * OpenAI names it — `gpt-4.1` — and OpenRouter names the same model
 * `openai/gpt-4.1`; sent bare it is refused as no model at all. So a bare
 * OpenAI id gets its maker in front (`AiModel::qualify()`). That is a
 * rename and not a change of model: the one called is the one that was
 * chosen. A blank stays blank (it means "the default"), and a value that
 * already names its maker — or that this cannot recognise as OpenAI's — is
 * left exactly as it is.
 *
 * **The old key.** The `openai_api_key` row is deleted, and its value is
 * **not copied** into `openrouter_api_key`. An OpenAI key is not an
 * OpenRouter key: sent there it is refused, and a refused key that looks
 * configured is worse than a blank one that says "add a key" — every AI
 * feature would report a provider failure instead of naming what to do. The
 * client creates a key at openrouter.ai and saves it in Settings → API keys;
 * their OpenAI key (and a Google AI Studio one) goes in at OpenRouter itself,
 * under its Integrations. Deleting the row also takes an encrypted
 * credential nothing reads any more out of the database, which is where a
 * credential nobody uses should not be.
 *
 * The seeder has already made the `openrouter_api_key` row by the time this
 * runs — the updater seeds before it runs the steps. Safe to run twice: a
 * qualified id is left alone, and a row already gone is not there to delete.
 *
 * Until a key is saved the AI features answer "No OpenRouter key is
 * configured" and call nothing; the website assistant goes on answering
 * from the pages it finds, as it always has without a model.
 */
final class MoveAiToOpenRouter implements UpgradeStep
{
    /** The two settings that hold a model id. */
    private const MODEL_KEYS = ['chatbot_model', 'seo_ai_model'];

    public function id(): string
    {
        return '2026-10-06-move-ai-to-openrouter';
    }

    public function version(): string
    {
        return '0.116.0';
    }

    public function description(): string
    {
        return 'Point the AI features at OpenRouter';
    }

    public function run(): void
    {
        foreach (self::MODEL_KEYS as $key) {
            $row = Setting::query()->where('key', $key)->first();

            if ($row === null) {
                continue;
            }

            $stored = trim((string) $row->value);
            $moved = AiModel::qualify($stored);

            if ($moved !== $stored) {
                $row->forceFill(['value' => $moved])->save();
            }
        }

        // One at a time through the model, so its `deleted` hook drops the
        // cached settings map; a query-builder delete would leave the old
        // key answering from the cache.
        Setting::query()->where('key', 'openai_api_key')->get()->each(fn (Setting $row) => $row->delete());

        Setting::flushCache();
    }
}
