<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Working the order queue.
 *
 * The rule this file exists to defend: **nothing in the console can mark an
 * order paid.** That is the difference between a shop and a way of giving stock
 * away, and it is enforced by the enum rather than by a controller remembering.
 */
class StoreOrderAdminTest extends TestCase
{
    use RefreshDatabase;

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'store-orders@example.test'],
            ['name' => 'Store Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::StoreManager->value],
                ['name' => RoleEnum::StoreManager->label()],
            ));
        }

        return $user;
    }

    private function order(OrderStatus $status = OrderStatus::Paid): Order
    {
        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch-'.uniqid(),
            'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => 5,
        ]);

        $order = Order::create([
            'status' => $status,
            'subtotal_paise' => 1180000, 'taxable_paise' => 1000000,
            'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(),
            'paid_at' => $status->isPaid() ? now() : null,
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name, 'sku' => $product->sku, 'type' => ProductType::Physical,
            'quantity' => 1, 'unit_price_paise' => 1180000, 'line_total_paise' => 1180000,
            'returnable' => true,
        ]);

        return $order->fresh('items');
    }

    // ------------------------------------------------------ the role

    public function test_the_queue_is_not_reachable_by_a_content_manager(): void
    {
        $editor = User::firstOrCreate(
            ['email' => 'cm-orders@example.test'],
            ['name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $editor->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($editor, 'sanctum')
            ->getJson('/api/v1/admin/store/orders')
            ->assertForbidden();
    }

    // ------------------------------------------------------ status

    /**
     * The single most important refusal in the module.
     *
     * An order becomes paid because a payment was verified server-side, never
     * because somebody chose it from a dropdown.
     */
    public function test_nobody_can_mark_an_order_paid_by_hand(): void
    {
        $order = $this->order(OrderStatus::PendingPayment);

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", ['status' => 'paid'])
            ->assertStatus(422);

        $this->assertSame(OrderStatus::PendingPayment, $order->fresh()->status);
    }

    public function test_an_illegal_move_is_refused_by_name(): void
    {
        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", ['status' => 'refunded'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'An order cannot go from Paid to Refunded.');
    }

    public function test_a_legal_move_is_recorded_with_who_made_it(): void
    {
        $order = $this->order(OrderStatus::Paid);
        $manager = $this->manager();

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", [
                'status' => 'processing', 'note' => 'Picking it this afternoon.',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'processing');

        $event = $order->history()->latest('id')->firstOrFail();

        $this->assertSame('paid', $event->from_status);
        $this->assertSame('processing', $event->to_status);
        $this->assertSame($manager->name, $event->actor_name);
    }

    /** Dispatching stamps the moment, and the stamp is never cleared. */
    public function test_dispatching_stamps_the_time(): void
    {
        $order = $this->order(OrderStatus::Paid);
        $manager = $this->manager();

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", ['status' => 'processing'])
            ->assertOk();

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", ['status' => 'dispatched'])
            ->assertOk();

        $order->refresh();
        $dispatched = $order->dispatched_at;

        $this->assertNotNull($dispatched);

        $this->actingAs($manager, 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/status", ['status' => 'completed'])
            ->assertOk();

        // Completing must not erase when it was dispatched — the mistake
        // `resolved_at` had to be taught on tickets.
        $this->assertEquals($dispatched, $order->fresh()->dispatched_at);
    }

    // ------------------------------------------------------ dispatch

    public function test_tracking_is_saved_and_written_into_the_trail(): void
    {
        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/orders/{$order->order_number}/shipping", [
                'courier' => 'Blue Dart',
                'tracking_number' => '123456789',
                'tracking_url' => 'https://bluedart.example/track/123456789',
            ])
            ->assertOk()
            ->assertJsonPath('data.tracking_number', '123456789');

        $this->assertStringContainsString(
            'Blue Dart 123456789',
            $order->history()->latest('id')->value('note'),
        );
    }

    /**
     * A tracking link becomes an `href` on a page of ours.
     *
     * The same reasoning as the contact page's map embed: an unchecked URL from
     * a form is somebody else's site behind our name.
     */
    public function test_a_tracking_link_must_be_a_url(): void
    {
        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->patchJson("/api/v1/admin/store/orders/{$order->order_number}/shipping", [
                'tracking_url' => 'javascript:alert(1)',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('tracking_url');
    }

    // ------------------------------------------------------ the invoice

    /**
     * The invoice goes to the **private** disk.
     *
     * It carries a name, an address and a GSTIN. A public URL for one is a
     * document anybody who guesses a filename can read — the same rule a CV and
     * a ticket attachment follow.
     */
    public function test_an_invoice_is_stored_privately_and_streamed(): void
    {
        Storage::fake('local');

        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->post("/api/v1/admin/store/orders/{$order->order_number}/invoice", [
                'invoice_number' => 'INV-2026-0001',
                'invoice_date' => '2026-08-31',
                'invoice' => UploadedFile::fake()->create('invoice.pdf', 12, 'application/pdf'),
            ])
            ->assertOk()
            ->assertJsonPath('data.has_invoice', true)
            ->assertJsonPath('data.invoice_number', 'INV-2026-0001');

        $order->refresh();

        $this->assertStringStartsWith("orders/{$order->order_number}/", $order->invoice_path);
        Storage::disk('local')->assertExists($order->invoice_path);

        // And the path never reaches a response — a storage path in JSON is the
        // first half of making a file fetchable.
        $read = $this->actingAs($this->manager(), 'sanctum')
            ->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk();

        $this->assertArrayNotHasKey('invoice_path', $read->json('data'));
    }

    public function test_a_non_pdf_invoice_is_refused(): void
    {
        Storage::fake('local');

        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->post("/api/v1/admin/store/orders/{$order->order_number}/invoice", [
                'invoice' => UploadedFile::fake()->create('invoice.php', 4, 'application/x-php'),
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('invoice');
    }

    // ------------------------------------------------------ notes

    /**
     * A note is for colleagues, and the customer's resource has no key for it.
     *
     * Structural rather than a flag somebody has to remember — the lesson the
     * ticket module's internal notes taught, where the worst possible failure
     * is a note in a customer's inbox.
     */
    public function test_an_internal_note_never_reaches_the_customer(): void
    {
        $order = $this->order(OrderStatus::Paid);

        $this->actingAs($this->manager(), 'sanctum')
            ->postJson("/api/v1/admin/store/orders/{$order->order_number}/notes", [
                'body' => 'Customer rang, wants it before Friday.',
            ])
            ->assertOk()
            ->assertJsonPath('data.notes.0.body', 'Customer rang, wants it before Friday.');

        $customerView = $this->getJson(
            "/api/v1/orders/{$order->order_number}?token={$order->access_token}"
        )->assertOk();

        $this->assertArrayNotHasKey('notes', $customerView->json('data'));
        $this->assertStringNotContainsString('wants it before Friday', $customerView->getContent());
    }

    /** The access token is not in an admin response either. */
    public function test_the_access_token_is_not_in_the_console(): void
    {
        $order = $this->order(OrderStatus::Paid);

        $response = $this->actingAs($this->manager(), 'sanctum')
            ->getJson("/api/v1/admin/store/orders/{$order->order_number}")
            ->assertOk();

        $this->assertStringNotContainsString($order->access_token, $response->getContent());
    }

    // ------------------------------------------------------ the queue itself

    public function test_the_queue_can_be_narrowed_to_what_needs_doing(): void
    {
        $this->order(OrderStatus::PendingPayment);
        $this->order(OrderStatus::Paid);
        $this->order(OrderStatus::Completed);

        $manager = $this->manager();

        $open = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/orders?open=1')
            ->assertOk();

        $this->assertCount(2, $open->json('data'));

        $unpaid = $this->actingAs($manager, 'sanctum')
            ->getJson('/api/v1/admin/store/orders?unpaid=1')
            ->assertOk();

        $this->assertCount(1, $unpaid->json('data'));
        // Counted over the whole table rather than the page: it is a headline.
        $this->assertSame(1, $unpaid->json('meta.pending_payment'));
    }

    public function test_an_order_is_found_by_number_email_or_tracking(): void
    {
        $order = $this->order(OrderStatus::Paid);
        $order->update(['tracking_number' => 'BD-99887766']);

        $manager = $this->manager();

        foreach ([$order->order_number, 'neil@example.test', 'BD-99887766'] as $term) {
            $this->actingAs($manager, 'sanctum')
                ->getJson('/api/v1/admin/store/orders?q='.urlencode($term))
                ->assertOk()
                ->assertJsonPath('data.0.order_number', $order->order_number);
        }
    }
}
