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
        /*
         * The four added with the intake and hand-off work, and each is public
         * for the same reason the originals are: the widget draws them before
         * anybody has spoken, so a private one would be a setting the site
         * cannot read and therefore a setting that does nothing.
         *
         * What stays private is everything about *how* it answers — the model,
         * the caps, the intake questions and whether unanswered questions are
         * forwarded. The rule this list exists for is that a key joins it
         * deliberately, one at a time, rather than the group being published.
         */
        'chatbot_name',
        'chatbot_auto_open',
        'chatbot_auto_open_delay',
        'chatbot_whatsapp_number',
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

    /**
     * What the assistant is called.
     *
     * Falls back to the company's own name plus "assistant" rather than to a
     * literal, so an install that renames the business does not go on
     * introducing a company that no longer exists — the same fallback chain
     * `Newsletter\Branding` follows from `newsletter_company` to `company_name`.
     */
    public static function name(): string
    {
        $value = trim((string) Setting::get('chatbot_name', ''));

        if ($value !== '') {
            return $value;
        }

        $company = trim((string) Setting::get('company_name', ''));

        return $company !== '' ? $company.' assistant' : 'Website assistant';
    }

    public static function welcome(): string
    {
        $value = trim((string) Setting::get('chatbot_welcome', ''));

        return $value !== '' ? $value : 'Hello. I am the '.self::name().'. '
            .'I can help you find products, understand our services, or reach the right person.';
    }

    /**
     * Should the panel open itself?
     *
     * Off by default and that is not timidity: a panel that opens over the page
     * somebody is reading is the single most complained-about pattern on the
     * web, and switching it on is a decision the business takes rather than one
     * it inherits. The frontend opens it **once per visitor**, not once per
     * page — see `chat-widget.tsx`, where the flag lives in `sessionStorage`.
     */
    public static function autoOpen(): bool
    {
        return (bool) Setting::get('chatbot_auto_open', false);
    }

    /**
     * How long to wait first, in seconds.
     *
     * Floored at three: opening on arrival interrupts the page before anybody
     * has read a word of it, and the whole argument for a delay is that the
     * offer should follow the content rather than pre-empt it. Capped at five
     * minutes, past which nobody is still on the page it was measured from.
     */
    public static function autoOpenDelay(): int
    {
        return max(3, min(300, (int) Setting::get('chatbot_auto_open_delay', 20)));
    }

    /**
     * The number a conversation can be carried on at, digits only.
     *
     * Normalised here rather than at the two call sites that build a `wa.me`
     * URL, because that link is silently wrong rather than broken when the
     * number carries spaces or a `+` — it opens WhatsApp on a search for a
     * contact that does not exist. Empty when nothing usable is configured, so
     * the control is absent rather than dead.
     */
    public static function whatsappNumber(): string
    {
        $digits = preg_replace('/\D+/', '', (string) Setting::get('chatbot_whatsapp_number', '')) ?? '';

        // Shorter than this is not a dialable international number, and a
        // half-typed one would make the button a dead end rather than an offer.
        return strlen($digits) >= 8 ? $digits : '';
    }

    /**
     * Send the desk what the assistant could not answer, with who asked.
     *
     * The unanswered list already collects the *questions*; this is the other
     * half — the visitor attached to one, while they are still on the page. Off
     * by default, because switched on it turns every unanswerable question into
     * an email and a busy afternoon becomes a mailbox somebody filters.
     */
    public static function forwardUnanswered(): bool
    {
        return (bool) Setting::get('chatbot_forward_unanswered', false);
    }

    /** Ask who the visitor is before answering anything. */
    public static function intakeEnabled(): bool
    {
        return (bool) Setting::get('chatbot_intake_enabled', true);
    }

    /**
     * The intake questions, as `field|question` per line.
     *
     * The same shape as `chatbot_quick_actions` above and the homepage
     * statistics — an editor here has met the format before, which is worth
     * more than a format that fits this one case slightly better.
     *
     * The **field** is validated against `Intake::FIELDS` and an unrecognised
     * one is dropped: it arrives from a text box, so it is untrusted input, and
     * a typo would otherwise be a question nobody can ever answer because
     * nothing knows how to store the reply. Order is the editor's.
     *
     * @return array<int, array{field: string, question: string}>
     */
    public static function intakeQuestions(): array
    {
        $raw = trim((string) Setting::get('chatbot_intake_questions', ''));

        if ($raw === '') {
            $raw = implode("\n", [
                'name|Before I look anything up — may I take your name?',
                'email|Thank you. What is the best email address to reach you on?',
                'phone|And a number, in case a call turns out to be quicker? Say skip if you would rather not.',
                'company|Which company are you with? Say skip if it is a personal enquiry.',
                'requirement|Thank you. Now — what can I help you with today?',
            ]);
        }

        $steps = [];
        $seen = [];

        foreach (preg_split('/\R/', $raw) ?: [] as $line) {
            $line = trim($line);

            if ($line === '') {
                continue;
            }

            [$field, $question] = array_pad(explode('|', $line, 2), 2, null);
            $field = mb_strtolower(trim((string) $field));
            $question = trim((string) $question);

            // Unknown field, no question, or the same field twice — a repeated
            // one would be asked, answered, and then asked again, because the
            // step is chosen by which fields are still missing.
            if (! in_array($field, Intake::FIELDS, true) || $question === '' || isset($seen[$field])) {
                continue;
            }

            $seen[$field] = true;
            $steps[] = ['field' => $field, 'question' => $question];
        }

        return $steps;
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
