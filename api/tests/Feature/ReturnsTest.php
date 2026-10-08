<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\ReturnStatus;
use App\Enums\Role as RoleEnum;
use App\Http\Middleware\ThrottleRequestsPerRoute;
use App\Models\Customer;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StockMovement;
use App\Models\StoreProduct;
use App\Models\User;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Notifications\ReturnRequestReceived;
use App\Notifications\ReturnStatusChanged;
use App\Support\Mail\MessageCatalogue;
use App\Support\Store\Returns\ReturnPolicy;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Returns (0.132.0, docs/store.md "Returns"): which orders may send what
 * back and until when, the two doors a customer asks through, and the desk's
 * five moves — with the stock and the money each one touches.
 *
 * The clock is fixed at Thursday 8 October 2026, 11:00 IST. The order in
 * most tests was completed three days earlier, with a seven-day window.
 */
class ReturnsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-08 11:00:00', 'Asia/Kolkata'));
        Notification::fake();
        Storage::fake('local');
    }

    private function staff(RoleEnum $role = RoleEnum::StoreManager): User
    {
        $user = User::create([
            'name' => ucfirst($role->value), 'email' => $role->value.'-'.Str::random(6).'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function product(array $overrides = []): StoreProduct
    {
        return StoreProduct::create(array_replace([
            'name' => 'Aruba 2930F switch', 'slug' => 'sw-'.Str::random(8), 'sku' => 'JL253A',
            'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => 1000000, 'track_stock' => true, 'stock' => 5,
        ], $overrides));
    }

    /**
     * A delivered, paid order: two switches and one licence key.
     *
     * @return array{0: Order, 1: OrderItem, 2: OrderItem, 3: StoreProduct}
     */
    private function order(array $overrides = []): array
    {
        $product = $this->product();

        $order = Order::create(array_replace([
            'status' => OrderStatus::Completed, 'payment_method' => 'gateway',
            'subtotal_paise' => 2500000, 'discount_paise' => 0, 'taxable_paise' => 2118644, 'gst_paise' => 381356, 'total_paise' => 2500000,
            'customer_name' => 'Priya Das', 'customer_email' => 'priya@acme.co.in', 'customer_phone' => '9800000000',
            'billing_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
            'shipping_address' => ['line1' => '1 Road', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700001'],
            'placed_at' => now()->subDays(8), 'paid_at' => now()->subDays(8),
            'dispatched_at' => now()->subDays(6), 'completed_at' => now()->subDays(3),
        ], $overrides));

        $switches = $order->items()->create([
            'store_product_id' => $product->id, 'name' => 'Aruba 2930F switch', 'sku' => 'JL253A', 'type' => ProductType::Physical,
            'quantity' => 2, 'unit_price_paise' => 1000000, 'line_total_paise' => 2000000, 'returnable' => true,
        ]);
        $licence = $order->items()->create([
            'name' => 'Central licence', 'sku' => 'LIC-1', 'type' => ProductType::Digital,
            'quantity' => 1, 'unit_price_paise' => 500000, 'line_total_paise' => 500000, 'returnable' => true,
        ]);

        return [$order->fresh(), $switches, $licence, $product];
    }

    /** @param  array<string, mixed>  $overrides */
    private function ask(Order $order, OrderItem $item, int $quantity = 1, array $overrides = [])
    {
        return $this->postJson("/api/v1/orders/{$order->order_number}/returns", array_replace([
            'token' => $order->access_token,
            'reason' => 'damaged',
            'details' => 'The box was crushed and one port is bent.',
            'items' => [['order_item_id' => $item->id, 'quantity' => $quantity]],
        ], $overrides));
    }

    private function returnOf(Order $order, OrderItem $item, int $quantity = 1): OrderReturn
    {
        $this->ask($order, $item, $quantity)->assertCreated();

        return OrderReturn::query()->latest('id')->firstOrFail();
    }

    private function read(Order $order): array
    {
        return $this->getJson("/api/v1/orders/{$order->order_number}?token={$order->access_token}")->assertOk()->json('data');
    }

    // ---- What may come back, and until when --------------------------------

    public function test_a_delivered_order_offers_its_shipped_returnable_lines_inside_the_window(): void
    {
        [$order, $switches, $licence] = $this->order();

        $data = $this->read($order);

        $this->assertSame([], $data['returns']);
        $this->assertTrue($data['return_policy']['open']);
        $this->assertNull($data['return_policy']['message']);
        // Completed on the 5th, seven days: the 12th, to the end of that day.
        $this->assertSame('2026-10-12', $data['return_policy']['closes_on']);
        $this->assertSame('12 October 2026', $data['return_policy']['closes_label']);
        $this->assertSame(7, $data['return_policy']['days']);
        // The switches may come back; a licence key cannot.
        $this->assertEqualsCanonicalizing([
            ['order_item_id' => $switches->id, 'returnable' => 2],
            ['order_item_id' => $licence->id, 'returnable' => 0],
        ], $data['return_policy']['items']);
        $this->assertSame('damaged', $data['return_policy']['reasons'][0]['value']);
        $this->assertSame(4, $data['return_policy']['max_photos']);

        // A list row carries neither key.
        $customer = Customer::create(['name' => 'Priya Das', 'email' => 'priya@acme.co.in', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active]);
        $order->forceFill(['customer_id' => $customer->id])->save();
        $token = $customer->createToken('portal', ['portal'])->plainTextToken;
        $row = $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/v1/my/orders')->assertOk()->json('data.0');
        $this->assertArrayNotHasKey('returns', $row);
        $this->assertArrayNotHasKey('return_policy', $row);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function closedDoors(): array
    {
        return [
            'not dispatched yet' => [['status' => 'paid', 'dispatched_at' => null, 'completed_at' => null], 'once the order has been dispatched'],
            'cancelled' => [['status' => 'cancelled'], 'was cancelled'],
            'refunded' => [['status' => 'refunded'], 'was refunded'],
            'the window has closed' => [['completed_at' => '2026-09-20 10:00:00'], 'closed on 27 September 2026'],
        ];
    }

    /** @param  array<string, mixed>  $overrides */
    #[DataProvider('closedDoors')]
    public function test_an_order_outside_the_rules_is_told_why_and_refused(array $overrides, string $says): void
    {
        [$order, $switches] = $this->order($overrides);

        $policy = $this->read($order)['return_policy'];
        $this->assertFalse($policy['open']);
        $this->assertStringContainsString($says, $policy['message']);

        // The page not offering the form is not the rule; the request is.
        $this->ask($order, $switches)->assertUnprocessable()->assertJsonValidationErrors('return');
        $this->assertSame(0, OrderReturn::count());
    }

    public function test_a_dispatched_order_counts_its_window_from_the_longest_quoted_transit(): void
    {
        // Dispatched six days ago and never marked complete; transit is up to
        // seven days, so delivery is read as tomorrow and the window as open.
        [$order, $switches] = $this->order(['status' => 'dispatched', 'completed_at' => null]);

        $policy = $this->read($order)['return_policy'];
        $this->assertTrue($policy['open']);
        $this->assertSame(ReturnPolicy::deadline($order)->toDateString(), $policy['closes_on']);
        $this->assertSame('2026-10-16', $policy['closes_on']);

        $this->ask($order, $switches)->assertCreated();
    }

    public function test_the_switch_takes_returns_off_the_site(): void
    {
        [$order, $switches] = $this->order();
        Setting::where('key', 'store_returns_enabled')->firstOrFail()->forceFill(['value' => '0'])->save();
        Setting::flushCache();

        $policy = $this->read($order)['return_policy'];
        $this->assertFalse($policy['enabled']);
        $this->assertFalse($policy['open']);
        $this->ask($order, $switches)->assertUnprocessable()->assertJsonValidationErrors('return');
    }

    public function test_a_line_sold_as_non_returnable_cannot_come_back(): void
    {
        [$order, $switches] = $this->order();
        $switches->forceFill(['returnable' => false])->save();

        $policy = $this->read($order)['return_policy'];
        $this->assertFalse($policy['open']);
        $this->assertSame('Nothing on this order is left to return.', $policy['message']);
        $this->ask($order, $switches)->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
    }

    // ---- Asking -----------------------------------------------------------

    public function test_a_guest_asks_through_the_order_link_and_everybody_is_told(): void
    {
        Webhook::create(['name' => 'ERP', 'url' => 'https://erp.example.com/hook', 'secret' => 'whsec_test', 'events' => ['return.requested'], 'is_active' => true]);
        [$order, $switches, $licence] = $this->order();

        $response = $this->post("/api/v1/orders/{$order->order_number}/returns", [
            'token' => $order->access_token,
            'reason' => 'damaged',
            'details' => 'The box was crushed.',
            // A form posts every line; one left at 0 is being kept.
            'items' => [
                ['order_item_id' => $switches->id, 'quantity' => '1'],
                ['order_item_id' => $licence->id, 'quantity' => '0'],
            ],
            'photos' => [UploadedFile::fake()->image('Crushed box.jpg', 800, 600), UploadedFile::fake()->image('port.png')],
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('data.reference', 'RMA-2026-00001')
            ->assertJsonPath('data.status', 'requested')
            ->assertJsonPath('data.reason_label', 'Arrived damaged')
            ->assertJsonPath('data.items.0.name', 'Aruba 2930F switch')
            ->assertJsonPath('data.items.0.quantity', 1)
            ->assertJsonPath('data.photos_count', 2)
            ->assertJsonPath('message', 'We have your return request. Its reference is RMA-2026-00001, and we have emailed it to you.');

        // Nothing staff-only and no file's location reaches the customer.
        $body = (string) $response->getContent();
        foreach (['staff_note', 'returns/', '"path"', 'access_token'] as $never) {
            $this->assertStringNotContainsString($never, $body);
        }

        $return = OrderReturn::sole();
        $this->assertSame(1, $return->items()->count());
        $this->assertSame(2, $return->photos()->count());
        $photo = $return->photos()->first();
        $this->assertStringStartsWith("returns/{$return->id}/", $photo->path);
        $this->assertStringNotContainsString('Crushed', $photo->path);
        $this->assertSame('Crushed box.jpg', $photo->name);
        Storage::disk('local')->assertExists($photo->path);

        // The order's own trail says so, and its read now carries the return.
        $this->assertStringContainsString('Return RMA-2026-00001 requested', (string) $order->history()->reorder()->orderByDesc('id')->value('note'));
        $data = $this->read($order);
        $this->assertSame('RMA-2026-00001', $data['returns'][0]['reference']);
        $this->assertEqualsCanonicalizing([1, 0], array_column($data['return_policy']['items'], 'returnable'));

        Notification::assertSentOnDemand(ReturnStatusChanged::class, fn (ReturnStatusChanged $n, $channels, AnonymousNotifiable $to) => $n->key === 'return_requested' && $to->routes['mail'] === 'priya@acme.co.in');
        Notification::assertSentOnDemand(ReturnRequestReceived::class, fn ($n, $channels, AnonymousNotifiable $to) => $to->routes['mail'] === Setting::get('support_email'));

        $payload = WebhookDelivery::sole()->payload;
        $this->assertSame('RMA-2026-00001', $payload['reference']);
        $this->assertSame($order->order_number, $payload['order_number']);
        $this->assertArrayNotHasKey('staff_note', $payload);
        $this->assertStringNotContainsString('returns/', json_encode($payload));
    }

    public function test_a_wrong_token_is_the_404_a_wrong_number_is(): void
    {
        [$order, $switches] = $this->order();

        $this->ask($order, $switches, 1, ['token' => str_repeat('a', 64)])->assertNotFound();
        $this->ask($order, $switches, 1, ['token' => ''])->assertNotFound();
        $this->postJson('/api/v1/orders/ORD-2026-99999/returns', ['token' => $order->access_token, 'reason' => 'damaged', 'items' => [['order_item_id' => $switches->id, 'quantity' => 1]]])->assertNotFound();
        $this->assertSame(0, OrderReturn::count());
    }

    public function test_quantities_are_counted_against_what_other_returns_already_hold(): void
    {
        // A dozen requests in one test: the route's own limit is not what this is about.
        $this->withoutMiddleware(ThrottleRequestsPerRoute::class);
        [$order, $switches, $licence] = $this->order();
        [$other, $otherLine] = $this->order();

        $this->ask($order, $switches, 3)->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
        $this->ask($order, $licence)->assertUnprocessable()->assertJsonValidationErrors('items.0.quantity');
        // A line of somebody else's order is not on this one.
        $this->ask($order, $otherLine)->assertUnprocessable()->assertJsonValidationErrors('items.0.order_item_id');
        $this->ask($order, $switches, 1, ['items' => [
            ['order_item_id' => $switches->id, 'quantity' => 1], ['order_item_id' => $switches->id, 'quantity' => 1],
        ]])->assertUnprocessable()->assertJsonValidationErrors('items.1.order_item_id');
        $this->ask($order, $switches, 1, ['items' => []])->assertUnprocessable()->assertJsonValidationErrors('items');
        $this->ask($order, $switches, 1, ['reason' => 'bored'])->assertUnprocessable()->assertJsonValidationErrors('reason');

        $first = $this->returnOf($order, $switches, 1);

        // One of two is spoken for.
        $this->assertSame('Only 1 of that item can be returned.', $this->ask($order, $switches, 2)->assertUnprocessable()->json('errors')['items.0.quantity'][0]);
        $second = $this->returnOf($order, $switches, 1);
        $this->assertSame('A return has already been asked for all of that item.', $this->ask($order, $switches)->assertUnprocessable()->json('errors')['items.0.quantity'][0]);

        // A refusal gives its quantity back…
        $manager = $this->staff();
        $this->actingAs($manager, 'sanctum')->postJson("/api/v1/admin/store/returns/{$first->reference}/reject", ['note' => 'Outside the policy.'])->assertOk();
        // …and so does a return closed before anything arrived.
        $this->postJson("/api/v1/admin/store/returns/{$second->reference}/close", ['note' => 'Customer kept it.'])->assertOk();
        app('auth')->forgetGuards();

        $this->assertSame(2, ReturnPolicy::returnable($order->fresh())[$switches->id]);
        $this->ask($order, $switches, 2)->assertCreated()->assertJsonPath('data.reference', 'RMA-2026-00003');
    }

    public function test_a_photograph_must_be_a_picture_and_there_are_at_most_four(): void
    {
        [$order, $switches] = $this->order();
        $send = fn (array $photos) => $this->post("/api/v1/orders/{$order->order_number}/returns", [
            'token' => $order->access_token, 'reason' => 'damaged',
            'items' => [['order_item_id' => $switches->id, 'quantity' => 1]],
            'photos' => $photos,
        ], ['Accept' => 'application/json']);

        // A script called a picture — a real file, because a faked upload
        // reports its type from its name and would prove nothing here.
        $script = tempnam(sys_get_temp_dir(), 'ret');
        file_put_contents($script, '<?php echo 1;');
        $send([new UploadedFile($script, 'box.jpg', null, null, true)])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        @unlink($script);
        // A picture called a script, a vector, a document.
        $send([UploadedFile::fake()->image('box.php')])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        $send([UploadedFile::fake()->createWithContent('box.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>')])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        $send([UploadedFile::fake()->create('box.pdf', 20, 'application/pdf')])->assertUnprocessable()->assertJsonValidationErrors('photos.0');
        $send(array_map(fn ($i) => UploadedFile::fake()->image("p{$i}.jpg"), range(1, 5)))->assertUnprocessable()->assertJsonValidationErrors('photos');

        $this->assertSame(0, OrderReturn::count());
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_the_portal_door_reaches_the_customers_own_order_only(): void
    {
        [$order, $switches] = $this->order();
        [$theirs, $theirLine] = $this->order(['customer_email' => 'someone@else.test']);
        $priya = Customer::create(['name' => 'Priya Das', 'email' => 'priya@acme.co.in', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active]);
        $order->forceFill(['customer_id' => $priya->id])->save();
        $token = $priya->createToken('portal', ['portal'])->plainTextToken;
        $body = fn (OrderItem $line) => ['reason' => 'wrong_item', 'items' => [['order_item_id' => $line->id, 'quantity' => 1]]];

        // No token in the body here: the session is the proof.
        $this->postJson("/api/v1/my/orders/{$order->order_number}/returns", $body($switches))->assertUnauthorized();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson("/api/v1/my/orders/{$order->order_number}/returns", $body($switches))
            ->assertCreated()->assertJsonPath('data.reason', 'wrong_item');
        $this->assertSame($priya->id, OrderReturn::sole()->customer_id);

        // Somebody else's order is a 404, never a 403.
        $this->postJson("/api/v1/my/orders/{$theirs->order_number}/returns", $body($theirLine))->assertNotFound();

        $this->getJson("/api/v1/my/orders/{$order->order_number}")->assertOk()
            ->assertJsonPath('data.returns.0.reference', 'RMA-2026-00001')
            ->assertJsonPath('data.return_policy.open', true);
    }

    // ---- The desk ---------------------------------------------------------

    public function test_only_a_store_manager_reaches_the_returns_desk(): void
    {
        [$order, $switches] = $this->order();
        $return = $this->returnOf($order, $switches);

        foreach ([RoleEnum::ContentManager, RoleEnum::SupportEngineer, RoleEnum::SalesManager] as $role) {
            $this->actingAs($this->staff($role), 'sanctum');
            $this->getJson('/api/v1/admin/store/returns')->assertForbidden();
            $this->getJson("/api/v1/admin/store/returns/{$return->reference}")->assertForbidden();
            $this->postJson("/api/v1/admin/store/returns/{$return->reference}/approve")->assertForbidden();
            app('auth')->forgetGuards();
        }

        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')->getJson('/api/v1/admin/store/returns')->assertOk();
        $this->assertSame(ReturnStatus::Requested, $return->fresh()->status);
    }

    public function test_the_list_leads_with_what_is_waiting_and_filters(): void
    {
        [$order, $switches] = $this->order();
        [$second, $secondLine] = $this->order(['customer_name' => 'Arjun Rao', 'customer_email' => 'arjun@rao.test']);

        $older = $this->returnOf($order, $switches);
        $this->travel(1)->hours();
        $newer = $this->returnOf($second, $secondLine);
        $this->travel(1)->hours();
        $approved = $this->returnOf($order, $switches);

        $manager = $this->staff();
        $this->actingAs($manager, 'sanctum')->postJson("/api/v1/admin/store/returns/{$approved->reference}/approve")->assertOk();

        $list = $this->getJson('/api/v1/admin/store/returns')->assertOk();
        // Waiting first, oldest first; then what is in hand.
        $this->assertSame([$older->reference, $newer->reference, $approved->reference], array_column($list->json('data'), 'reference'));
        $list->assertJsonPath('meta.waiting_count', 2)->assertJsonPath('meta.open_count', 3)
            ->assertJsonPath('data.0.customer_name', 'Priya Das')->assertJsonPath('data.0.items_count', 1);
        // A list row is not the detail shape.
        $this->assertArrayNotHasKey('staff_note', $list->json('data.0'));

        $this->getJson('/api/v1/admin/store/returns?status=approved')->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/store/returns?q=arjun')->assertJsonCount(1, 'data')->assertJsonPath('data.0.reference', $newer->reference);
        $this->getJson('/api/v1/admin/store/returns?q='.$order->order_number)->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/store/returns?q=%25')->assertJsonCount(0, 'data');

        // The shop's dashboard and the order's own screen both say so.
        $this->getJson('/api/v1/admin/store/dashboard')->assertOk()->assertJsonPath('data.attention.returns_requested', 2);
        $this->getJson("/api/v1/admin/store/orders/{$order->order_number}")->assertOk()
            ->assertJsonCount(2, 'data.returns')->assertJsonPath('data.returns.0.admin_path', "/admin/store/returns/{$approved->reference}");
    }

    public function test_a_return_goes_from_request_to_refund_and_touches_stock_and_money_once(): void
    {
        [$order, $switches, , $product] = $this->order();
        $return = $this->returnOf($order, $switches, 2);
        $line = $return->items()->sole();
        $url = "/api/v1/admin/store/returns/{$return->reference}";
        $manager = $this->staff();
        $this->actingAs($manager, 'sanctum');

        $this->getJson($url)->assertOk()
            ->assertJsonPath('data.details', 'The box was crushed and one port is bent.')
            ->assertJsonPath('data.allowed_next.0.value', 'approved')
            ->assertJsonPath('data.items.0.unit_price_paise', 1000000)
            ->assertJsonPath('data.suggested_refund_paise', 2000000)
            ->assertJsonPath('data.order.order_number', $order->order_number);

        // Out of order: the goods cannot arrive before the return is approved.
        $this->postJson("{$url}/receive")->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->postJson("{$url}/refund", ['amount_paise' => 100, 'reference' => 'RF-0'])->assertUnprocessable()->assertJsonValidationErrors('status');
        // A refusal has to say why.
        $this->postJson("{$url}/reject")->assertUnprocessable()->assertJsonValidationErrors('note');

        Setting::where('key', 'store_return_instructions')->firstOrFail()->forceFill(['value' => 'Send to: Returns, Unit 4.'])->save();
        Setting::flushCache();

        $this->postJson("{$url}/approve", ['note' => 'Please keep the original box.'])->assertOk()
            ->assertJsonPath('data.status', 'approved')
            ->assertJsonPath('data.decision_note', 'Please keep the original box.')
            ->assertJsonPath('data.decided_by', $manager->name)
            ->assertJsonPath('data.return_instructions', 'Send to: Returns, Unit 4.');
        Notification::assertSentOnDemand(ReturnStatusChanged::class, fn (ReturnStatusChanged $n) => $n->key === 'return_approved');

        // One of the two arrived, and it goes back on the shelf.
        $this->postJson("{$url}/receive", ['items' => [['id' => $line->id, 'received_quantity' => 3, 'restock' => true]]])
            ->assertUnprocessable()->assertJsonValidationErrors("items.{$line->id}.received_quantity");
        $this->assertSame(5, $product->fresh()->stock);

        $this->postJson("{$url}/receive", ['items' => [['id' => $line->id, 'received_quantity' => 1, 'restock' => true]]])->assertOk()
            ->assertJsonPath('data.status', 'received')
            ->assertJsonPath('data.items.0.received_quantity', 1)
            ->assertJsonPath('data.items.0.restocked_quantity', 1)
            ->assertJsonPath('data.suggested_refund_paise', 1000000);

        $this->assertSame(6, $product->fresh()->stock);
        $movement = StockMovement::where('reason', 'return')->sole();
        $this->assertSame(1, (int) $movement->delta);
        $this->assertSame(6, (int) $movement->balance_after);
        $this->assertSame($order->order_number, $movement->order_number);
        $this->assertStringContainsString($return->reference, (string) $movement->note);

        // A second press puts nothing back.
        $this->postJson("{$url}/receive", ['items' => [['id' => $line->id, 'restock' => true]]])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame(6, $product->fresh()->stock);
        $this->assertSame(1, StockMovement::where('reason', 'return')->count());
        Notification::assertSentOnDemand(ReturnStatusChanged::class, fn (ReturnStatusChanged $n) => $n->key === 'return_goods_received');

        // More than was paid is the refund's own refusal, and nothing moves.
        $this->postJson("{$url}/refund", ['amount_paise' => 2500001, 'reference' => 'RF-1'])
            ->assertUnprocessable()->assertJsonValidationErrors('amount_paise');
        $this->assertSame(ReturnStatus::Received, $return->fresh()->status);
        $this->assertSame(0, $order->payments()->count());

        $this->postJson("{$url}/refund", ['amount_paise' => 1000000, 'reference' => 'rfnd_NQ81', 'note' => 'One unit.'])->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->assertJsonPath('data.refund_paise', 1000000)
            ->assertJsonPath('data.refund_reference', 'rfnd_NQ81')
            ->assertJsonPath('data.allowed_next', []);

        $payment = $order->payments()->sole();
        $this->assertSame('refunded', $payment->status->value);
        $this->assertSame(1000000, (int) $payment->amount_paise);
        $this->assertStringContainsString($return->reference, (string) $payment->note);
        $this->assertSame($payment->id, $return->fresh()->refund_payment_id);
        // A partial refund leaves the order where it was.
        $this->assertSame(OrderStatus::Completed, $order->fresh()->status);
        Notification::assertSentOnDemand(ReturnStatusChanged::class, fn (ReturnStatusChanged $n) => $n->key === 'return_refunded');

        // The end: nothing more may happen to it.
        $this->postJson("{$url}/close")->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->postJson("{$url}/refund", ['amount_paise' => 1, 'reference' => 'RF-2'])->assertUnprocessable()->assertJsonValidationErrors('status');
        $this->assertSame(1, $order->payments()->count());

        // The customer reads the outcome, and never the desk's own note.
        $this->patchJson($url, ['staff_note' => 'Port 3 bent, box fine.'])->assertOk()->assertJsonPath('data.staff_note', 'Port 3 bent, box fine.');
        app('auth')->forgetGuards();
        $mine = $this->read($order)['returns'][0];
        $this->assertSame('refunded', $mine['status']);
        $this->assertSame('Please keep the original box.', $mine['decision_note']);
        $this->assertSame(1000000, $mine['refund_paise']);
        $this->assertArrayNotHasKey('staff_note', $mine);

        // The order's trail tells the story in order.
        $notes = $order->history()->reorder()->orderBy('id')->pluck('note')->implode(' | ');
        $this->assertStringContainsString("Return {$return->reference} approved.", $notes);
        $this->assertStringContainsString('items received, 1 put back in stock.', $notes);
        $this->assertStringContainsString('Partial refund', $notes);
    }

    public function test_receiving_without_restocking_and_for_an_untracked_product_moves_no_stock(): void
    {
        [$order, $switches, , $product] = $this->order();
        $manager = $this->staff();

        // Not ticked: the goods arrived, and nobody decided they are sellable.
        $first = $this->returnOf($order, $switches);
        $this->actingAs($manager, 'sanctum')->postJson("/api/v1/admin/store/returns/{$first->reference}/approve")->assertOk();
        $this->postJson("/api/v1/admin/store/returns/{$first->reference}/receive")->assertOk()
            ->assertJsonPath('data.items.0.received_quantity', 1)->assertJsonPath('data.items.0.restocked_quantity', 0);
        $this->assertSame(5, $product->fresh()->stock);
        app('auth')->forgetGuards();

        // Ticked, on a product that does not count stock: there is no shelf.
        $product->forceFill(['track_stock' => false])->save();
        $second = $this->returnOf($order, $switches);
        $line = $second->items()->sole();
        $this->actingAs($manager, 'sanctum')->postJson("/api/v1/admin/store/returns/{$second->reference}/approve")->assertOk();
        $this->postJson("/api/v1/admin/store/returns/{$second->reference}/receive", ['items' => [['id' => $line->id, 'restock' => true]]])->assertOk()
            ->assertJsonPath('data.items.0.restocked_quantity', 0);

        $this->assertSame(5, $product->fresh()->stock);
        $this->assertSame(0, StockMovement::where('reason', 'return')->count());
    }

    public function test_a_refusal_made_in_error_can_be_reversed_and_a_close_cannot(): void
    {
        [$order, $switches] = $this->order();
        $return = $this->returnOf($order, $switches);
        $url = "/api/v1/admin/store/returns/{$return->reference}";
        $this->actingAs($this->staff(), 'sanctum');

        $this->postJson("{$url}/reject", ['note' => 'Outside the return window.'])->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.allowed_next.0.value', 'approved');
        Notification::assertSentOnDemand(ReturnStatusChanged::class, fn (ReturnStatusChanged $n) => $n->key === 'return_rejected');
        $rejectedAt = $return->fresh()->rejected_at;

        $this->postJson("{$url}/approve")->assertOk()->assertJsonPath('data.status', 'approved');
        // The stamp of the refusal is set on arrival and never cleared.
        $this->assertTrue($rejectedAt->equalTo($return->fresh()->rejected_at));

        Notification::fake();
        $this->postJson("{$url}/close", ['note' => 'Replacement sent instead.'])->assertOk()
            ->assertJsonPath('data.status', 'closed')->assertJsonPath('data.allowed_next', []);
        $this->assertStringContainsString('Closed: Replacement sent instead.', (string) $return->fresh()->staff_note);
        // Closing mails nobody.
        Notification::assertNothingSent();
        $this->postJson("{$url}/approve")->assertUnprocessable()->assertJsonValidationErrors('status');
    }

    public function test_a_photograph_is_streamed_to_staff_as_an_attachment_and_only_through_its_own_return(): void
    {
        [$order, $switches] = $this->order();
        $this->post("/api/v1/orders/{$order->order_number}/returns", [
            'token' => $order->access_token, 'reason' => 'damaged',
            'items' => [['order_item_id' => $switches->id, 'quantity' => 1]],
            'photos' => [UploadedFile::fake()->image('Crushed box.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();
        $return = OrderReturn::sole();
        $photo = $return->photos()->sole();
        $other = $this->returnOf($order, $switches);

        // Nobody without the role, and nobody without a session.
        $this->getJson("/api/v1/admin/store/returns/{$return->reference}/photos/{$photo->id}")->assertUnauthorized();

        $this->actingAs($this->staff(), 'sanctum');
        $this->getJson("/api/v1/admin/store/returns/{$return->reference}")->assertOk()
            ->assertJsonPath('data.photos.0.name', 'Crushed box.jpg')
            ->assertJsonMissingPath('data.photos.0.path');

        $stream = $this->get("/api/v1/admin/store/returns/{$return->reference}/photos/{$photo->id}");
        $stream->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString('attachment', (string) $stream->headers->get('Content-Disposition'));
        $this->assertNotSame('', $stream->streamedContent());

        $this->getJson("/api/v1/admin/store/returns/{$other->reference}/photos/{$photo->id}")->assertNotFound();
        $this->getJson("/api/v1/admin/store/returns/{$return->reference}/photos/999999")->assertNotFound();
    }

    public function test_an_unpaid_order_cannot_be_refunded_through_a_return(): void
    {
        // Cash on delivery, dispatched, the cash not yet banked.
        [$order, $switches] = $this->order(['status' => 'dispatched', 'payment_method' => 'cod', 'paid_at' => null, 'completed_at' => null]);
        $return = $this->returnOf($order, $switches);
        $url = "/api/v1/admin/store/returns/{$return->reference}";
        $this->actingAs($this->staff(), 'sanctum');

        $this->postJson("{$url}/approve")->assertOk()->assertJsonPath('data.order_paid', false);
        $this->postJson("{$url}/receive")->assertOk();
        $this->postJson("{$url}/refund", ['amount_paise' => 1000, 'reference' => 'RF-1'])->assertUnprocessable()->assertJsonValidationErrors('amount_paise');
        $this->assertSame(ReturnStatus::Received, $return->fresh()->status);
        // What is left is to close it.
        $this->postJson("{$url}/close")->assertOk()->assertJsonPath('data.status', 'closed');
    }

    // ---- The reference, and the messages ---------------------------------

    public function test_the_reference_prefix_is_a_setting_and_counts_from_one(): void
    {
        [$order, $switches] = $this->order();
        $this->returnOf($order, $switches);

        $admin = $this->staff(RoleEnum::Admin);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'return_reference_prefix', 'value' => 'no good']]])->assertUnprocessable();
        $this->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'return_reference_prefix', 'value' => 'rtn']]])->assertOk();
        app('auth')->forgetGuards();

        $second = $this->returnOf($order, $switches);
        $this->assertSame('RTN-2026-00001', $second->reference);
        // The first keeps the reference it was given, and still opens.
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/store/returns/RMA-2026-00001')->assertOk();
        $this->getJson('/api/v1/admin/store/returns/RTN-2026-00001')->assertOk();
    }

    public function test_every_return_message_is_in_the_catalogue_and_renders(): void
    {
        [$order, $switches] = $this->order();
        $return = $this->returnOf($order, $switches)->load(['order', 'items.orderItem']);

        foreach (['return_requested', 'return_approved', 'return_rejected', 'return_goods_received', 'return_refunded'] as $key) {
            $this->assertArrayHasKey($key, MessageCatalogue::all(), "{$key} is missing from the catalogue.");
            $mail = (new ReturnStatusChanged($return, $key))->toMail(new AnonymousNotifiable);
            $this->assertStringContainsString($return->reference, (string) $mail->subject);
        }

        $this->assertArrayHasKey('return_received_internal', MessageCatalogue::all());
        $mail = (new ReturnRequestReceived($return))->toMail(new AnonymousNotifiable);
        $this->assertStringContainsString($order->order_number, (string) $mail->subject);
        $this->assertStringContainsString("/admin/store/returns/{$return->reference}", (string) $mail->actionUrl);

        // The customer's words are never mailed back: the receipt is fixed content.
        $receipt = (new ReturnStatusChanged($return, 'return_requested'))->toMail(new AnonymousNotifiable);
        $rendered = implode(' ', array_map('strval', [...$receipt->introLines, ...$receipt->outroLines]));
        $this->assertStringNotContainsString('crushed', $rendered);
    }

    public function test_the_switch_is_public_and_the_return_address_is_not(): void
    {
        Setting::where('key', 'store_return_instructions')->firstOrFail()->forceFill(['value' => 'Send to: Returns Desk, 4 Depot Lane.'])->save();
        Setting::flushCache();

        $settings = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        // The order page decides nothing from it — `return_policy` does — but
        // the product page may say returns are arranged online.
        $this->assertArrayHasKey('store_returns_enabled', $settings);
        // Where goods are sent back to is said to a customer whose return was
        // approved, in that email, and to nobody who asks `/settings`.
        $this->assertArrayNotHasKey('store_return_instructions', $settings);
    }
}
