<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\MessageChannel;
use App\Enums\MessageEvent;
use App\Enums\TemplateApproval;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MessageTemplateResource;
use App\Models\Media;
use App\Models\MessageTemplate;
use App\Models\Setting;
use App\Support\Messaging\Contacts;
use App\Support\Messaging\Providers\OutgoingMessage;
use App\Support\Messaging\Providers\ProviderException;
use App\Support\Messaging\Samples;
use App\Support\Messaging\TemplateSync;
use App\Support\Phone;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Channel templates — `role:campaign_manager,store_manager`.
 *
 * What is said on WhatsApp, RCS and push, with the placeholders the events
 * offer. A WhatsApp template goes to the provider for approval and waits
 * there; editing what Meta approved puts it back to "not submitted",
 * because the approved copy at Meta is the old wording and a send against
 * it would say something the console no longer shows.
 */
class MessageTemplateController extends Controller
{
    /** The fields whose change means a WhatsApp template must be approved again. */
    private const REVIEWED = ['body', 'header_text', 'buttons', 'category', 'language', 'media_path'];

    public function index(Request $request): AnonymousResourceCollection
    {
        $query = MessageTemplate::query()->orderBy('channel')->orderBy('name');

        if ($channel = MessageChannel::tryFrom((string) $request->query('channel'))) {
            $query->where('channel', $channel->value);
        }

        if (filled($q = $request->query('q'))) {
            $query->where(fn ($w) => $w->where('name', 'like', '%'.$q.'%')->orWhere('key', 'like', '%'.$q.'%'));
        }

        return MessageTemplateResource::collection($query->paginate(min($request->integer('per_page', 50), 100)))
            ->additional(['meta' => self::meta()]);
    }

    public function show(MessageTemplate $messageTemplate): JsonResponse
    {
        return response()->json(['data' => new MessageTemplateResource($messageTemplate), 'meta' => self::meta()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $channel = MessageChannel::from($data['channel']);

        $template = MessageTemplate::create($data + [
            'approval_status' => $channel->needsApproval() ? TemplateApproval::Draft : TemplateApproval::NotRequired,
        ]);

        return (new MessageTemplateResource($template))->response()->setStatusCode(201);
    }

    public function update(Request $request, MessageTemplate $messageTemplate): MessageTemplateResource
    {
        $data = $this->validated($request, $messageTemplate);
        $messageTemplate->fill($data);

        if ($messageTemplate->channel->needsApproval() && $messageTemplate->isDirty(self::REVIEWED)
            && $messageTemplate->approval_status !== TemplateApproval::Draft) {
            $messageTemplate->approval_status = TemplateApproval::Draft;
            $messageTemplate->approval_reason = 'Edited since it was submitted — submit it again.';
        }

        $messageTemplate->save();

        return new MessageTemplateResource($messageTemplate);
    }

    public function destroy(MessageTemplate $messageTemplate): JsonResponse
    {
        // Automations pointing at it fall back to no template (nullOnDelete),
        // which sends nothing — the table then shows the row as empty.
        $messageTemplate->delete();

        return response()->json(null, 204);
    }

    /** Submit a WhatsApp template to the provider for review. */
    public function submit(MessageTemplate $messageTemplate): JsonResponse
    {
        try {
            TemplateSync::submit($messageTemplate);
        } catch (ProviderException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => new MessageTemplateResource($messageTemplate->refresh())]);
    }

    /** Read every template's approval back from the provider. */
    public function sync(Request $request): JsonResponse
    {
        $data = $request->validate(['channel' => ['required', Rule::enum(MessageChannel::class)]]);

        try {
            $result = TemplateSync::run(MessageChannel::from($data['channel']));
        } catch (ProviderException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => $result]);
    }

    /**
     * Send this template, filled with sample values, to one address the
     * person typed. Throttled. The address is not logged: a push token is
     * a credential for that browser.
     */
    public function test(Request $request, MessageTemplate $messageTemplate): JsonResponse
    {
        $data = $request->validate(['to' => ['required', 'string', 'max:500']]);
        $channel = $messageTemplate->channel;
        $to = Contacts::normalise($channel, $data['to']);

        if ($to === null) {
            throw ValidationException::withMessages(['to' => $channel->addressKind() === 'phone'
                ? 'Give a mobile number — ten digits, or with its country code after a +.'
                : 'Paste a push registration token from a browser that allowed notifications.']);
        }

        $provider = $channel->current();

        if ($provider === null || ! $provider->client()->configured()) {
            return response()->json(['message' => "{$channel->label()} has no provider configured. An administrator sets one in Messaging → Settings."], 422);
        }

        $vars = [];
        foreach (array_unique([...MessageEvent::OrderPlaced->placeholders(), ...$messageTemplate->placeholderNames()]) as $name) {
            $vars[$name] = self::sample($name);
        }

        try {
            $id = $provider->client()->send(new OutgoingMessage($to, $messageTemplate, $vars));
        } catch (ProviderException $e) {
            if ($e->config) {
                Setting::put($channel->errorKey(), $e->getMessage().' ('.now()->toDayDateTimeString().')');
            }

            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['data' => ['sent_to' => $channel->addressKind() === 'phone' ? $to : 'this browser', 'id' => $id]]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?MessageTemplate $template): array
    {
        $channelValue = $template?->channel->value ?? (string) $request->input('channel');

        $data = $request->validate([
            'channel' => [$template ? 'prohibited' : 'required', Rule::enum(MessageChannel::class)],
            'key' => [$template ? 'sometimes' : 'required', 'string', 'regex:/^[a-z][a-z0-9_]{1,79}$/',
                Rule::unique('message_templates', 'key')->where('channel', $channelValue)->ignore($template?->id)],
            'name' => [$template ? 'sometimes' : 'required', 'string', 'max:160'],
            'body' => [$template ? 'sometimes' : 'required', 'string', 'max:1024'],
            'header_text' => ['nullable', 'string', 'max:60'],
            'media_path' => ['nullable', 'string', 'max:500'],
            'buttons' => ['nullable', 'array', 'max:3'],
            'buttons.*.type' => ['required', Rule::in(['reply', 'url', 'phone'])],
            'buttons.*.text' => ['required', 'string', 'max:25'],
            'buttons.*.value' => ['nullable', 'string', 'max:500'],
            'push_title' => ['nullable', 'string', 'max:120'],
            'push_link' => ['nullable', 'string', 'max:500'],
            'category' => ['nullable', Rule::in(MessageTemplate::CATEGORIES)],
            'language' => ['nullable', 'string', 'regex:/^[a-z]{2}(_[A-Z]{2})?$/'],
            'provider_template_name' => ['nullable', 'string', 'max:160', 'regex:/^[A-Za-z0-9_\-]+$/'],
            'provider_template_id' => ['nullable', 'string', 'max:160'],
        ], [
            'key.regex' => 'Lower-case letters, digits and underscores, starting with a letter — WhatsApp names a template the same way.',
            'language.regex' => 'A language code such as en, hi or en_US.',
        ]);

        if (filled($data['media_path'] ?? null) && ! Media::query()->where('path', $data['media_path'])->exists()) {
            throw ValidationException::withMessages(['media_path' => 'Choose a picture from the media library.']);
        }

        if (filled($data['push_link'] ?? null) && ! preg_match('#^(/|https://)#', (string) $data['push_link'])) {
            throw ValidationException::withMessages(['push_link' => 'A path on this site, such as /store, or an https:// address.']);
        }

        foreach ((array) ($data['buttons'] ?? []) as $i => $button) {
            $value = trim((string) ($button['value'] ?? ''));

            if ($button['type'] === 'url' && ! preg_match('#^https://[^\s]+$#', $value)) {
                throw ValidationException::withMessages(["buttons.{$i}.value" => 'A link button needs an https:// address.']);
            }

            if ($button['type'] === 'phone' && Phone::e164($value) === null) {
                throw ValidationException::withMessages(["buttons.{$i}.value" => 'A call button needs a phone number.']);
            }

            $data['buttons'][$i] = ['type' => $button['type'], 'text' => trim((string) $button['text']), 'value' => $button['type'] === 'phone' ? Phone::e164($value) : $value];
        }

        if (array_key_exists('buttons', $data)) {
            $data['buttons'] = array_values((array) $data['buttons']) ?: null;
        }

        if (($template->channel ?? MessageChannel::tryFrom($channelValue))?->needsApproval()) {
            $data['category'] = $data['category'] ?? $template->category ?? 'utility';
        }

        return $data;
    }

    /** @return array<string, mixed> */
    public static function meta(): array
    {
        return [
            'channels' => array_map(fn (MessageChannel $c) => [
                'value' => $c->value,
                'label' => $c->label(),
                'needs_approval' => $c->needsApproval(),
                'ready' => $c->ready(),
                'provider' => $c->current()?->label(),
            ], MessageChannel::cases()),
            'events' => array_map(fn (MessageEvent $e) => [
                'value' => $e->value,
                'label' => $e->label(),
                'promotional' => $e->promotional(),
                'placeholders' => $e->placeholders(),
            ], MessageEvent::cases()),
            'common_placeholders' => ['customer_name', 'first_name', 'site_name'],
            'samples' => collect(MessageEvent::cases())->flatMap(fn (MessageEvent $e) => $e->placeholders())
                ->merge(['customer_name', 'first_name', 'site_name'])->unique()
                ->mapWithKeys(fn (string $n) => [$n => self::sample($n)])->all(),
            'categories' => MessageTemplate::CATEGORIES,
            'approvals' => TemplateApproval::options(),
        ];
    }

    public static function sample(string $name): string
    {
        return Samples::value($name);
    }
}
