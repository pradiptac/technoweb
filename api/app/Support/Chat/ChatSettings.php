<?php

namespace App\Support\Chat;

use App\Models\Setting;

/**
 * Everything the assistant reads before it says anything.
 *
 * One place, because the same numbers are wanted by the controller (to refuse),
 * by the orchestrator (to trim) and by the console (to display) — and three
 * readings of one setting is how the newsletter's footer address ended up being
 * resolved three different ways.
 *
 * **`Setting::get()` casts by the row's declared type**, so a `boolean` row
 * returns a real `false`. Comparing against `'0'` is true for a switched-off
 * toggle — that shipped once here and ran automatic fulfilment with the toggle
 * set to manual.
 */
class ChatSettings
{
    /**
     * The four keys the public site is allowed to know.
     *
     * The whitelist is by *group* everywhere else, which is the right default
     * and wrong here: this group also holds the model name and the spend caps.
     * Named explicitly, exactly as `newsletter_signup_enabled` is, so it stays
     * one considered exception rather than a second whitelist that grows.
     *
     * @var array<int, string>
     */
    public const PUBLIC_KEYS = [
        'chatbot_enabled',
        'chatbot_welcome',
        'chatbot_quick_actions',
        'chatbot_fallback',
    ];

    public static function enabled(): bool
    {
        return (bool) Setting::get('chatbot_enabled', false);
    }

    public static function model(): string
    {
        $model = trim((string) Setting::get('chatbot_model', ''));

        // `.env` is the fallback, the arrangement `MailSettingsProvider` uses
        // for the mail transport: a first deploy has no settings row yet.
        return $model !== '' ? $model : (string) config('services.openai.model', 'gpt-4o-mini');
    }

    /**
     * The key, from Settings first and `.env` second.
     *
     * The specification asks for an environment variable. This application
     * already keeps provider credentials in the settings table — encrypted at
     * rest, `is_secret`, never returned to a browser — because that is what
     * lets somebody change provider without a deploy, which is the same
     * argument the outgoing-mail transports were built on. `.env` remains the
     * fallback so a fresh install works before anybody opens the console.
     */
    public static function apiKey(): ?string
    {
        $key = trim((string) Setting::get('openai_api_key', ''));

        return $key !== '' ? $key : (config('services.openai.key') ?: null);
    }

    public static function welcome(): string
    {
        $value = trim((string) Setting::get('chatbot_welcome', ''));

        return $value !== '' ? $value : "Hello. I'm the Technoware website assistant. "
            .'I can help you find products, understand our services, or reach the right person.';
    }

    public static function fallback(): string
    {
        $value = trim((string) Setting::get('chatbot_fallback', ''));

        return $value !== '' ? $value : "I can't confirm that from the information on our website, "
            .'and I would rather not guess. Our team can answer it properly.';
    }

    /**
     * The chips under the welcome, as `Label|what it asks` per line.
     *
     * The label is what somebody presses and the second half is what gets sent,
     * because "Need support" is a good button and a poor question. One per
     * line, the shape the homepage statistics already use — an editor here has
     * met that format before.
     *
     * @return array<int, array{label: string, message: string}>
     */
    public static function quickActions(): array
    {
        $raw = trim((string) Setting::get('chatbot_quick_actions', ''));

        if ($raw === '') {
            $raw = implode("\n", [
                'Find a product|I am looking for a product',
                'Explore solutions|What technology solutions do you provide?',
                'Web services|What web services do you offer?',
                'Need support|I need technical support',
                'Talk to sales|I would like someone to contact me',
            ]);
        }

        $actions = [];

        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $line = trim($line);

            if ($line === '') {
                continue;
            }

            [$label, $message] = array_pad(explode('|', $line, 2), 2, null);
            $label = trim((string) $label);

            if ($label === '') {
                continue;
            }

            $actions[] = ['label' => $label, 'message' => trim((string) $message) ?: $label];
        }

        // Five is what fits under a welcome without becoming a menu. Anything
        // beyond that is a list somebody scrolls instead of a suggestion.
        return array_slice($actions, 0, 5);
    }

    /** How long one message may be, in characters. */
    public static function maxMessageLength(): int
    {
        return max(20, (int) Setting::get('chatbot_max_message_chars', 1000));
    }

    /**
     * How many messages one conversation may hold before it is closed.
     *
     * A ceiling on the conversation rather than on the context alone: context
     * trimming bounds the cost of each request and does nothing about a
     * thousand of them.
     */
    public static function maxMessages(): int
    {
        return max(2, (int) Setting::get('chatbot_max_messages', 40));
    }

    /** How many earlier messages travel with a request. */
    public static function contextMessages(): int
    {
        return max(2, (int) Setting::get('chatbot_context_messages', 10));
    }

    /**
     * The most assistant replies the whole site will produce in a day.
     *
     * The one control that bounds the bill rather than any single visitor's
     * behaviour. Rate limits stop one person; this stops a bad afternoon.
     * Zero means no ceiling, which somebody has to choose deliberately.
     */
    public static function dailyReplyCap(): int
    {
        return max(0, (int) Setting::get('chatbot_daily_reply_cap', 500));
    }

    public static function retentionDays(): int
    {
        // A floor, like the activity log's, so a typo cannot destroy the trail
        // — and unlike that one, a transcript is personal data, so there is a
        // ceiling on how long it may be kept rather than only a floor.
        return max(7, (int) Setting::get('chat_retention_days', 90));
    }
}
