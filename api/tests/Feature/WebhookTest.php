<?php

namespace Tests\Feature;

use App\Console\Commands\PruneWebhookDeliveries;
use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Enums\WebhookEvent;
use App\Jobs\DeliverWebhook;
use App\Models\Activity;
use App\Models\Customer;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Support\Webhooks\Webhooks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use RuntimeException;
use Tests\TestCase;

/**
 * Outgoing webhooks.
 *
 * Four properties matter more than the CRUD, and each has a test that would
 * fail if the rule were quietly dropped:
 *
 *   1. **A webhook never fails the request that caused it.** `emit()` is
 *      guarded like `Notifier`; the ticket is committed whatever happens to
 *      the announcement of it.
 *   2. **The bytes signed are the bytes sent.** The receiver verifies over
 *      `timestamp.body` with the stored secret, and that has to hold for the
 *      exact string on the wire.
 *   3. **The secret leaves once.** On the 201, on a rotate, and on no read —
 *      and never into the activity log.
 *   4. **This server cannot be pointed at itself.** `http://` and any
 *      private or loopback host are refused on write.
 */
class WebhookTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Ada Admin', 'email' => 'ada@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $user->load('roles');
    }

    private function support(): User
    {
        $user = User::create([
            'name' => 'Support Engineer', 'email' => 'engineer@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value], ['name' => RoleEnum::SupportEngineer->label()],
        ));

        return $user->load('roles');
    }

    /** @param  array<int, string>  $events */
    private function hook(array $events = ['ticket.created'], bool $active = true, string $secret = 'whsec_test'): Webhook
    {
        return Webhook::create([
            'name' => 'CRM', 'url' => 'https://crm.example.com/hooks/technoware',
            'secret' => $secret, 'events' => $events, 'is_active' => $active,
        ]);
    }

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => $email,
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(?Customer $customer = null): Ticket
    {
        $customer ??= $this->customer();
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        return Ticket::create([
            'customer_id' => $customer->id,
            'ticket_category_id' => $category->id,
            'subject' => 'A switch keeps rebooting',
            'description' => 'It drops every device on it twice a day.',
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
    }

    private function order(array $attributes = []): Order
    {
        return Order::create(array_merge([
            'status' => OrderStatus::PendingPayment,
            'payment_method' => 'razorpay',
            'subtotal_paise' => 1180000, 'discount_paise' => 0,
            'taxable_paise' => 1000000, 'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(),
        ], $attributes));
    }

    private function delivery(Webhook $hook, string $event = 'ping', array $payload = ['message' => 'hello']): WebhookDelivery
    {
        return $hook->deliveries()->create(['event' => $event, 'payload' => $payload]);
    }

    /* ------------------------------------------------------------- emitting */

    public function test_emit_writes_one_delivery_per_active_subscribed_hook(): void
    {
        Queue::fake();

        $subscribed = $this->hook(['ticket.created', 'lead.created']);
        $this->hook(['order.placed']);                       // subscribed to something else
        $this->hook(['ticket.created'], active: false);      // switched off

        Webhooks::emit(WebhookEvent::TicketCreated, ['id' => 1]);

        $this->assertSame(1, WebhookDelivery::count());
        $delivery = WebhookDelivery::sole();
        $this->assertSame($subscribed->id, $delivery->webhook_id);
        $this->assertSame('ticket.created', $delivery->event);
        $this->assertSame('pending', $delivery->status);
        $this->assertSame(['id' => 1], $delivery->payload);

        Queue::assertPushed(DeliverWebhook::class, fn (DeliverWebhook $job) => $job->deliveryId === $delivery->id);
        Queue::assertPushed(DeliverWebhook::class, 1);
    }

    /**
     * The payload is built only when somebody is listening, and inside the
     * guard when it is. A closure that throws is the honest stand-in for a
     * resource that cannot read the record — which happened, on a subscriber
     * created without a status — and it must cost the caller nothing.
     */
    public function test_the_payload_is_built_lazily_and_inside_the_guard(): void
    {
        Queue::fake();
        Log::spy();

        // Nobody subscribed: the closure is never called.
        Webhooks::emit(WebhookEvent::TicketCreated, function () {
            throw new RuntimeException('should not have been built');
        });
        Log::shouldNotHaveReceived('warning');

        $this->hook(['ticket.created']);

        Webhooks::emit(WebhookEvent::TicketCreated, function () {
            throw new RuntimeException('the resource could not read the record');
        });

        $this->assertSame(0, WebhookDelivery::count());
        Log::shouldHaveReceived('warning')->withArgs(
            fn ($message, $context = []) => $message === 'Webhook could not be queued'
                && str_contains((string) ($context['error'] ?? ''), 'could not read'),
        )->once();
    }

    /**
     * A row created without a column the database defaults — `NewsletterTest`
     * makes subscribers with no `status` — must still announce itself, with
     * the stored value rather than the null in memory.
     */
    public function test_a_subscriber_created_with_defaults_is_announced_with_the_stored_values(): void
    {
        Queue::fake();
        $this->hook(['subscriber.joined']);

        NewsletterSubscriber::create(['email' => 'priya@example.test', 'source' => 'manual']);

        $delivery = WebhookDelivery::where('event', 'subscriber.joined')->sole();
        $this->assertSame('priya@example.test', $delivery->payload['email']);
        $this->assertSame('active', $delivery->payload['status']);
        $this->assertSame('unverified', $delivery->payload['verification']);
    }

    /**
     * The guard. The delivery row cannot be written; the caller's request
     * still answers 201, and the failure is a warning in the log rather than
     * an exception — the same rule `Notifier` keeps for mail.
     */
    public function test_emit_never_throws_and_the_request_that_caused_it_still_succeeds(): void
    {
        Queue::fake();
        $this->hook(['ticket.created']);

        Event::listen('eloquent.creating: '.WebhookDelivery::class, function () {
            throw new RuntimeException('the webhook table is unavailable');
        });

        // A spy, not a mock: the request logs other warnings of its own (no
        // support address is configured here), and only this one is the claim.
        Log::spy();

        $category = TicketCategory::create(['name' => 'Network', 'slug' => 'network', 'is_active' => true]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'A switch is down',
                'description' => 'The core switch in the server room is unreachable.',
                'ticket_category_id' => $category->id,
                'priority' => 'high',
            ])
            ->assertCreated();

        $this->assertSame(1, Ticket::count());
        $this->assertSame(0, WebhookDelivery::count());
        Queue::assertNotPushed(DeliverWebhook::class);

        Log::shouldHaveReceived('warning')->withArgs(
            fn ($message, $context = []) => $message === 'Webhook could not be queued'
                && ($context['event'] ?? null) === 'ticket.created'
                && str_contains((string) ($context['error'] ?? ''), 'unavailable'),
        )->once();
    }

    /* ---------------------------------------------------------- the model hooks */

    public function test_a_ticket_being_opened_emits_ticket_created_with_the_resource_shape(): void
    {
        Queue::fake();
        $this->hook(['ticket.created']);

        $ticket = $this->ticket();

        $delivery = WebhookDelivery::where('event', 'ticket.created')->sole();
        $this->assertSame($ticket->reference, $delivery->payload['reference']);
        // The detail read's fields, not the list row's: the description is the ticket.
        $this->assertSame('It drops every device on it twice a day.', $delivery->payload['description']);
        $this->assertSame('neil@example.test', $delivery->payload['customer']['email']);
        // `CustomerResource`, never the admin one: no judgement about the person travels.
        $this->assertArrayNotHasKey('status_note', $delivery->payload['customer']);
    }

    public function test_an_internal_note_emits_nothing_and_a_reply_emits_ticket_replied(): void
    {
        Queue::fake();
        $this->hook(['ticket.replied']);
        $ticket = $this->ticket();
        $staff = $this->support();

        $note = $ticket->messages()->make(['body' => 'Customer is difficult.', 'is_internal' => true]);
        $note->author()->associate($staff);
        $note->save();

        $this->assertSame(0, WebhookDelivery::count());

        $reply = $ticket->messages()->make(['body' => 'We will check and update you.', 'is_internal' => false]);
        $reply->author()->associate($staff);
        $reply->save();

        $delivery = WebhookDelivery::where('event', 'ticket.replied')->sole();
        $this->assertSame($ticket->reference, $delivery->payload['reference']);
        $this->assertSame('We will check and update you.', $delivery->payload['message']['body']);
        $this->assertSame('staff', $delivery->payload['message']['author']['type']);
        $this->assertSame($reply->id, $delivery->payload['message']['id']);
    }

    public function test_a_status_change_emits_ticket_status_changed_with_from_and_to(): void
    {
        Queue::fake();
        $this->hook(['ticket.status_changed']);
        $ticket = $this->ticket();

        // A save that changes something else is not a status change.
        $ticket->update(['subject' => 'A switch keeps rebooting — urgent']);
        $this->assertSame(0, WebhookDelivery::count());

        $ticket->update(['status' => TicketStatus::InProgress]);

        $delivery = WebhookDelivery::where('event', 'ticket.status_changed')->sole();
        $this->assertSame('open', $delivery->payload['from']);
        $this->assertSame('in_progress', $delivery->payload['to']);
        $this->assertSame('in_progress', $delivery->payload['status']);
    }

    public function test_placing_an_order_emits_order_placed_with_its_lines(): void
    {
        Queue::fake();
        $this->hook(['order.placed']);

        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'type' => ProductType::Physical,
            'status' => PublishStatus::Published, 'price_paise' => 1180000, 'track_stock' => true, 'stock' => 5,
        ]);
        $token = $this->postJson('/api/v1/cart/items', ['product_id' => $product->id, 'quantity' => 2])
            ->assertCreated()->json('data.token');

        $this->withHeaders(['X-Cart-Token' => $token])->postJson('/api/v1/checkout', [
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'phone' => '+91 98765 43210',
            'address' => ['line1' => '12 Example Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
        ])->assertCreated();

        $delivery = WebhookDelivery::where('event', 'order.placed')->sole();
        $this->assertSame(2360000, $delivery->payload['total_paise']);
        // The lines are in it, which is why this is emitted after they are written and not on `created`.
        $this->assertCount(1, $delivery->payload['items']);
        $this->assertSame(2, $delivery->payload['items'][0]['quantity']);
        // The detail read's address, and never the customer's magic link.
        $this->assertSame('Kolkata', $delivery->payload['billing_address']['city']);
        $this->assertArrayNotHasKey('access_token', $delivery->payload);
        // Dispatched after the checkout's transaction committed.
        Queue::assertPushed(DeliverWebhook::class, 1);
    }

    public function test_paid_at_being_set_emits_order_paid_once_and_a_status_move_emits_status_changed(): void
    {
        Queue::fake();
        $this->hook(['order.paid', 'order.status_changed']);
        $order = $this->order();

        $order->moveTo(OrderStatus::Paid);

        $this->assertSame(1, WebhookDelivery::where('event', 'order.paid')->count());
        $changed = WebhookDelivery::where('event', 'order.status_changed')->sole();
        $this->assertSame('pending_payment', $changed->payload['from']);
        $this->assertSame('paid', $changed->payload['to']);

        // paid_at is set once and never cleared; a later save is not a second payment.
        $order->moveTo(OrderStatus::Dispatched);
        $this->assertSame(1, WebhookDelivery::where('event', 'order.paid')->count());
        $this->assertSame(2, WebhookDelivery::where('event', 'order.status_changed')->count());
    }

    /* -------------------------------------------------------------- the job */

    public function test_the_job_sends_the_envelope_with_the_four_headers_and_a_verifiable_signature(): void
    {
        Http::fake(['crm.example.com/*' => Http::response('ok', 200)]);
        $hook = $this->hook(secret: 'whsec_abc');
        $delivery = $this->delivery($hook, 'ticket.created', ['reference' => 'TW-2026-00001']);

        (new DeliverWebhook($delivery->id))->handle();

        Http::assertSent(function (ClientRequest $request) use ($delivery) {
            $body = $request->body();
            $timestamp = (int) $request->header('X-Technoware-Timestamp')[0];

            $this->assertSame('https://crm.example.com/hooks/technoware', $request->url());
            $this->assertSame('application/json', $request->header('Content-Type')[0]);
            $this->assertSame('Technoware-Webhooks/1.0', $request->header('User-Agent')[0]);
            $this->assertSame('ticket.created', $request->header('X-Technoware-Event')[0]);
            $this->assertSame((string) $delivery->id, $request->header('X-Technoware-Delivery')[0]);
            $this->assertEqualsWithDelta(time(), $timestamp, 300);

            // The receiver's own check: HMAC over `timestamp.body` with the stored secret.
            $expected = 'sha256='.hash_hmac('sha256', $timestamp.'.'.$body, 'whsec_abc');
            $this->assertSame($expected, $request->header('X-Technoware-Signature')[0]);

            $decoded = json_decode($body, true);
            $this->assertSame($delivery->id, $decoded['id']);
            $this->assertSame('ticket.created', $decoded['event']);
            $this->assertSame(['reference' => 'TW-2026-00001'], $decoded['data']);
            $this->assertArrayHasKey('created_at', $decoded);

            return true;
        });

        $delivery->refresh();
        $this->assertSame('delivered', $delivery->status);
        $this->assertSame(200, $delivery->response_status);
        $this->assertSame(1, $delivery->attempts);
        $this->assertNotNull($delivery->delivered_at);
        $this->assertNotNull($hook->fresh()->last_delivered_at);
    }

    public function test_a_500_records_the_excerpt_and_throws_so_the_queue_retries(): void
    {
        Http::fake(['crm.example.com/*' => Http::response(str_repeat('x', 600), 500)]);
        $hook = $this->hook();
        $delivery = $this->delivery($hook);

        try {
            (new DeliverWebhook($delivery->id))->handle();
            $this->fail('A 500 should be thrown for the queue to retry.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('answered 500', $e->getMessage());
        }

        $delivery->refresh();
        $this->assertSame('pending', $delivery->status);
        $this->assertSame(1, $delivery->attempts);
        $this->assertSame(500, $delivery->response_status);
        $this->assertSame(500, mb_strlen($delivery->response_excerpt));
        $this->assertEqualsWithDelta(now()->addSeconds(60)->timestamp, $delivery->next_attempt_at->timestamp, 5);
        $this->assertNull($hook->fresh()->last_error);
    }

    public function test_a_connection_error_is_recorded_without_a_status_and_rethrown(): void
    {
        Http::fake(fn () => throw new ConnectionException('cURL error 7: Failed to connect'));
        $delivery = $this->delivery($this->hook());

        $this->expectException(ConnectionException::class);

        try {
            (new DeliverWebhook($delivery->id))->handle();
        } finally {
            $delivery->refresh();
            $this->assertNull($delivery->response_status);
            $this->assertStringContainsString('Failed to connect', $delivery->response_excerpt);
        }
    }

    public function test_failed_marks_the_delivery_and_writes_the_servers_words_on_the_hook(): void
    {
        $hook = $this->hook();
        $delivery = $this->delivery($hook, 'order.paid');

        (new DeliverWebhook($delivery->id))->failed(new RuntimeException('https://crm.example.com/hooks/technoware answered 503.'));

        $this->assertSame('failed', $delivery->fresh()->status);
        $this->assertNull($delivery->fresh()->next_attempt_at);
        $this->assertSame('order.paid: https://crm.example.com/hooks/technoware answered 503.', $hook->fresh()->last_error);
    }

    public function test_a_hook_switched_off_between_attempts_is_not_sent_to(): void
    {
        Http::fake();
        $hook = $this->hook(active: false);
        $delivery = $this->delivery($hook);

        (new DeliverWebhook($delivery->id))->handle();

        Http::assertNothingSent();
        $this->assertSame('failed', $delivery->fresh()->status);
        $this->assertStringContainsString('switched off', $delivery->fresh()->response_excerpt);
    }

    public function test_a_delivered_row_is_not_sent_twice(): void
    {
        Http::fake();
        $delivery = $this->delivery($this->hook());
        $delivery->forceFill(['status' => 'delivered', 'delivered_at' => now()])->save();

        (new DeliverWebhook($delivery->id))->handle();

        Http::assertNothingSent();
    }

    /* ---------------------------------------------------------- the console */

    public function test_the_secret_is_on_the_201_and_on_no_later_read_nor_in_the_activity_log(): void
    {
        Queue::fake();
        $admin = $this->admin();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/webhooks', [
                'name' => 'CRM', 'url' => 'https://crm.example.com/hooks',
                'events' => ['ticket.created', 'lead.created', 'ticket.created'],
            ])
            ->assertCreated()
            ->assertJsonPath('data.name', 'CRM')
            ->assertJsonPath('data.is_active', true)
            ->assertJsonPath('data.has_secret', true)
            // Duplicate ticks collapsed, in the enum's order.
            ->assertJsonPath('data.events', ['lead.created', 'ticket.created']);

        $secret = $response->json('data.secret');
        $this->assertIsString($secret);
        $this->assertStringStartsWith('whsec_', $secret);
        $id = $response->json('data.id');

        // Encrypted at rest: the column does not hold the secret in clear.
        $this->assertNotSame($secret, DB::table('webhooks')->where('id', $id)->value('secret'));
        $this->assertSame($secret, Webhook::find($id)->secret);

        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/webhooks/{$id}")
            ->assertOk()->assertJsonMissingPath('data.secret');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/webhooks')
            ->assertOk()->assertJsonMissingPath('data.0.secret')
            ->assertJsonPath('meta.events.0.value', 'lead.created');
        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/webhooks/{$id}", ['name' => 'CRM (live)'])
            ->assertOk()->assertJsonPath('data.name', 'CRM (live)')->assertJsonMissingPath('data.secret');

        // The activity log recorded the creation and holds no secret.
        $entry = Activity::where('action', 'store')->sole();
        $this->assertStringNotContainsString($secret, (string) json_encode($entry->toArray()));
    }

    public function test_rotating_the_secret_answers_the_new_one_once(): void
    {
        $admin = $this->admin();
        $hook = $this->hook(secret: 'whsec_old');
        $hook->forceFill(['last_error' => 'ping: answered 401.'])->save();

        $rotated = $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/webhooks/{$hook->id}", ['rotate_secret' => true])
            ->assertOk()
            ->assertJsonPath('data.last_error', null)
            ->json('data.secret');

        $this->assertStringStartsWith('whsec_', $rotated);
        $this->assertNotSame('whsec_old', $rotated);
        $this->assertSame($rotated, $hook->fresh()->secret);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/webhooks/{$hook->id}", ['rotate_secret' => false])
            ->assertOk()->assertJsonMissingPath('data.secret');
    }

    public function test_http_and_private_hosts_are_refused_on_write(): void
    {
        $admin = $this->admin();

        foreach ([
            'http://crm.example.com/hooks',
            'https://127.0.0.1:8000/api/v1/',
            'https://10.0.0.5/hook',
            'https://192.168.1.20/hook',
            'https://169.254.169.254/latest/meta-data/',
            'https://[::1]/hook',
            'https://localhost/hook',
            'https://intranet/hook',
            'https://db.internal/hook',
            'https://user:pass@crm.example.com/hooks',
            'not a url',
        ] as $url) {
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/v1/admin/webhooks', ['name' => 'x', 'url' => $url, 'events' => ['ticket.created']])
                ->assertUnprocessable()->assertJsonValidationErrors(['url']);
        }

        $this->assertSame(0, Webhook::count());

        // And `ping` cannot be subscribed to: it is sent from the console only.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/webhooks', ['name' => 'x', 'url' => 'https://crm.example.com/h', 'events' => ['ping']])
            ->assertUnprocessable()->assertJsonValidationErrors(['events.0']);
    }

    public function test_the_screens_are_administrator_only(): void
    {
        $this->actingAs($this->support(), 'sanctum')->getJson('/api/v1/admin/webhooks')->assertForbidden();
    }

    public function test_ping_and_redeliver_create_deliveries_and_a_delivery_is_scoped_to_its_hook(): void
    {
        Queue::fake();
        $admin = $this->admin();
        $hook = $this->hook(['ticket.created']);
        $other = $this->hook(['ticket.created']);

        $pingId = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/webhooks/{$hook->id}/ping")
            ->assertStatus(202)->json('data.delivery_id');

        $ping = WebhookDelivery::findOrFail($pingId);
        $this->assertSame('ping', $ping->event);
        $this->assertSame($hook->id, $ping->webhook_id);
        Queue::assertPushed(DeliverWebhook::class, fn ($job) => $job->deliveryId === $pingId);

        $failed = $this->delivery($hook, 'ticket.created', ['reference' => 'TW-2026-00009']);
        $failed->forceFill(['status' => 'failed', 'attempts' => 5, 'response_status' => 503])->save();

        // The list carries no payload; the detail read does.
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/webhooks/{$hook->id}/deliveries?status=failed")
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $failed->id)
            ->assertJsonMissingPath('data.0.payload');
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/webhooks/{$hook->id}/deliveries/{$failed->id}")
            ->assertOk()->assertJsonPath('data.payload.reference', 'TW-2026-00009');

        $resent = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/webhooks/{$hook->id}/deliveries/{$failed->id}/redeliver")
            ->assertStatus(202)
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.event', 'ticket.created')
            ->json('data.id');

        $this->assertNotSame($failed->id, $resent);
        $this->assertSame(['reference' => 'TW-2026-00009'], WebhookDelivery::find($resent)->payload);
        // The original is untouched: the log keeps what happened the first time.
        $this->assertSame('failed', $failed->fresh()->status);

        // Somebody else's delivery under this hook is a 404, never a 403.
        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/admin/webhooks/{$other->id}/deliveries/{$failed->id}")
            ->assertNotFound();
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/webhooks/{$other->id}/deliveries/{$failed->id}/redeliver")
            ->assertNotFound();
    }

    public function test_deleting_a_hook_takes_its_deliveries_and_is_recorded(): void
    {
        $admin = $this->admin();
        $hook = $this->hook();
        $this->delivery($hook);

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/admin/webhooks/{$hook->id}")->assertOk();

        $this->assertSame(0, Webhook::count());
        $this->assertSame(0, WebhookDelivery::count());
        $entry = Activity::where('action', 'destroy')->sole();
        $this->assertSame('webhook', $entry->subject_type);
        $this->assertSame('CRM', $entry->subject_label);
    }

    /* ------------------------------------------------------------- the prune */

    public function test_the_prune_deletes_only_old_deliveries(): void
    {
        $hook = $this->hook();
        $old = $this->delivery($hook);
        $old->forceFill(['created_at' => now()->subDays(PruneWebhookDeliveries::DAYS + 1)])->save();
        $recent = $this->delivery($hook);
        $recent->forceFill(['created_at' => now()->subDays(PruneWebhookDeliveries::DAYS - 1)])->save();

        $this->artisan('technoware:prune-webhook-deliveries')
            ->expectsOutputToContain('Deleted 1 webhook delivery')
            ->assertSuccessful();

        $this->assertNull(WebhookDelivery::find($old->id));
        $this->assertNotNull(WebhookDelivery::find($recent->id));
        $this->assertNotNull($hook->fresh());
    }
}
