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
     * The website assistant's model provider. `AI_API_KEY` and `AI_MODEL` are
     * the names the chatbot specification asks for.
     *
     * See `App\Support\Chat\ChatSettings`, which reads the setting first and
     * falls through to this.
     */
    'openai' => [
        'key' => env('AI_API_KEY'),
        'model' => env('AI_MODEL', 'gpt-4o-mini'),
    ],
];
