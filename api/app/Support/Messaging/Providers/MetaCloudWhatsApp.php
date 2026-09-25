<?php

namespace App\Support\Messaging\Providers;

use App\Enums\TemplateApproval;
use App\Models\MessageTemplate;
use App\Support\Phone;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * WhatsApp through Meta's Cloud API (Graph API), directly.
 *
 * Templates are **named-parameter** templates (`parameter_format: NAMED`),
 * so a body written as `{{order_number}}` here is submitted and sent under
 * that same name — no renumbering, which is what Gupshup and Twilio need.
 * The webhook is signed: `X-Hub-Signature-256` is an HMAC-SHA256 of the raw
 * body with the app secret, and the subscription handshake is a GET echoing
 * `hub.challenge` when `hub.verify_token` matches ours.
 */
class MetaCloudWhatsApp extends Provider
{
    public const BASE = 'https://graph.facebook.com/v21.0';

    protected function name(): string
    {
        return 'Meta';
    }

    public function configured(): bool
    {
        return $this->allFilled(['whatsapp_meta_phone_number_id', 'whatsapp_meta_access_token']);
    }

    public function send(OutgoingMessage $message): string
    {
        $template = $message->template;
        $components = [];

        if ($template->mediaUrl() !== null) {
            $components[] = ['type' => 'header', 'parameters' => [['type' => 'image', 'image' => ['link' => $template->mediaUrl()]]]];
        }

        $names = $template->placeholderNames();

        if ($names !== []) {
            $components[] = [
                'type' => 'body',
                'parameters' => array_map(fn (string $n) => [
                    'type' => 'text', 'parameter_name' => $n, 'text' => $message->value($n),
                ], $names),
            ];
        }

        return $this->message($message->to, [
            'type' => 'template',
            'template' => array_filter([
                'name' => $template->providerName(),
                'language' => ['code' => $this->language($template)],
                'components' => $components ?: null,
            ]),
        ]);
    }

    /**
     * `hello_world`, which Meta puts on every business account: a free-form
     * text is refused outside a 24-hour conversation, so a template is the
     * only test that means anything.
     */
    public function test(string $to): string
    {
        return $this->message($to, [
            'type' => 'template',
            'template' => ['name' => 'hello_world', 'language' => ['code' => 'en_US']],
        ]);
    }

    /** @param  array<string, mixed>  $content */
    private function message(string $to, array $content): string
    {
        $res = $this->call(fn () => Http::withToken($this->setting('whatsapp_meta_access_token'))
            ->acceptJson()->timeout(self::TIMEOUT)
            ->post(self::BASE.'/'.$this->setting('whatsapp_meta_phone_number_id').'/messages', [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => Phone::digits($to),
                ...$content,
            ]));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Meta', $res, $this->words($res));
        }

        return (string) $res->json('messages.0.id');
    }

    public function syncTemplates(): array
    {
        $waba = $this->setting('whatsapp_meta_business_account_id');

        if ($waba === '') {
            throw new ProviderException('Save the WhatsApp Business account id first — templates live on the account, not the number.');
        }

        $res = $this->call(fn () => Http::withToken($this->setting('whatsapp_meta_access_token'))
            ->acceptJson()->timeout(self::TIMEOUT)
            ->get(self::BASE."/{$waba}/message_templates", [
                'fields' => 'id,name,status,language,category,rejected_reason',
                'limit' => 200,
            ]));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Meta', $res, $this->words($res));
        }

        return array_values(array_map(fn (array $row) => new SyncedTemplate(
            (string) ($row['name'] ?? ''),
            (string) ($row['language'] ?? ''),
            TemplateApproval::fromProvider($row['status'] ?? null),
            self::reason($row['rejected_reason'] ?? null),
            isset($row['id']) ? (string) $row['id'] : null,
        ), array_filter((array) $res->json('data', []), 'is_array')));
    }

    public function submitTemplate(MessageTemplate $template): SyncedTemplate
    {
        $waba = $this->setting('whatsapp_meta_business_account_id');

        if ($waba === '') {
            throw new ProviderException('Save the WhatsApp Business account id first — templates live on the account, not the number.');
        }

        $components = [];

        if (filled($template->header_text)) {
            $components[] = ['type' => 'HEADER', 'format' => 'TEXT', 'text' => $template->header_text];
        }

        $body = ['type' => 'BODY', 'text' => $template->body];
        $names = $template->placeholderNames();

        if ($names !== []) {
            $body['example'] = ['body_text_named_params' => array_map(
                fn (string $n) => ['param_name' => $n, 'example' => $this->sample($n)], $names,
            )];
        }

        $components[] = $body;

        $buttons = array_map(fn (array $b) => match ($b['type'] ?? 'reply') {
            'url' => ['type' => 'URL', 'text' => (string) $b['text'], 'url' => (string) ($b['value'] ?? '')],
            'phone' => ['type' => 'PHONE_NUMBER', 'text' => (string) $b['text'], 'phone_number' => (string) ($b['value'] ?? '')],
            default => ['type' => 'QUICK_REPLY', 'text' => (string) $b['text']],
        }, (array) ($template->buttons ?? []));

        if ($buttons !== []) {
            $components[] = ['type' => 'BUTTONS', 'buttons' => array_values($buttons)];
        }

        $res = $this->call(fn () => Http::withToken($this->setting('whatsapp_meta_access_token'))
            ->acceptJson()->timeout(self::TIMEOUT)
            ->post(self::BASE."/{$waba}/message_templates", [
                'name' => $template->providerName(),
                'language' => $this->language($template),
                'category' => strtoupper((string) ($template->category ?: 'utility')),
                'parameter_format' => 'NAMED',
                'components' => $components,
            ]));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Meta', $res, $this->words($res));
        }

        return new SyncedTemplate(
            $template->providerName(),
            $this->language($template),
            TemplateApproval::fromProvider($res->json('status') ?? 'PENDING'),
            null,
            filled($res->json('id')) ? (string) $res->json('id') : null,
        );
    }

    /** Meta's subscription handshake: echo the challenge when the token is ours. */
    public function challenge(Request $request): ?HttpResponse
    {
        if (! $request->isMethod('GET')) {
            return null;
        }

        $token = $this->setting('whatsapp_meta_verify_token');
        $given = (string) $request->query('hub_verify_token', '');

        if ($request->query('hub_mode') === 'subscribe' && $token !== '' && hash_equals($token, $given)) {
            return response((string) $request->query('hub_challenge', ''), 200)->header('Content-Type', 'text/plain');
        }

        return response('', 200);
    }

    public function verifyWebhook(Request $request): bool
    {
        $secret = $this->setting('whatsapp_meta_app_secret');
        $given = (string) $request->header('X-Hub-Signature-256', '');

        if ($secret === '' || ! str_starts_with($given, 'sha256=')) {
            return false;
        }

        return hash_equals('sha256='.hash_hmac('sha256', $request->getContent(), $secret), $given);
    }

    public function webhookEvents(Request $request): array
    {
        $events = [];

        foreach ((array) $request->input('entry', []) as $entry) {
            foreach ((array) ($entry['changes'] ?? []) as $change) {
                $value = (array) ($change['value'] ?? []);

                if (($change['field'] ?? '') === 'message_template_status_update') {
                    $events[] = ProviderEvent::template(
                        (string) ($value['message_template_name'] ?? ''),
                        isset($value['message_template_language']) ? (string) $value['message_template_language'] : null,
                        TemplateApproval::fromProvider($value['event'] ?? null),
                        self::reason($value['reason'] ?? null),
                    );

                    continue;
                }

                foreach ((array) ($value['statuses'] ?? []) as $status) {
                    $mapped = ProviderEvent::statusFrom($status['status'] ?? null);

                    if ($mapped !== null && filled($status['id'] ?? null)) {
                        $events[] = ProviderEvent::status((string) $status['id'], $mapped, $status['errors'][0]['title'] ?? null);
                    }
                }

                foreach ((array) ($value['messages'] ?? []) as $msg) {
                    $text = $msg['text']['body'] ?? $msg['button']['text'] ?? $msg['interactive']['button_reply']['title'] ?? null;

                    if (filled($msg['from'] ?? null) && is_string($text)) {
                        $events[] = ProviderEvent::inbound('+'.ltrim((string) $msg['from'], '+'), $text);
                    }
                }
            }
        }

        return $events;
    }

    /** Meta's rejection reason, where `NONE` means there is none. */
    private static function reason(mixed $reason): ?string
    {
        return is_string($reason) && $reason !== '' && $reason !== 'NONE' ? $reason : null;
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('error.error_user_msg') ?? $res->json('error.message');

        return is_string($message) ? $message : null;
    }
}
