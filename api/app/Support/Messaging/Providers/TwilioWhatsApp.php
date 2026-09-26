<?php

namespace App\Support\Messaging\Providers;

use App\Enums\TemplateApproval;
use App\Models\MessageTemplate;
use App\Support\Phone;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

/**
 * WhatsApp through Twilio.
 *
 * A Twilio WhatsApp template is a Content resource (`HX…`, stored in
 * `provider_template_id`) with a WhatsApp approval request against it;
 * variables are numbered, so the body is renumbered on submit and values
 * go in `ContentVariables` by position. Twilio signs its callbacks
 * (`X-Twilio-Signature`, HMAC-SHA1 over the URL and the sorted form fields
 * with the auth token), and the status callback URL is given per message.
 */
class TwilioWhatsApp extends Provider
{
    public const API = 'https://api.twilio.com/2010-04-01';

    public const CONTENT = 'https://content.twilio.com/v1';

    protected function name(): string
    {
        return 'Twilio';
    }

    public function configured(): bool
    {
        return $this->allFilled(['whatsapp_twilio_account_sid', 'whatsapp_twilio_auth_token', 'whatsapp_twilio_from']);
    }

    public function send(OutgoingMessage $message): string
    {
        $template = $message->template;

        if (blank($template->provider_template_id)) {
            throw new ProviderException('Twilio sends a template by its Content SID (HX…), and this one has none yet. Sync the approval status on the templates screen.');
        }

        $variables = [];
        foreach ($message->positionalValues() as $i => $value) {
            $variables[(string) ($i + 1)] = $value;
        }

        return $this->message(array_filter([
            'To' => 'whatsapp:'.$message->to,
            'ContentSid' => (string) $template->provider_template_id,
            'ContentVariables' => $variables === [] ? null : (string) json_encode($variables),
            'StatusCallback' => $message->callbackUrl,
        ]));
    }

    public function test(string $to): string
    {
        return $this->message(['To' => 'whatsapp:'.$to, 'Body' => self::TEST_BODY]);
    }

    /** @param  array<string, string>  $form */
    private function message(array $form): string
    {
        $sid = $this->setting('whatsapp_twilio_account_sid');
        $from = Phone::e164($this->setting('whatsapp_twilio_from')) ?? $this->setting('whatsapp_twilio_from');

        $res = $this->call(fn () => $this->client()->asForm()
            ->post(self::API."/Accounts/{$sid}/Messages.json", ['From' => 'whatsapp:'.$from, ...$form]));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Twilio', $res, $this->words($res));
        }

        return (string) $res->json('sid');
    }

    private function client(): PendingRequest
    {
        return Http::withBasicAuth($this->setting('whatsapp_twilio_account_sid'), $this->setting('whatsapp_twilio_auth_token'))
            ->acceptJson()->timeout(self::TIMEOUT);
    }

    public function syncTemplates(): array
    {
        $res = $this->call(fn () => $this->client()->get(self::CONTENT.'/ContentAndApprovals', ['PageSize' => 200]));

        if (! $res->successful()) {
            throw ProviderException::fromResponse('Twilio', $res, $this->words($res));
        }

        return array_values(array_map(function (array $row) {
            $approval = (array) ($row['approval_requests'] ?? []);

            return new SyncedTemplate(
                (string) ($approval['name'] ?? $row['friendly_name'] ?? ''),
                (string) ($row['language'] ?? ''),
                TemplateApproval::fromProvider($approval['status'] ?? 'unsubmitted'),
                filled($approval['rejection_reason'] ?? null) ? (string) $approval['rejection_reason'] : null,
                isset($row['sid']) ? (string) $row['sid'] : null,
            );
        }, array_filter((array) $res->json('contents', []), 'is_array')));
    }

    /**
     * Two calls: the Content resource (immutable, so a fresh one on every
     * submit), then the WhatsApp approval request against it.
     */
    public function submitTemplate(MessageTemplate $template): SyncedTemplate
    {
        $variables = [];
        foreach ($template->placeholderNames() as $i => $name) {
            $variables[(string) ($i + 1)] = $this->sample($name);
        }

        $actions = array_values(array_map(fn (array $b) => match ($b['type'] ?? 'reply') {
            'url' => ['type' => 'URL', 'title' => $b['text'], 'url' => $b['value'] ?? ''],
            'phone' => ['type' => 'PHONE_NUMBER', 'title' => $b['text'], 'phone' => $b['value'] ?? ''],
            default => ['type' => 'QUICK_REPLY', 'title' => $b['text'], 'id' => $b['text']],
        }, (array) ($template->buttons ?? [])));

        $types = $actions === []
            ? ['twilio/text' => ['body' => $template->positionalBody()]]
            : ['twilio/card' => ['title' => $template->positionalBody(), 'actions' => $actions]];

        $content = $this->call(fn () => $this->client()->post(self::CONTENT.'/Content', array_filter([
            'friendly_name' => $template->providerName(),
            'language' => $this->language($template),
            'variables' => $variables ?: null,
            'types' => $types,
        ])));

        if (! $content->successful() || blank($content->json('sid'))) {
            throw ProviderException::fromResponse('Twilio', $content, $this->words($content));
        }

        $sid = (string) $content->json('sid');

        $approval = $this->call(fn () => $this->client()->post(self::CONTENT."/Content/{$sid}/ApprovalRequests/whatsapp", [
            'name' => $template->providerName(),
            'category' => strtoupper((string) ($template->category ?: 'utility')),
        ]));

        if (! $approval->successful()) {
            throw ProviderException::fromResponse('Twilio', $approval, $this->words($approval));
        }

        return new SyncedTemplate(
            $template->providerName(),
            $this->language($template),
            TemplateApproval::fromProvider($approval->json('status') ?? 'pending'),
            filled($approval->json('rejection_reason')) ? (string) $approval->json('rejection_reason') : null,
            $sid,
        );
    }

    /**
     * Twilio's documented scheme: base64 of HMAC-SHA1, keyed with the auth
     * token, over the full URL it called followed by every POST field's name
     * and value in name order.
     */
    public function verifyWebhook(Request $request): bool
    {
        $token = $this->setting('whatsapp_twilio_auth_token');
        $given = (string) $request->header('X-Twilio-Signature', '');

        if ($token === '' || $given === '') {
            return false;
        }

        $fields = $request->request->all();
        ksort($fields);

        $data = $request->getSchemeAndHttpHost().$request->getRequestUri();
        foreach ($fields as $key => $value) {
            $data .= $key.(is_array($value) ? implode('', $value) : (string) $value);
        }

        return hash_equals(base64_encode(hash_hmac('sha1', $data, $token, true)), $given);
    }

    public function webhookEvents(Request $request): array
    {
        $sid = (string) $request->input('MessageSid', '');
        $status = (string) $request->input('MessageStatus', '');
        $body = $request->input('Body');

        if (is_string($body) && ($status === '' || $status === 'received')) {
            $from = (string) preg_replace('/^whatsapp:/', '', (string) $request->input('From', ''));

            return $from !== '' ? [ProviderEvent::inbound($from, $body)] : [];
        }

        $mapped = ProviderEvent::statusFrom($status);

        return $mapped !== null && $sid !== ''
            ? [ProviderEvent::status($sid, $mapped, filled($request->input('ErrorCode')) ? 'Twilio error '.$request->input('ErrorCode') : null)]
            : [];
    }

    private function words(Response $res): ?string
    {
        $message = $res->json('message');

        return is_string($message) ? $message : null;
    }
}
