<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\BroadcastAudience;
use App\Enums\BroadcastStatus;
use App\Enums\MessageChannel;
use App\Enums\MessageDeliveryStatus;
use App\Enums\PublishStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\Admin\MessageBroadcastResource;
use App\Models\MessageBroadcast;
use App\Models\MessageDelivery;
use App\Models\MessageTemplate;
use App\Models\NewsletterGroup;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Support\Messaging\Broadcasts;
use App\Support\Messaging\QuietHours;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Broadcasts — `role:campaign_manager,store_manager`.
 *
 * One template to an audience on one channel, now or at a time. Only a
 * draft is edited; sending freezes the audience and cannot be recalled,
 * which is why the send is refused on every condition that would make it
 * a waste (an unapproved template, a channel switched off, an audience of
 * nobody) rather than letting it run and report zero.
 */
class MessageBroadcastController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $query = MessageBroadcast::query()->with('template')->latest('id');

        if ($status = BroadcastStatus::tryFrom((string) $request->query('status'))) {
            $query->where('status', $status->value);
        }

        return MessageBroadcastResource::collection($query->paginate(min($request->integer('per_page', 25), 100)))
            ->additional(['meta' => self::meta()]);
    }

    public function show(MessageBroadcast $messageBroadcast): JsonResponse
    {
        return response()->json([
            'data' => (new MessageBroadcastResource($messageBroadcast->load('template')))->detail(),
            'meta' => self::meta(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request, null);
        $broadcast = MessageBroadcast::create($data + ['status' => BroadcastStatus::Draft, 'created_by' => $request->user()?->id]);

        return (new MessageBroadcastResource($broadcast->load('template')))->detail()->response()->setStatusCode(201);
    }

    public function update(Request $request, MessageBroadcast $messageBroadcast): JsonResponse
    {
        abort_unless($messageBroadcast->status === BroadcastStatus::Draft, 422, 'Only a draft can be edited. Cancel a scheduled broadcast to change it.');

        $messageBroadcast->update($this->validated($request, $messageBroadcast));

        return response()->json(['data' => (new MessageBroadcastResource($messageBroadcast->load('template')))->detail()]);
    }

    public function destroy(MessageBroadcast $messageBroadcast): JsonResponse
    {
        abort_unless(
            in_array($messageBroadcast->status, [BroadcastStatus::Draft, BroadcastStatus::Cancelled], true),
            422,
            'A broadcast that has been sent — or is scheduled — is kept. Cancel it first.',
        );

        $messageBroadcast->delete();

        return response()->json(null, 204);
    }

    /** Count who a broadcast would reach, for the compose screen before it is saved. */
    public function audience(Request $request): JsonResponse
    {
        $data = $request->validate([
            'channel' => ['required', Rule::enum(MessageChannel::class)],
            'audience' => ['required', Rule::enum(BroadcastAudience::class)],
            'newsletter_group_id' => ['nullable', 'integer'],
            'store_product_id' => ['nullable', 'integer'],
        ]);

        $count = Broadcasts::audience(
            MessageChannel::from($data['channel']),
            BroadcastAudience::from($data['audience']),
            $data['newsletter_group_id'] ?? null,
            $data['store_product_id'] ?? null,
        )->count();

        return response()->json(['data' => ['count' => $count]]);
    }

    /**
     * Send now, or schedule. Scheduling for a time outside the quiet hours
     * is allowed — the batches wait for the window — and the response says
     * when it will actually start.
     */
    public function send(Request $request, MessageBroadcast $messageBroadcast): JsonResponse
    {
        $data = $request->validate(['scheduled_at' => ['nullable', 'date']]);

        abort_unless($messageBroadcast->status === BroadcastStatus::Draft, 422, 'This broadcast has already been sent or scheduled.');

        $template = $messageBroadcast->template;
        $channel = $messageBroadcast->channel;
        $problems = [];

        if ($template === null) {
            $problems[] = 'Choose a template.';
        } elseif ($template->channel !== $channel) {
            $problems[] = 'The template is for another channel.';
        } elseif (! $template->sendable()) {
            $problems[] = 'The template is not approved yet — WhatsApp sends only approved templates.';
        }

        if (! $channel->ready()) {
            $problems[] = "{$channel->label()} is not configured. An administrator sets it up in Messaging → Settings.";
        }

        if (Broadcasts::audienceFor($messageBroadcast)->count() === 0) {
            $problems[] = 'Nobody in that audience has opted in on this channel.';
        }

        if ($problems !== []) {
            throw ValidationException::withMessages(['send' => $problems]);
        }

        $at = filled($data['scheduled_at'] ?? null) ? Carbon::parse($data['scheduled_at']) : null;

        if ($at !== null && $at->isFuture()) {
            $messageBroadcast->update(['status' => BroadcastStatus::Scheduled, 'scheduled_at' => $at]);

            return response()->json(['data' => (new MessageBroadcastResource($messageBroadcast->load('template')))->detail(), 'starts_at' => QuietHours::nextOpening($at)->toIso8601String()]);
        }

        Broadcasts::queue($messageBroadcast);

        return response()->json(['data' => (new MessageBroadcastResource($messageBroadcast->refresh()->load('template')))->detail(), 'starts_at' => QuietHours::nextOpening()->toIso8601String()]);
    }

    /**
     * Stop it: a scheduled broadcast goes back to nothing; a sending one
     * stops where it is, every message not yet sent marked skipped.
     */
    public function cancel(MessageBroadcast $messageBroadcast): JsonResponse
    {
        abort_unless(
            in_array($messageBroadcast->status, [BroadcastStatus::Scheduled, BroadcastStatus::Sending], true),
            422,
            'Only a scheduled or sending broadcast can be cancelled.',
        );

        $messageBroadcast->update(['status' => BroadcastStatus::Cancelled, 'completed_at' => now()]);

        MessageDelivery::query()->where('message_broadcast_id', $messageBroadcast->id)
            ->where('status', MessageDeliveryStatus::Pending->value)
            ->update(['status' => MessageDeliveryStatus::Skipped->value, 'error' => 'The broadcast was cancelled.', 'updated_at' => now()]);

        return response()->json(['data' => (new MessageBroadcastResource($messageBroadcast->load('template')))->detail()]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?MessageBroadcast $broadcast): array
    {
        $sometimes = $broadcast ? 'sometimes' : 'required';

        $data = $request->validate([
            'name' => [$sometimes, 'string', 'max:160'],
            'channel' => [$sometimes, Rule::enum(MessageChannel::class)],
            'message_template_id' => ['nullable', 'integer', 'exists:message_templates,id'],
            'audience' => [$sometimes, Rule::enum(BroadcastAudience::class)],
            'newsletter_group_id' => ['nullable', 'integer', 'exists:newsletter_groups,id'],
            'store_product_id' => ['nullable', 'integer'],
        ]);

        $channel = MessageChannel::tryFrom((string) ($data['channel'] ?? $broadcast?->channel->value));
        $audience = BroadcastAudience::tryFrom((string) ($data['audience'] ?? $broadcast?->audience->value));
        $templateId = array_key_exists('message_template_id', $data) ? $data['message_template_id'] : $broadcast?->message_template_id;

        if ($templateId !== null && $channel !== null
            && MessageTemplate::query()->whereKey($templateId)->toBase()->value('channel') !== $channel->value) {
            throw ValidationException::withMessages(['message_template_id' => 'That template is for another channel.']);
        }

        if ($audience === BroadcastAudience::NewsletterGroup && blank($data['newsletter_group_id'] ?? $broadcast?->newsletter_group_id)) {
            throw ValidationException::withMessages(['newsletter_group_id' => 'Choose the newsletter group.']);
        }

        if ($audience === BroadcastAudience::Wishlist && blank($data['store_product_id'] ?? $broadcast?->store_product_id)) {
            throw ValidationException::withMessages(['store_product_id' => 'Choose the product.']);
        }

        // Only the field the audience reads is kept, so a switch of source
        // does not leave a stale group id pointing somewhere.
        if ($audience !== null) {
            if ($audience !== BroadcastAudience::NewsletterGroup) {
                $data['newsletter_group_id'] = null;
            }
            if ($audience !== BroadcastAudience::Wishlist) {
                $data['store_product_id'] = null;
            }
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private static function meta(): array
    {
        return [
            'channels' => array_map(fn (MessageChannel $c) => ['value' => $c->value, 'label' => $c->label(), 'ready' => $c->ready()], MessageChannel::cases()),
            'audiences' => BroadcastAudience::options(),
            'statuses' => BroadcastStatus::options(),
            'wishlists' => Schema::hasTable('wishlist_items'),
            'groups' => NewsletterGroup::query()->orderBy('name')->get(['id', 'name'])->map(fn ($g) => ['id' => $g->id, 'name' => $g->name])->all(),
            'products' => StoreProduct::query()->where('status', PublishStatus::Published->value)->orderBy('name')->limit(500)
                ->get(['id', 'name'])->map(fn ($p) => ['id' => $p->id, 'name' => $p->name])->all(),
            'templates' => MessageTemplate::query()->orderBy('name')->get()->map(fn (MessageTemplate $t) => [
                'id' => $t->id, 'channel' => $t->channel->value, 'name' => $t->name, 'sendable' => $t->sendable(),
                'approval_label' => $t->approval_status->label(),
            ])->all(),
            'quiet_hours' => [
                'start' => (string) Setting::get('messaging_promo_start', QuietHours::DEFAULT_START),
                'end' => (string) Setting::get('messaging_promo_end', QuietHours::DEFAULT_END),
                'open_now' => QuietHours::allows(), 'next_opening' => QuietHours::nextOpening()->toIso8601String()],
        ];
    }
}
