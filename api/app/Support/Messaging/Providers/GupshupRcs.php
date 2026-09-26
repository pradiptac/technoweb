<?php

namespace App\Support\Messaging\Providers;

use App\Support\Phone;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * RCS through Gupshup's enterprise gateway.
 *
 * Gupshup RCS is onboarding-gated: a user id and password issued with the
 * account, the bot id, and templates approved on Gupshup's own dashboard —
 * so a template here names its **template code** in
 * `provider_template_name`, and its placeholder values travel as
 * `customParam` by name. A template with no code is sent as plain text,
 * which Gupshup accepts only where the bot allows free text; its refusal
 * comes back in its own words.
 *
 * **Not yet driven against a real account.** The send is built from
 * Gupshup's published RCS API page; the delivery-report shape is not
 * published there, so the webhook reads the common fields (`externalId` or
 * `id`, `status` or `eventType`, and a `text` from `mobile`) and ignores
 * the rest. Verified by the shared `messaging_webhook_secret` on the URL.
 */
class GupshupRcs extends Provider
{
    public const GATEWAY = 'https://enterprise.smsgupshup.com/GatewayAPI/rest';

    protected function name(): string
    {
        return 'Gupshup';
    }

    public function configured(): bool
    {
        return $this->allFilled(['rcs_gupshup_userid', 'rcs_gupshup_password', 'rcs_gupshup_bot_id']);
    }

    public function send(OutgoingMessage $message): string
    {
        $code = $message->template->provider_template_name;

        if (filled($code)) {
            $params = [];
            foreach ($message->template->placeholderNames() as $name) {
                $params[$name] = $message->value($name);
            }

            $msg = ['contentMessage' => ['templateMessage' => array_filter([
                'templateCode' => (string) $code,
                'customParam' => $params ?: null,
            ])]];
        } else {
            $msg = ['contentMessage' => ['text' => $message->body()]];
        }

        return $this->message($message->to, $msg);
    }

    public function test(string $to): string
    {
        return $this->message($to, ['contentMessage' => ['text' => self::TEST_BODY]]);
    }

    /** @param  array<string, mixed>  $msg */
    private function message(string $to, array $msg): string
    {
        $res = $this->call(fn () => Http::asForm()->acceptJson()->timeout(self::TIMEOUT)->post(self::GATEWAY, [
            'method' => 'SendMessage',
            'send_to' => Phone::digits($to),
            'msg' => (string) json_encode($msg),
            'msg_type' => 'TEXT',
            'userid' => $this->setting('rcs_gupshup_userid'),
            'auth_scheme' => 'plain',
            'password' => $this->setting('rcs_gupshup_password'),
            'botId' => $this->setting('rcs_gupshup_bot_id'),
            'v' => '1.1',
            'format' => 'json',
        ]));

        if (! $res->successful() || $res->json('response.status') !== 'success') {
            throw ProviderException::fromResponse('Gupshup', $res, $this->words($res));
        }

        return (string) $res->json('response.id');
    }

    public function verifyWebhook(Request $request): bool
    {
        return $this->sharedSecretMatches($request);
    }

    public function webhookEvents(Request $request): array
    {
        $events = [];
        $id = $request->input('externalId') ?? $request->input('id');
        $status = ProviderEvent::statusFrom($request->input('status') ?? $request->input('eventType'));

        if ($status !== null && filled($id)) {
            $events[] = ProviderEvent::status((string) $id, $status, $request->input('cause'));
        }

        $text = $request->input('text');
        $from = Phone::e164((string) $request->input('mobile', $request->input('phone', '')));

        if (is_string($text) && $from !== null) {
            $events[] = ProviderEvent::inbound($from, $text);
        }

        return $events;
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('response.details') ?? $res->json('response.status');

        return is_string($message) && $message !== '' ? $message : null;
    }
}
