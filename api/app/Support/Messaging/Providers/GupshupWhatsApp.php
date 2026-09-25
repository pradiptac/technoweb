<?php

namespace App\Support\Messaging\Providers;

use App\Enums\TemplateApproval;
use App\Models\MessageTemplate;
use App\Support\Phone;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * WhatsApp through Gupshup's partner API.
 *
 * Gupshup templates are numbered (`{{1}}`), so the body is renumbered in
 * order of first appearance on submit and the values sent in that order.
 * A template is sent by Gupshup's **id**, which sync stores in
 * `provider_template_id`. Gupshup signs nothing, so its webhook carries the
 * shared `messaging_webhook_secret` as `?token=` on the callback URL.
 */
class GupshupWhatsApp extends Provider
{
    public const BASE = 'https://api.gupshup.io';

    protected function name(): string
    {
        return 'Gupshup';
    }

    public function configured(): bool
    {
        return $this->allFilled(['whatsapp_gupshup_api_key', 'whatsapp_gupshup_app_name', 'whatsapp_gupshup_source']);
    }

    public function send(OutgoingMessage $message): string
    {
        $template = $message->template;

        if (blank($template->provider_template_id)) {
            throw new ProviderException('Gupshup sends a template by its id, and this one has none yet. Sync the approval status on the templates screen.');
        }

        $form = $this->base($message->to) + [
            'template' => json_encode(['id' => $template->provider_template_id, 'params' => $message->positionalValues()]),
        ];

        if ($template->mediaUrl() !== null) {
            $form['message'] = json_encode(['type' => 'image', 'image' => ['link' => $template->mediaUrl()]]);
        }

        return $this->post('/wa/api/v1/template/msg', $form);
    }

    public function test(string $to): string
    {
        return $this->post('/wa/api/v1/msg', $this->base($to) + [
            'message' => json_encode(['type' => 'text', 'text' => self::TEST_BODY]),
        ]);
    }

    /** @return array<string, string> */
    private function base(string $to): array
    {
        return [
            'channel' => 'whatsapp',
            'source' => Phone::digits(Phone::e164($this->setting('whatsapp_gupshup_source')) ?? $this->setting('whatsapp_gupshup_source')),
            'destination' => Phone::digits($to),
            'src.name' => $this->setting('whatsapp_gupshup_app_name'),
        ];
    }

    /** @param  array<string, string>  $form */
    private function post(string $path, array $form): string
    {
        $res = $this->call(fn () => Http::asForm()->acceptJson()->timeout(self::TIMEOUT)
            ->withHeaders(['apikey' => $this->setting('whatsapp_gupshup_api_key')])
            ->post(self::BASE.$path, $form));

        if (! $res->successful() || ($res->json('status') !== null && ! in_array($res->json('status'), ['submitted', 'success'], true))) {
            throw ProviderException::fromResponse('Gupshup', $res, $this->words($res));
        }

        return (string) $res->json('messageId');
    }

    private function appId(): string
    {
        $id = $this->setting('whatsapp_gupshup_app_id');

        if ($id === '') {
            throw new ProviderException('Save the Gupshup app id first — templates live on the app.');
        }

        return $id;
    }

    public function syncTemplates(): array
    {
        $res = $this->call(fn () => Http::acceptJson()->timeout(self::TIMEOUT)
            ->withHeaders(['apikey' => $this->setting('whatsapp_gupshup_api_key')])
            ->get(self::BASE.'/wa/app/'.$this->appId().'/template'));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Gupshup', $res, $this->words($res));
        }

        return array_values(array_map(fn (array $row) => new SyncedTemplate(
            (string) ($row['elementName'] ?? ''),
            (string) ($row['languageCode'] ?? ''),
            TemplateApproval::fromProvider($row['status'] ?? null),
            filled($row['reason'] ?? null) ? (string) $row['reason'] : null,
            isset($row['id']) ? (string) $row['id'] : null,
        ), array_filter((array) $res->json('templates', []), 'is_array')));
    }

    public function submitTemplate(MessageTemplate $template): SyncedTemplate
    {
        $example = (string) preg_replace_callback('/\{\{\s*([a-z0-9_]+)\s*\}\}/i', fn (array $m) => $this->sample(strtolower($m[1])), $template->body);

        $form = [
            'elementName' => $template->providerName(),
            'languageCode' => $this->language($template),
            'category' => strtoupper((string) ($template->category ?: 'utility')),
            'templateType' => 'TEXT',
            'vertical' => $template->name,
            'content' => $template->positionalBody(),
            'example' => $example,
            'enableSample' => 'true',
        ];

        if (filled($template->header_text)) {
            $form['header'] = (string) $template->header_text;
        }

        if (! empty($template->buttons)) {
            $form['buttons'] = (string) json_encode(array_values(array_map(fn (array $b) => match ($b['type'] ?? 'reply') {
                'url' => ['type' => 'URL', 'text' => $b['text'], 'url' => $b['value'] ?? ''],
                'phone' => ['type' => 'PHONE_NUMBER', 'text' => $b['text'], 'phone_number' => $b['value'] ?? ''],
                default => ['type' => 'QUICK_REPLY', 'text' => $b['text']],
            }, (array) $template->buttons)));
        }

        $res = $this->call(fn () => Http::asForm()->acceptJson()->timeout(self::TIMEOUT)
            ->withHeaders(['apikey' => $this->setting('whatsapp_gupshup_api_key')])
            ->post(self::BASE.'/wa/app/'.$this->appId().'/template', $form));

        if (! $res->successful() || $res->json('status') === 'error') {
            throw ProviderException::fromResponse('Gupshup', $res, $this->words($res));
        }

        return new SyncedTemplate(
            $template->providerName(),
            $this->language($template),
            TemplateApproval::fromProvider($res->json('template.status') ?? 'pending'),
            null,
            filled($res->json('template.id')) ? (string) $res->json('template.id') : null,
        );
    }

    public function verifyWebhook(Request $request): bool
    {
        return $this->sharedSecretMatches($request);
    }

    public function webhookEvents(Request $request): array
    {
        $type = (string) $request->input('type', '');
        $payload = (array) $request->input('payload', []);

        if ($type === 'message-event') {
            $status = ProviderEvent::statusFrom($payload['type'] ?? null);
            $id = $payload['id'] ?? $payload['gsId'] ?? null;

            return $status !== null && filled($id)
                ? [ProviderEvent::status((string) $id, $status, $payload['payload']['reason'] ?? null)]
                : [];
        }

        if ($type === 'message') {
            $text = $payload['payload']['text'] ?? $payload['payload']['title'] ?? null;
            $from = $payload['source'] ?? $payload['sender']['phone'] ?? null;

            return is_string($text) && filled($from) ? [ProviderEvent::inbound('+'.ltrim((string) $from, '+'), $text)] : [];
        }

        if ($type === 'template-event') {
            return filled($payload['elementName'] ?? null) ? [ProviderEvent::template(
                (string) $payload['elementName'],
                isset($payload['languageCode']) ? (string) $payload['languageCode'] : null,
                TemplateApproval::fromProvider($payload['status'] ?? null),
                filled($payload['rejectedReason'] ?? null) ? (string) $payload['rejectedReason'] : null,
            )] : [];
        }

        return [];
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('message') ?? $res->json('error.message') ?? $res->json('reason');

        return is_string($message) ? $message : null;
    }
}
