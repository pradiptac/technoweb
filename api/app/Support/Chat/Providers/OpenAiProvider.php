<?php

namespace App\Support\Chat\Providers;

use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Chat\ChatSettings;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OpenAI's chat completions endpoint.
 *
 * The only provider today. The key is read through `ChatSettings`, which looks
 * in the settings table first and `.env` second, and **never leaves this
 * process** — the browser talks to Next, Next talks to Laravel, Laravel talks
 * to OpenAI. That is the specification's Rule 3 and it is also the only
 * arrangement in which the key is not in a bundle somebody can read.
 */
class OpenAiProvider implements AiProvider
{
    private const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

    /**
     * Long enough for a considered answer, short enough that a visitor is not
     * watching a typing indicator wondering whether it is broken. A provider
     * that has not answered in this time is not going to.
     */
    private const TIMEOUT_SECONDS = 30;

    public function name(): string
    {
        return 'openai';
    }

    public function isConfigured(): bool
    {
        return filled(ChatSettings::apiKey());
    }

    public function complete(array $messages, int $maxTokens = 500): AiReply
    {
        if (! $this->isConfigured()) {
            return AiReply::failed('No OpenAI key is configured.');
        }

        try {
            $response = Http::withToken((string) ChatSettings::apiKey())
                ->timeout(self::TIMEOUT_SECONDS)
                // One retry, on the connection rather than on a refusal: a 401
                // or a content refusal will say the same thing again, and
                // retrying a 429 immediately is how a rate limit becomes a ban.
                ->retry(1, 200, throw: false)
                ->post(self::ENDPOINT, [
                    'model' => ChatSettings::model(),
                    'messages' => $messages,
                    'max_tokens' => $maxTokens,
                    /*
                     * Low, and deliberately so. This assistant's whole job is
                     * to repeat what the website says and to admit when the
                     * website does not say it; invention is the failure mode
                     * the specification names more than any other.
                     */
                    'temperature' => 0.2,
                ]);
        } catch (\Throwable $e) {
            Log::warning('The chat provider could not be reached', ['error' => $e->getMessage()]);

            return AiReply::failed($e->getMessage());
        }

        if (! $response->successful()) {
            /*
             * Logged with the provider's own words, because "the assistant
             * stopped answering" is otherwise indistinguishable from a bad key,
             * an exhausted quota and a model that no longer exists — and both
             * `.env` files ship `LOG_LEVEL=warning`, so `info` would be
             * discarded. The visitor is told none of it.
             */
            Log::warning('The chat provider refused a request', [
                'status' => $response->status(),
                'type' => (string) $response->json('error.type'),
                'message' => (string) $response->json('error.message'),
            ]);

            return AiReply::failed((string) $response->json('error.message') ?: 'HTTP '.$response->status());
        }

        $text = trim((string) $response->json('choices.0.message.content'));

        if ($text === '') {
            return AiReply::failed('The provider returned an empty reply.');
        }

        return AiReply::of($text, (int) $response->json('usage.total_tokens'));
    }
}
