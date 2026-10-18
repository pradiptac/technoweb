<?php

namespace App\Support\Images;

use App\Models\Setting;
use App\Support\Seo\Ai\SeoAiSettings;
use Illuminate\Support\Facades\Cache;

/**
 * AI images' own settings (docs/ai-images.md): its daily cap, the house
 * picture style and the model. The switch and the key are the SEO
 * assistant's; the cap is not, so pictures cannot spend the writing or SEO day.
 */
final class ImageSettings
{
    public const DEFAULT_CAP = 30;

    public const MAX_CAP = 1000;

    public const STYLE_MAX = 500;

    public const DEFAULT_MODEL = 'google/gemini-2.5-flash-image';

    private const MODEL_SHAPE = '/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/';

    public static function dailyCap(): int
    {
        $value = trim((string) Setting::get('ai_image_daily_cap', ''));

        return $value !== '' && ctype_digit($value) ? min((int) $value, self::MAX_CAP) : self::DEFAULT_CAP;
    }

    public static function style(): string
    {
        return mb_substr(trim((string) Setting::get('ai_image_style', '')), 0, self::STYLE_MAX);
    }

    public static function model(): string
    {
        $value = strtolower(trim((string) Setting::get('ai_image_model', '')));

        return $value !== '' && mb_strlen($value) <= 100 && preg_match(self::MODEL_SHAPE, $value) ? $value : self::DEFAULT_MODEL;
    }

    public static function runsToday(): int
    {
        return (int) Cache::get(self::counterKey(), 0);
    }

    public static function countRun(): void
    {
        Cache::add(self::counterKey(), 0, now()->endOfDay());
        Cache::increment(self::counterKey());
    }

    public static function underCap(): bool
    {
        $cap = self::dailyCap();

        return $cap > 0 && self::runsToday() < $cap;
    }

    /** One sentence when a picture cannot be made now, else null. */
    public static function refusal(): ?string
    {
        if (! SeoAiSettings::enabled()) {
            return 'AI help is switched off. Turn it on in SEO → Settings.';
        }
        if (SeoAiSettings::apiKey() === null) {
            return 'Add an OpenRouter API key in Settings → API keys first.';
        }
        $cap = self::dailyCap();
        if ($cap === 0) {
            return 'Pictures are switched off (the daily limit is 0).';
        }
        if (self::runsToday() >= $cap) {
            return "Today's limit of {$cap} pictures has been reached. It resets at midnight.";
        }

        return null;
    }

    public static function refusalFor(string $key, mixed $value): ?string
    {
        if (! str_starts_with($key, 'ai_image_') || ! is_scalar($value) || trim((string) $value) === '') {
            return null;
        }
        $value = trim((string) $value);

        return match ($key) {
            'ai_image_daily_cap' => ctype_digit($value) && (int) $value <= self::MAX_CAP
                ? null : 'A whole number of pictures, 0 to 1,000. 0 switches pictures off.',
            'ai_image_style' => mb_strlen($value) <= self::STYLE_MAX
                ? null : 'Keep the house picture style to 500 characters.',
            'ai_image_model' => mb_strlen($value) <= 100 && preg_match(self::MODEL_SHAPE, strtolower($value))
                ? null : 'That is not a model id. Copy it from openrouter.ai/models, e.g. google/gemini-2.5-flash-image.',
            default => null,
        };
    }

    private static function counterKey(): string
    {
        return 'ai:image:runs:'.now()->toDateString();
    }
}
