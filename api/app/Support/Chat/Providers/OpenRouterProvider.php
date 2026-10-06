<?php

namespace App\Support\Chat\Providers;

use App\Enums\AiModel;
use App\Models\Setting;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\Chat\ChatSettings;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * OpenRouter's chat completions endpoint — the one door every AI feature in
 * this application goes through (0.116.0).
 *
 * The website assistant and its intake judge, the SEO assistant, alt text,
 * article drafts and page drafts all resolve `AiProvider` from the container
 * and all arrive here. OpenRouter speaks the OpenAI wire format and routes a
 * request to whichever maker the model id names (`google/gemini-2.5-flash`,
 * `openai/gpt-4o-mini`), so this is one key, one endpoint and one bill
 * to read — and the client keeps their own OpenAI and Google AI Studio keys
 * *at OpenRouter* (bring your own key), not here. See `App\Enums\AiModel`.
 *
 * The key is read through `ChatSettings`, which looks in the settings table
 * first and `.env` second, and **never leaves this process** — the browser
 * talks to Next, Next talks to Laravel, Laravel talks to OpenRouter. That is
 * the specification's Rule 3 and it is also the only arrangement in which
 * the key is not in a bundle somebody can read.
 *
 * ## Three ways OpenRouter says no, and all three are failures here
 *
 * A status other than 2xx, as any API. **A 200 carrying an `error` object**,
 * which is how it reports a maker that failed after OpenRouter had already
 * accepted the request — read as a success, that is an empty answer somebody
 * renders. And **a 200 with no choices, or a choice with nothing in it**. The
 * error's own shape is `{code, message, metadata: {provider_name, raw}}`, and
 * `message` is frequently just "Provider returned error": what the maker
 * actually said is in `metadata.raw`, so that is read too.
 *
 * All of it goes to the log and into `AiReply::$error`, which is for the log
 * and for `test-model`'s administrator. **None of it is ever shown to a
 * visitor** — every caller writes its own sentence — because that is where
 * model names, quota messages and account ids live.
 */
class OpenRouterProvider implements AiProvider
{
    private const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    /**
     * Long enough for a considered answer, short enough that a visitor is not
     * watching a typing indicator wondering whether it is broken. A provider
     * that has not answered in this time is not going to.
     *
     * A caller with nobody watching a typing indicator may ask for longer
     * through `$options['timeout']`: a page draft is 3,500 tokens of JSON
     * and does not arrive in thirty seconds.
     */
    private const TIMEOUT_SECONDS = 30;

    private const MAX_TIMEOUT_SECONDS = 180;

    /**
     * How much of a refusal is kept. Generous on purpose: a rate-limit
     * refusal's useful half — which limit, and how long to wait — is at the
     * *end* of a long sentence, and cutting it there keeps the apology and
     * loses the instruction.
     */
    private const MAX_RAW_CHARS = 700;

    private const MAX_ERROR_CHARS = 1000;

    /** The least extra allowance a model that thinks first is given. */
    private const THINKING_HEADROOM = 1024;

    public function name(): string
    {
        return 'openrouter';
    }

    public function isConfigured(): bool
    {
        return filled(ChatSettings::apiKey());
    }

    public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
    {
        if (! $this->isConfigured()) {
            return AiReply::failed('No OpenRouter key is configured.');
        }

        // The caller's model, or the chatbot's. Named per request rather than
        // read once, because two features on one key are worth different money.
        $model = (string) ($options['model'] ?? ChatSettings::model());
        $timeout = self::timeout($options['timeout'] ?? null);

        try {
            $response = Http::withToken((string) ChatSettings::apiKey())
                // OpenRouter's attribution headers: which site is calling,
                // and what it is called on their dashboard. Optional to them
                // and worth sending — it is how the client tells this
                // install's spend from anything else on the same account.
                ->withHeaders(self::attribution())
                ->timeout($timeout)
                /*
                 * One attempt, and a refusal is never tried again on the
                 * spot: a 401 or a content refusal will say the same thing a
                 * second time, and retrying a 429 immediately is how a rate
                 * limit becomes a ban. That matters most on a free Google AI
                 * Studio key, whose per-minute limit is the refusal an
                 * install is likeliest to meet — it is reported (below, in
                 * the maker's words) and left for the next press.
                 * `throw: false` so the refusal comes back as a response to
                 * read rather than as an exception.
                 */
                ->retry(1, 200, throw: false)
                ->post(self::ENDPOINT, array_filter([
                    'model' => $model,
                    'messages' => $messages,
                    'max_tokens' => self::allowance($model, $maxTokens),
                    /*
                     * Low, and deliberately so. This assistant's whole job is
                     * to repeat what the website says and to admit when the
                     * website does not say it; invention is the failure mode
                     * the specification names more than any other.
                     */
                    'temperature' => $options['temperature'] ?? 0.2,
                    /*
                     * Absent unless asked for, and `array_filter` is what keeps
                     * it absent: sending `response_format: null` is not the same
                     * request as sending no `response_format`, and the chat path
                     * must keep sending the second one.
                     */
                    'response_format' => $options['response_format'] ?? null,
                ], fn ($v) => $v !== null));
        } catch (\Throwable $e) {
            Log::warning('The AI provider could not be reached', ['error' => $e->getMessage()]);

            return AiReply::failed($e->getMessage());
        }

        $error = $response->json('error');

        if (! $response->successful() || is_array($error)) {
            return self::refused($response, is_array($error) ? $error : [], $model);
        }

        $choice = $response->json('choices.0');

        if (! is_array($choice)) {
            Log::warning('The AI provider answered with no choices', ['status' => $response->status(), 'model' => $model]);

            return AiReply::failed('OpenRouter answered without a reply in it (no choices).');
        }

        // A maker that failed part-way reports it on the choice rather than
        // on the response, under the same 200.
        if (is_array($choice['error'] ?? null)) {
            return self::refused($response, $choice['error'], $model);
        }

        $text = self::text($choice['message']['content'] ?? null);

        if ($text === '') {
            $reason = (string) ($choice['finish_reason'] ?? '');

            Log::warning('The AI provider returned an empty reply', ['model' => $model, 'finish_reason' => $reason]);

            return AiReply::failed(match ($reason) {
                // The one empty reply with a cause somebody can act on: the
                // whole allowance went on thinking. See `allowance()`.
                'length' => 'The model used its whole allowance of tokens before writing an answer.',
                '' => 'The provider returned an empty reply.',
                default => 'The provider returned an empty reply (finish reason: '.$reason.').',
            });
        }

        return AiReply::of($text, (int) $response->json('usage.total_tokens'));
    }

    /**
     * `HTTP-Referer` and `X-Title`, as OpenRouter asks for them.
     *
     * The referer is the public site — `FRONTEND_URL`, which is the
     * production domain on every machine by design — and the title is the
     * company's own name, so a white-label install shows up at OpenRouter as
     * the customer and never as the product. A header value cannot hold a
     * line break, and a company name is something a person typed.
     *
     * @return array<string, string>
     */
    private static function attribution(): array
    {
        $title = trim((string) Setting::get('company_name', ''));
        $title = $title !== '' ? $title : (string) config('app.name');
        $title = mb_substr(trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $title)), 0, 120);

        return array_filter([
            'HTTP-Referer' => trim((string) config('app.frontend_url')),
            'X-Title' => $title,
        ], fn (string $v) => $v !== '');
    }

    /**
     * How many seconds to wait, and room for PHP to wait that long.
     *
     * Bounded both ways: a typo of zero must not mean "for ever", and nothing
     * here is worth holding a worker for more than three minutes. A web
     * request's own limit is **raised to cover it and never imposed** — the
     * CLI runs unlimited, and `set_time_limit()` there puts a wall clock on
     * the whole test process on Windows (`Updater::step()` records that one).
     */
    private static function timeout(mixed $asked): int
    {
        $timeout = is_numeric($asked) ? (int) $asked : self::TIMEOUT_SECONDS;
        $timeout = max(5, min(self::MAX_TIMEOUT_SECONDS, $timeout));

        $limit = (int) ini_get('max_execution_time');

        if ($timeout > self::TIMEOUT_SECONDS && $limit > 0 && $limit < $timeout + 15) {
            @set_time_limit($timeout + 15);
        }

        return $timeout;
    }

    /**
     * The `max_tokens` to send: the caller's cap, plus headroom for a model
     * that thinks before it writes.
     *
     * A thinking model's reasoning is drawn from the same allowance as its
     * answer, so a cap sized for the answer alone — five tokens to prove a
     * model, 120 for an alt text — can be spent before a word is written and
     * comes back as an empty reply. Those models get the cap again on top, and
     * never less than `THINKING_HEADROOM`. A model outside `AiModel` is sent
     * the caller's figure untouched, like everything else about it.
     */
    private static function allowance(string $model, int $maxTokens): int
    {
        return AiModel::tryFromValue($model)?->thinks()
            ? $maxTokens + max(self::THINKING_HEADROOM, $maxTokens)
            : $maxTokens;
    }

    /**
     * The reply's text. Almost always a string; a list of parts when a maker
     * answers in the multimodal shape, in which case the text parts are it.
     */
    private static function text(mixed $content): string
    {
        if (is_string($content)) {
            return trim($content);
        }

        if (! is_array($content)) {
            return '';
        }

        $text = '';

        foreach ($content as $part) {
            if (is_array($part) && is_string($part['text'] ?? null)) {
                $text .= $part['text'];
            }
        }

        return trim($text);
    }

    /**
     * A refusal, logged whole and returned as one sentence.
     *
     * Logged with the provider's own words, because "the assistant stopped
     * answering" is otherwise indistinguishable from a bad key, a free key's
     * rate limit (a 429), an exhausted quota, a maker whose key was never
     * added at OpenRouter and a model that no longer exists — and both `.env`
     * files ship `LOG_LEVEL=warning`, so `info` would be discarded. The
     * visitor is told none of it; `test-model`'s administrator is told all
     * of it, word for word.
     *
     * @param  array<string, mixed>  $error
     */
    private static function refused(Response $response, array $error, string $model): AiReply
    {
        $message = is_scalar($error['message'] ?? null) ? trim((string) $error['message']) : '';
        $maker = is_scalar($error['metadata']['provider_name'] ?? null) ? trim((string) $error['metadata']['provider_name']) : '';
        $raw = self::raw($error['metadata']['raw'] ?? null);

        Log::warning('The AI provider refused a request', [
            'status' => $response->status(),
            'code' => is_scalar($error['code'] ?? null) ? (string) $error['code'] : '',
            'message' => $message,
            'maker' => $maker,
            'raw' => $raw,
            'model' => $model,
        ]);

        $said = $message !== '' ? $message : 'HTTP '.$response->status();

        // OpenRouter's own message is often only "Provider returned error";
        // what the maker said is the part that tells somebody what to fix.
        if ($raw !== '' && ! str_contains($said, $raw)) {
            $said .= ' — '.($maker !== '' ? $maker.': ' : '').$raw;
        } elseif ($maker !== '' && ! str_contains($said, $maker)) {
            $said .= ' ('.$maker.')';
        }

        return AiReply::failed(mb_substr($said, 0, self::MAX_ERROR_CHARS));
    }

    /**
     * What the maker itself answered, as one bounded line.
     *
     * `metadata.raw` is whatever came back upstream: usually a JSON string
     * in that maker's own error shape, sometimes already decoded, sometimes
     * plain text. The message inside is what is wanted; failing that, the
     * thing itself.
     */
    private static function raw(mixed $raw): string
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : $raw;
        }

        if (is_array($raw)) {
            $inner = $raw['error']['message'] ?? $raw['message'] ?? null;
            $raw = is_scalar($inner) ? (string) $inner : (string) json_encode($raw);
        }

        if (! is_scalar($raw)) {
            return '';
        }

        return mb_substr(trim((string) preg_replace('/\s+/', ' ', (string) $raw)), 0, self::MAX_RAW_CHARS);
    }
}
