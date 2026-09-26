<?php

namespace App\Support\Messaging\Providers;

use App\Support\Seo\GoogleServiceAccount;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * RCS through Google's RCS Business Messaging API, directly.
 *
 * The token comes from `GoogleServiceAccount` on the RBM key file's own
 * setting row — the exchange Search Console and GA4 share, parameterised
 * rather than copied. RBM has no template approval: an agent sends what it
 * likes to a user who can receive RCS, so a template here is
 * `not_required`. A number that cannot receive RCS answers 404, which is a
 * failure for that message and not a reason to opt the person out.
 *
 * Google signs every callback: `X-Goog-Signature` is base64 of HMAC-SHA512,
 * keyed with the agent's client token, over the base64-decoded
 * `message.data`. Configuring the webhook sends `{clientToken, secret}`,
 * answered by echoing the secret when the token is ours.
 */
class GoogleRbm extends Provider
{
    public const BASE = 'https://rcsbusinessmessaging.googleapis.com/v1';

    public const SCOPE = 'https://www.googleapis.com/auth/rcsbusinessmessaging';

    public const KEY = 'rcs_rbm_service_account';

    protected function name(): string
    {
        return 'Google RBM';
    }

    public function configured(): bool
    {
        return $this->allFilled(['rcs_rbm_agent_id', self::KEY]);
    }

    public function send(OutgoingMessage $message): string
    {
        $suggestions = array_map(fn (array $b) => match ($b['type']) {
            'url' => ['action' => ['text' => $b['text'], 'postbackData' => $b['text'], 'openUrlAction' => ['url' => $b['value']]]],
            'phone' => ['action' => ['text' => $b['text'], 'postbackData' => $b['text'], 'dialAction' => ['phoneNumber' => $b['value']]]],
            default => ['reply' => ['text' => $b['text'], 'postbackData' => $b['value'] !== '' ? $b['value'] : $b['text']]],
        }, $message->buttons());

        $url = $message->template->mediaUrl();

        $content = $url === null
            ? array_filter(['text' => $message->body(), 'suggestions' => $suggestions ?: null])
            : ['richCard' => ['standaloneCard' => [
                'cardOrientation' => 'VERTICAL',
                'cardContent' => array_filter([
                    'title' => $message->title(),
                    'description' => $message->body(),
                    'media' => ['height' => 'MEDIUM', 'contentInfo' => ['fileUrl' => $url]],
                    'suggestions' => $suggestions ?: null,
                ]),
            ]]];

        return $this->message($message->to, $content);
    }

    public function test(string $to): string
    {
        return $this->message($to, ['text' => self::TEST_BODY]);
    }

    /** @param  array<string, mixed>  $content */
    private function message(string $to, array $content): string
    {
        try {
            $token = GoogleServiceAccount::accessToken(self::SCOPE, self::KEY);
        } catch (RuntimeException $e) {
            throw new ProviderException($e->getMessage(), config: true);
        }

        $id = (string) Str::uuid();

        $res = $this->call(fn () => Http::withToken($token)->acceptJson()->timeout(self::TIMEOUT)
            ->withQueryParameters(['messageId' => $id, 'agentId' => $this->setting('rcs_rbm_agent_id')])
            ->post(self::BASE.'/phones/'.rawurlencode($to).'/agentMessages', ['contentMessage' => $content]));

        if (! $res->successful()) {
            $words = $res->status() === 404
                ? 'This number cannot receive RCS messages — its phone or carrier does not support them.'
                : $this->words($res);

            throw ProviderException::fromResponse('Google', $res, $words);
        }

        return $id;
    }

    public function challenge(Request $request): ?HttpResponse
    {
        $given = $request->input('clientToken');
        $secret = $request->input('secret');

        if (! is_string($given) || ! is_string($secret) || $request->has('message')) {
            return null;
        }

        $token = $this->setting('rcs_rbm_client_token');

        return $token !== '' && hash_equals($token, $given)
            ? response()->json(['secret' => $secret])
            : response('', 200);
    }

    public function verifyWebhook(Request $request): bool
    {
        $token = $this->setting('rcs_rbm_client_token');
        $given = (string) $request->header('X-Goog-Signature', '');
        $data = $request->input('message.data');

        if ($token === '' || $given === '' || ! is_string($data)) {
            return false;
        }

        $decoded = base64_decode($data, true);

        return $decoded !== false && hash_equals(base64_encode(hash_hmac('sha512', $decoded, $token, true)), $given);
    }

    public function webhookEvents(Request $request): array
    {
        $data = json_decode((string) base64_decode((string) $request->input('message.data', ''), true), true);

        if (! is_array($data)) {
            return [];
        }

        $events = [];
        $status = ProviderEvent::statusFrom($data['eventType'] ?? null);

        if ($status !== null && filled($data['messageId'] ?? null)) {
            $events[] = ProviderEvent::status((string) $data['messageId'], $status);
        }

        $text = $data['text'] ?? $data['suggestionResponse']['text'] ?? null;

        if (is_string($text) && filled($data['senderPhoneNumber'] ?? null)) {
            $events[] = ProviderEvent::inbound((string) $data['senderPhoneNumber'], $text);
        }

        return $events;
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('error.message');

        return is_string($message) ? $message : null;
    }
}
