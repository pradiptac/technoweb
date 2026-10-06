<?php

/*
 * Third-party service credentials, from the environment.
 *
 * This file is the **fallback** and not the usual home. Provider credentials
 * in this application live in the settings table — encrypted, `is_secret`,
 * never returned to a browser — so a client can change provider or rotate a
 * key without a deploy, which is the argument the six outgoing-mail transports
 * are built on. `.env` remains here so a fresh install works before anybody
 * has opened the console.
 */
return [
    /*
     * OpenRouter, which every AI feature calls (0.116.0): the website
     * assistant, the SEO assistant, alt text, the article and page drafts.
     *
     * `OPENROUTER_API_KEY` is the name; `AI_API_KEY` — the one the chatbot
     * specification asks for, and what an install from before OpenRouter may
     * carry — is still read when the first is absent. Whichever it comes
     * from, **it has to be an OpenRouter key**: an OpenAI key is refused
     * there. The client's own OpenAI and Google AI Studio keys are saved at
     * OpenRouter, not here.
     *
     * `AI_MODEL` is an OpenRouter model id, `maker/model`. Unset, it is
     * `google/gemini-2.5-flash` (`AiModel::DEFAULT`), which a free Google AI
     * Studio key added at OpenRouter can call. A bare `gpt-…` left from
     * before is read as `openai/gpt-…` by `ChatSettings::model()` — a stored
     * or configured choice is renamed, never swapped for the default.
     *
     * See `App\Support\Chat\ChatSettings`, which reads the setting first and
     * falls through to this.
     */
    'openrouter' => [
        // `?:` rather than a default: a present-but-blank `OPENROUTER_API_KEY=`
        // is an empty string, which a default would not look past.
        'key' => env('OPENROUTER_API_KEY') ?: env('AI_API_KEY'),
        'model' => env('AI_MODEL', 'google/gemini-2.5-flash'),
    ],

    // Hunter.io, for verifying newsletter addresses. Read second, after the
    // `hunter_api_key` setting — see `App\Support\Newsletter\HunterClient`.
    'hunter' => [
        'key' => env('HUNTER_API_KEY'),
    ],
];
