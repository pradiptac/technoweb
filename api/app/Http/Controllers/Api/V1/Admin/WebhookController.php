<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\WebhookEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWebhookRequest;
use App\Http\Requests\UpdateWebhookRequest;
use App\Http\Resources\Admin\WebhookDeliveryResource;
use App\Http\Resources\Admin\WebhookResource;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Support\Mail\MailBrand;
use App\Support\Webhooks\Webhooks;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Outgoing webhooks. Behind auth:sanctum + role:admin.
 *
 * `role:admin` rather than any narrower role: a hook receives every lead's
 * telephone number, every order's address and every ticket's text, signed,
 * at a URL somebody typed. Deciding where that goes is the same class of
 * decision as the SMTP settings beside it.
 *
 * Two things this controller is careful about. **The secret leaves once.**
 * It is added beside the resource on the 201 that created it and on the
 * PATCH that rotated it, and on no other response — the resource itself
 * never carries it, so there is no list or edit screen to leak it through.
 * And **a delivery is scoped to its hook**: `{delivery}` under `{webhook}`
 * answers 404 for a row that belongs to another hook, because a 403 would
 * confirm the row exists.
 */
class WebhookController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $hooks = Webhook::query()
            ->with('creator')
            ->withCount('deliveries')
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('name')
            ->paginate(min($request->integer('per_page', 40), 100))
            ->withQueryString();

        // The options ride on the index so the console's *new* screen has
        // them without a record to read them from — `/admin/menus/new`'s rule.
        return WebhookResource::collection($hooks)->additional([
            'meta' => ['events' => WebhookEvent::options()],
        ]);
    }

    public function show(Webhook $webhook): JsonResource
    {
        return new WebhookResource($webhook->load('creator')->loadCount('deliveries'));
    }

    public function store(StoreWebhookRequest $request): JsonResponse
    {
        $data = $request->validated();
        $secret = Webhook::mintSecret();

        $hook = Webhook::create([
            'name' => $data['name'],
            'url' => trim($data['url']),
            'secret' => $secret,
            'events' => $request->validatedEvents(),
            'is_active' => $data['is_active'] ?? true,
            'created_by' => $request->user()?->id,
        ]);

        // The secret travels back exactly once, on this response. It is
        // encrypted in the database and no resource ever reads it out again,
        // which is why the console has to show it immediately.
        return response()->json([
            'data' => (new WebhookResource($hook->load('creator')))->toArray($request)
                + ['secret' => $secret],
        ], 201);
    }

    public function update(UpdateWebhookRequest $request, Webhook $webhook): JsonResponse
    {
        $data = $request->validated();

        $webhook->fill(array_intersect_key($data, array_flip(['name', 'is_active'])));

        if (array_key_exists('url', $data)) {
            $webhook->url = trim($data['url']);
        }

        if (array_key_exists('events', $data)) {
            $webhook->events = $request->validatedEvents();
        }

        $secret = null;

        if ($request->boolean('rotate_secret')) {
            $secret = Webhook::mintSecret();
            $webhook->secret = $secret;
            // A fresh secret means the last failure, if it was a signature
            // mismatch at their end, is no longer news about this hook.
            $webhook->last_error = null;
        }

        $webhook->save();

        $payload = (new WebhookResource($webhook->fresh(['creator'])->loadCount('deliveries')))->toArray($request);

        if ($secret !== null) {
            $payload['secret'] = $secret;
        }

        return response()->json(['data' => $payload]);
    }

    public function destroy(Webhook $webhook): JsonResponse
    {
        // The deliveries cascade with it: a log of attempts against a hook
        // that no longer exists is nobody's to read.
        $webhook->delete();

        return response()->json(['message' => 'Webhook deleted.']);
    }

    /**
     * Prove the endpoint: one `ping` to this hook, subscribed or not.
     *
     * Accepted with 202 and the delivery id, because the send is a queued job
     * and its answer arrives on the delivery row rather than here.
     */
    public function ping(Request $request, Webhook $webhook): JsonResponse
    {
        $delivery = Webhooks::deliverTo($webhook, WebhookEvent::Ping, [
            'message' => 'Hello from '.MailBrand::name().'. If you can read this, the endpoint and the secret are right.',
            'webhook' => ['id' => $webhook->id, 'name' => $webhook->name],
            'sent_by' => $request->user()?->name,
            'sent_at' => now()->toIso8601String(),
        ]);

        return response()->json(['data' => ['delivery_id' => $delivery->id]], 202);
    }

    public function deliveries(Request $request, Webhook $webhook): AnonymousResourceCollection
    {
        $rows = $webhook->deliveries()
            ->when(
                in_array($request->string('status')->value(), WebhookDelivery::STATUSES, true),
                fn ($q) => $q->where('status', $request->string('status')->value()),
            )
            ->orderByDesc('id')
            ->paginate(min($request->integer('per_page', 25), 100))
            ->withQueryString();

        return WebhookDeliveryResource::collection($rows)->additional([
            'meta' => ['statuses' => WebhookDelivery::STATUSES],
        ]);
    }

    public function delivery(Webhook $webhook, WebhookDelivery $delivery): JsonResource
    {
        $this->belongs($webhook, $delivery);

        return (new WebhookDeliveryResource($delivery))->withPayload();
    }

    /**
     * Send it again: a fresh row carrying the same payload, dispatched now.
     *
     * A new row rather than the old one re-queued, so the log keeps what
     * happened the first time and the receiver sees a new delivery id — a
     * receiver that dedupes on the id would otherwise drop the resend as a
     * duplicate of the delivery it never got.
     */
    public function redeliver(Webhook $webhook, WebhookDelivery $delivery): JsonResponse
    {
        $this->belongs($webhook, $delivery);

        $event = $delivery->event() ?? WebhookEvent::Ping;

        $fresh = Webhooks::deliverTo($webhook, $event, (array) $delivery->payload);

        return (new WebhookDeliveryResource($fresh))->response()->setStatusCode(202);
    }

    private function belongs(Webhook $webhook, WebhookDelivery $delivery): void
    {
        abort_if($delivery->webhook_id !== $webhook->id, 404);
    }
}
