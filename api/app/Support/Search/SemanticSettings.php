<?php

namespace App\Support\Search;

use App\Models\Setting;
use App\Support\Chat\OpenRouterModels;

/**
 * The private `semantic_search` group (docs/semantic-search.md): the one
 * reader, falling back per field, and the write checks SettingController
 * calls. The model is checked by shape only — OpenRouter's model list does not
 * carry embedding models — and "Test this model" is the real proof.
 */
final class SemanticSettings
{
    public const GROUP = 'semantic_search';

    public const DEFAULT_MODEL = 'openai/text-embedding-3-small';

    public const DIMENSIONS = 512;

    public const DEFAULT_CAP = 2000;

    public const DEFAULT_FLOOR = 0.35;

    public static function enabled(): bool
    {
        return Setting::get('semantic_search_enabled') === true;
    }

    public static function model(): string
    {
        $model = trim((string) Setting::get('semantic_search_model', ''));

        return $model !== '' && preg_match(OpenRouterModels::SHAPE, $model) ? $model : self::DEFAULT_MODEL;
    }

    public static function dailyCap(): int
    {
        $value = Setting::get('semantic_search_daily_cap');

        return is_numeric($value) && (int) $value >= 0 && (int) $value <= 100000 ? (int) $value : self::DEFAULT_CAP;
    }

    public static function floor(): float
    {
        $value = Setting::get('semantic_search_floor');

        return is_numeric($value) && (float) $value >= 0 && (float) $value <= 1 ? (float) $value : self::DEFAULT_FLOOR;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'semantic_search_') || ! is_scalar($value) || trim((string) $value) === '') {
            return null;
        }

        $value = trim((string) $value);

        return match ($key) {
            'semantic_search_model' => strlen($value) <= OpenRouterModels::MAX_LENGTH && preg_match(OpenRouterModels::SHAPE, $value)
                ? null : 'That is not a model id. Copy it from openrouter.ai/models — for example openai/text-embedding-3-small.',
            'semantic_search_daily_cap' => ctype_digit($value) && (int) $value <= 100000 ? null : 'A whole number of searches, 0 to 100,000.',
            'semantic_search_floor' => is_numeric($value) && (float) $value >= 0 && (float) $value <= 1 ? null : 'A number from 0 to 1.',
            default => null,
        };
    }

    public static function recordError(string $message): void
    {
        Setting::query()->where('key', 'semantic_search_error')->update(['value' => mb_substr($message, 0, 500)]);
        Setting::flushCache();
    }

    public static function clearError(): void
    {
        if (filled(Setting::get('semantic_search_error'))) {
            Setting::query()->where('key', 'semantic_search_error')->update(['value' => null]);
            Setting::flushCache();
        }
    }
}
