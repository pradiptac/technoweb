<?php

namespace App\Support\Chat;

use App\Enums\AiModel;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * OpenRouter's live model list, and the check a typed model id must pass (0.165.0).
 *
 * `AiModel` is the short list the console describes; this is how any other
 * model OpenRouter offers — a free one, one released last week — can be
 * chosen without a release. The id is typed, so it is held to a shape and to
 * OpenRouter's own list: a typo saved happily is the failure `AiModel`'s
 * docblock gives for not using a text box, and here it would be caught
 * *before* the save rather than when the first visitor asks a question.
 *
 * **The list is public** (`GET /api/v1/models`, no key), fetched with a 10 s
 * timeout and held for an hour under one cache key. **When it cannot be
 * fetched the id is accepted on its shape alone** — OpenRouter being down
 * must never stop an administrator saving a setting — and that failure is
 * remembered for a minute only, so an outage neither costs a 10 s wait on
 * every save nor outlives itself.
 */
final class OpenRouterModels
{
    /** `maker/model`, optionally `:free` or another variant suffix. */
    public const SHAPE = '/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/';

    public const MAX_LENGTH = 100;

    private const URL = 'https://openrouter.ai/api/v1/models';

    private const CACHE_KEY = 'openrouter.models';

    /**
     * Every model id OpenRouter lists, each with what is worth knowing, or
     * null when the list could not be fetched.
     *
     * @return array<string, array{name: string, free: bool, images: bool}>|null
     */
    public static function all(): ?array
    {
        $cached = Cache::get(self::CACHE_KEY);

        if (is_array($cached)) {
            return $cached['models'];
        }

        $models = self::fetch();

        Cache::put(self::CACHE_KEY, ['models' => $models], $models === null ? 60 : 3600);

        return $models;
    }

    /** @return array<int, string>|null */
    public static function ids(): ?array
    {
        $all = self::all();

        return $all === null ? null : array_keys($all);
    }

    /** True or false when the list is known; null when it could not be read. */
    public static function has(string $id): ?bool
    {
        $all = self::all();

        return $all === null ? null : isset($all[$id]);
    }

    /** @return array{name: string, free: bool, images: bool}|null */
    public static function describe(string $id): ?array
    {
        return self::all()[$id] ?? null;
    }

    /**
     * Why a model id may not be chosen, or null when it may.
     *
     * One of `AiModel`'s own is always fine and costs no fetch. Anything else
     * must have the shape and — when OpenRouter's list is reachable — be on it.
     */
    public static function refusalFor(string $id): ?string
    {
        if (AiModel::tryFrom($id) !== null) {
            return null;
        }

        if (strlen($id) > self::MAX_LENGTH || preg_match(self::SHAPE, $id) !== 1) {
            return 'That is not a model id. Copy it from openrouter.ai/models, e.g. google/gemma-4-31b-it:free.';
        }

        if (self::has($id) === false) {
            return "OpenRouter has no model called “{$id}”. Copy the id from openrouter.ai/models.";
        }

        return null;
    }

    /** @return array<string, array{name: string, free: bool, images: bool}>|null */
    private static function fetch(): ?array
    {
        try {
            $response = Http::timeout(10)->acceptJson()->get(self::URL);

            if (! $response->successful() || ! is_array($response->json('data'))) {
                return null;
            }

            $models = [];

            foreach ($response->json('data') as $row) {
                if (! is_array($row) || ! is_string($row['id'] ?? null)) {
                    continue;
                }

                $models[$row['id']] = [
                    'name' => (string) ($row['name'] ?? $row['id']),
                    'free' => str_ends_with($row['id'], ':free')
                        || (($row['pricing']['prompt'] ?? null) === '0' && ($row['pricing']['completion'] ?? null) === '0'),
                    'images' => in_array('image', (array) ($row['architecture']['input_modalities'] ?? []), true),
                ];
            }

            // An empty list is a broken answer, not a statement that nothing exists.
            return $models === [] ? null : $models;
        } catch (Throwable) {
            return null;
        }
    }
}
