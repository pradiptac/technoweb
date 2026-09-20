<?php

namespace App\Support\Seo\Ai;

use App\Models\Setting;
use App\Support\Chat\ChatSettings;

/**
 * Everything the SEO assistant reads before it does anything.
 *
 * One place, for the reason `ChatSettings` gives: the same numbers are wanted
 * by the controller (to refuse), by the assistant (to trim) and by the console
 * (to display), and three readings of one setting is how the newsletter's
 * footer address ended up resolved three different ways.
 *
 * Every key here is in the private `seo` group, which is already absent from
 * the public whitelist in `ContentController::settings()`. Nothing on the public
 * site needs to know any of it, and a spend ceiling is not a visitor's business.
 */
class SeoAiSettings
{
    /**
     * Off until somebody turns it on.
     *
     * The default that matters most in the file: a module that starts spending
     * money the moment a migration runs is one nobody agreed to. The chatbot
     * ships the same way, and so did comments.
     */
    public static function enabled(): bool
    {
        return (bool) Setting::get('seo_ai_enabled', false);
    }

    /**
     * The key, shared with the chatbot.
     *
     * Delegated rather than re-read: `ChatSettings::apiKey()` already resolves
     * the settings row and falls back to `.env`, and a second copy of that
     * fallback is a second thing to change when the arrangement moves. One
     * account, one key — a second `seo_openai_api_key` would be two credentials
     * for one provider and an obvious way to have exactly one of them rotated.
     */
    public static function apiKey(): ?string
    {
        return ChatSettings::apiKey();
    }

    /**
     * Which model, falling through rather than defaulting.
     *
     * `seo_ai_model`, then the chatbot's, then `.env`. Blank means "whatever
     * the site uses", which is what most installs want — one model everywhere,
     * differentiated only when somebody decides SEO is worth more than a chat
     * reply.
     *
     * **A value outside `AiModel` is returned unchanged, deliberately.** See the
     * enum: substituting silently would bill somebody for a model they did not
     * choose.
     */
    public static function model(): string
    {
        $model = trim((string) Setting::get('seo_ai_model', ''));

        return $model !== '' ? $model : ChatSettings::model();
    }

    /**
     * The only ceiling that bounds the bill.
     *
     * Zero means no cap, matching `chatbot_daily_reply_cap`. A rate limit bounds
     * one editor's afternoon; only a total bounds the month.
     */
    public static function dailyCap(): int
    {
        return max(0, (int) Setting::get('seo_ai_daily_cap', 100));
    }

    public static function retentionDays(): int
    {
        // The same seven-day floor the chat prune keeps, applied here as well as
        // in the command: a typo in a settings box must not be able to destroy
        // the record of what was suggested this week.
        return max(7, (int) Setting::get('seo_ai_retention_days', 90));
    }

    // ---- The business context (§6), which is editable ----------------------

    public static function businessType(): string
    {
        return trim((string) Setting::get('seo_ai_business_type', ''))
            ?: trim((string) Setting::get('tagline', ''));
    }

    public static function audience(): string
    {
        return trim((string) Setting::get('seo_ai_audience', ''));
    }

    public static function locations(): string
    {
        return trim((string) Setting::get('seo_ai_locations', ''));
    }

    public static function extraContext(): string
    {
        return trim((string) Setting::get('seo_ai_context', ''));
    }

    public static function companyName(): string
    {
        return trim((string) Setting::get('company_name', ''));
    }
}
