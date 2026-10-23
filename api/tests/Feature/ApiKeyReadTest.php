<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\LeadStatus;
use App\Enums\OrderStatus;
use App\Enums\PublishStatus;
use App\Enums\SubscriberStatus;
use App\Enums\TicketStatus;
use App\Models\ApiKey;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\StoreProduct;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Support\Webhooks\WebhookPayload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** The `/ext` read endpoints: what a key reads is what a webhook is sent. */
class ApiKeyReadTest extends TestCase
{
    use RefreshDatabase;

    private function key(array $scopes): string
    {
        [$plain, $hash] = ApiKey::mint();
        ApiKey::create([
            'name' => 'Reader', 'prefix' => substr($plain, 0, 11), 'key_hash' => $hash, 'scopes' => $scopes,
        ]);

        return $plain;
    }

    private function read(string $uri, ?string $plain = null): TestResponse
    {
        $plain ??= $this->key(['leads:read', 'orders:read', 'customers:read', 'tickets:read', 'subscribers:read', 'products:read']);

        return $this->withHeader('Authorization', 'Bearer '.$plain)->getJson('/api/v1/ext/'.$uri);
    }

    private function lead(string $email = 'a@example.test', array $extra = []): Lead
    {
        return Lead::create($extra + ['name' => 'A', 'email' => $email, 'status' => LeadStatus::New, 'channel' => 'contact']);
    }

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => $email,
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(array $extra = []): Ticket
    {
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        return Ticket::create($extra + [
            'customer_id' => $this->customer()->id,
            'ticket_category_id' => $category->id,
            'subject' => 'A switch keeps rebooting',
            'description' => 'It drops every device on it twice a day.',
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
    }

    private function order(array $extra = []): Order
    {
        return Order::create($extra + [
            'status' => OrderStatus::PendingPayment,
            'payment_method' => 'razorpay',
            'subtotal_paise' => 1180000, 'discount_paise' => 0,
            'taxable_paise' => 1000000, 'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(),
        ]);
    }

    public function test_leads_list_is_the_webhook_shape_and_pages_forward(): void
    {
        $first = $this->lead('a@example.test');
        $this->lead('b@example.test');
        $plain = $this->key(['leads:read']);

        $page1 = $this->read('leads?per_page=1', $plain)->assertOk()
            ->assertJsonPath('meta.total', 2)->assertJsonPath('meta.per_page', 1)
            ->assertJsonPath('meta.last_page', 2);
        $this->assertSame(
            json_decode(json_encode(WebhookPayload::lead($first->fresh())), true),
            $page1->json('data.0'),
        );

        $this->read('leads?per_page=1&page=2', $plain)->assertOk()->assertJsonPath('data.0.email', 'b@example.test');
        $this->read('leads/'.$first->id, $plain)->assertOk()->assertJsonPath('data.email', 'a@example.test');
        $this->read('leads/999999', $plain)->assertStatus(404)->assertJsonPath('message', 'Not found.');
    }

    public function test_status_filters_and_unknown_values_are_ignored(): void
    {
        $this->lead('a@example.test');
        $this->lead('b@example.test', ['status' => LeadStatus::Won]);
        $plain = $this->key(['leads:read']);

        $this->read('leads?status=won', $plain)->assertOk()->assertJsonPath('meta.total', 1);
        $this->read('leads?status=nonsense', $plain)->assertOk()->assertJsonPath('meta.total', 2);
    }

    public function test_since_filters_on_updated_at(): void
    {
        $old = $this->lead('old@example.test');
        $this->lead('new@example.test');
        Lead::whereKey($old->id)->toBase()->update(['updated_at' => now()->subDays(10)]);
        $plain = $this->key(['leads:read']);

        $res = $this->read('leads?since='.urlencode(now()->subDay()->toIso8601String()), $plain)->assertOk();
        $this->assertSame(['new@example.test'], array_column($res->json('data'), 'email'));
    }

    public function test_since_is_an_instant_whatever_offset_it_carries(): void
    {
        $this->lead('now@example.test'); // updated_at is now, stored in the app timezone (IST)
        $plain = $this->key(['leads:read']);
        $count = fn (string $since) => $this->read('leads?since='.urlencode($since), $plain)->assertOk()->json('meta.total');

        $utc = now()->utc();
        $this->assertSame(1, $count($utc->copy()->subMinute()->format('Y-m-d\TH:i:s\Z')));
        $this->assertSame(0, $count($utc->copy()->addMinute()->format('Y-m-d\TH:i:s\Z')));
        $this->assertSame(1, $count($utc->copy()->subMinute()->format('Y-m-d\TH:i:s.v\Z')));

        $tokyo = now()->setTimezone('+09:00');
        $this->assertSame(1, $count($tokyo->copy()->subMinute()->format('Y-m-d\TH:i:sP')));
        $this->assertSame(0, $count($tokyo->copy()->addMinute()->format('Y-m-d\TH:i:sP')));

        $this->assertSame(1, $count(now()->format('Y-m-d'))); // a plain date is the app's day
    }

    public function test_per_page_defaults_to_50_and_an_empty_value_is_the_default(): void
    {
        $plain = $this->key(['leads:read']);

        $this->read('leads', $plain)->assertJsonPath('meta.per_page', 50);
        $this->read('leads?per_page=', $plain)->assertOk()->assertJsonPath('meta.per_page', 50);
    }

    public function test_a_malformed_since_or_per_page_is_422(): void
    {
        $plain = $this->key(['leads:read']);

        foreach (['yesterday-ish', 'yesterday', '2026-13-45', 'tomorrow'] as $bad) {
            $this->read('leads?since='.urlencode($bad), $plain)->assertStatus(422)
                ->assertJsonPath('errors.since.0', 'Give `since` as an ISO 8601 date and time.');
        }
        $this->read('leads?per_page=500', $plain)->assertStatus(422)->assertJsonValidationErrors('per_page');
    }

    /** @return array<string, array{0: string, 1: string}> */
    public static function listPaths(): array
    {
        return [
            'leads' => ['leads', 'leads:read'],
            'orders' => ['orders', 'orders:read'],
            'customers' => ['customers', 'customers:read'],
            'tickets' => ['tickets', 'tickets:read'],
            'subscribers' => ['subscribers', 'subscribers:read'],
            'products' => ['store/products', 'products:read'],
        ];
    }

    #[DataProvider('listPaths')]
    public function test_each_read_route_needs_its_own_scope(string $path, string $scope): void
    {
        $others = array_values(array_filter(
            array_column(self::listPaths(), 1),
            fn ($s) => $s !== $scope,
        ));

        $this->read($path, $this->key($others))->assertStatus(403)->assertJsonPath('reason', 'missing_scope');
        $this->read($path, $this->key([$scope]))->assertOk();
    }

    public function test_orders_are_found_by_number_and_carry_no_access_token(): void
    {
        $order = $this->order(['status' => OrderStatus::Paid, 'paid_at' => now()]);
        $this->order(['customer_email' => 'x@example.test']);
        $plain = $this->key(['orders:read']);
        $this->assertNotEmpty($order->access_token);

        $res = $this->read('orders/'.$order->order_number, $plain)->assertOk()
            ->assertJsonPath('data.order_number', $order->order_number);
        $this->assertStringNotContainsString($order->access_token, $res->getContent());
        $this->assertStringNotContainsString($order->access_token, $this->read('orders', $plain)->getContent());

        $this->read('orders?paid=1', $plain)->assertOk()->assertJsonPath('meta.total', 1);
        $this->read('orders/NOPE-1', $plain)->assertStatus(404);
    }

    public function test_customers_carry_no_status_note(): void
    {
        $customer = $this->customer();
        Customer::whereKey($customer->id)->toBase()->update(['status_note' => 'WATCH THIS ONE']);
        $plain = $this->key(['customers:read']);

        $res = $this->read('customers/'.$customer->id, $plain)->assertOk()->assertJsonPath('data.email', 'neil@example.test');
        $this->assertStringNotContainsString('WATCH THIS ONE', $res->getContent());
        $this->assertStringNotContainsString('WATCH THIS ONE', $this->read('customers', $plain)->getContent());
        $this->read('customers/abc', $plain)->assertStatus(404);
    }

    public function test_a_sensitive_ticket_is_redacted_and_notes_are_absent(): void
    {
        $ticket = $this->ticket(['is_sensitive' => true, 'description' => 'THE ROUTER PASSWORD IS HUNTER2']);
        $ticket->messages()->create(['author_type' => 'customer', 'author_id' => $ticket->customer_id, 'body' => 'a plain public reply']);
        $ticket->messages()->create(['author_type' => 'customer', 'author_id' => $ticket->customer_id, 'body' => 'SECRET MESSAGE BODY', 'is_sensitive' => true]);
        $ticket->messages()->create(['author_type' => 'customer', 'author_id' => $ticket->customer_id, 'body' => 'INTERNAL ENGINEERING NOTE', 'is_internal' => true]);
        $plain = $this->key(['tickets:read']);

        $res = $this->read('tickets/'.$ticket->reference, $plain)->assertOk()
            ->assertJsonPath('data.description', WebhookPayload::REDACTED)
            ->assertJsonCount(2, 'data.messages')
            ->assertJsonPath('data.messages.0.body', 'a plain public reply')
            ->assertJsonPath('data.messages.1.body', WebhookPayload::REDACTED);
        foreach (['HUNTER2', 'SECRET MESSAGE BODY', 'INTERNAL ENGINEERING NOTE'] as $leak) {
            $this->assertStringNotContainsString($leak, $res->getContent());
        }

        $list = $this->read('tickets', $plain)->assertOk();
        $this->assertStringNotContainsString('HUNTER2', $list->getContent());
        $this->read('tickets?status=open', $plain)->assertJsonPath('meta.total', 1);
        $this->read('tickets/TW-0000-00000', $plain)->assertStatus(404);
    }

    public function test_subscribers_list_filters_on_status(): void
    {
        NewsletterSubscriber::create(['email' => 'in@example.test', 'status' => SubscriberStatus::Active]);
        NewsletterSubscriber::create(['email' => 'out@example.test', 'status' => SubscriberStatus::Unsubscribed]);
        $plain = $this->key(['subscribers:read']);

        $this->read('subscribers', $plain)->assertJsonPath('meta.total', 2);
        $this->read('subscribers?status=unsubscribed', $plain)->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.email', 'out@example.test');
    }

    public function test_products_list_carries_stock_and_variations(): void
    {
        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'sku' => 'SW-1', 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'compare_at_paise' => 1300000, 'track_stock' => true, 'stock' => 0,
        ]);
        $product->variations()->create(['name' => '24-port', 'sku' => 'SW-1-24', 'price_paise' => 1180000, 'stock' => 4, 'is_active' => true]);
        $product->variations()->create(['name' => '48-port', 'sku' => 'SW-1-48', 'price_paise' => 1500000, 'stock' => 2, 'is_active' => true]);

        $row = $this->read('store/products', $this->key(['products:read']))->assertOk()->json('data.0');

        $this->assertSame('SW-1', $row['sku']);
        $this->assertSame(1180000, $row['price_paise']);
        $this->assertSame(1300000, $row['compare_at_paise']);
        $this->assertTrue($row['track_stock']);
        $this->assertSame(6, $row['stock']);
        $this->assertTrue($row['in_stock']);
        $this->assertSame('published', $row['status']);
        $this->assertSame(['24-port', '48-port'], array_column($row['variations'], 'name'));
        $this->assertSame([4, 2], array_column($row['variations'], 'stock'));
    }
}
