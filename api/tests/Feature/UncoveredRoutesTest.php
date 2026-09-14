<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\CaseStudy;
use App\Models\ClientError;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Role;
use App\Models\StoreProduct;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\TestCase;

/**
 * The route groups the 2026-09-14 review found no test naming: the case
 * study CRUD, the browser's error reporter and its console, the
 * newsletter import's dry run, and a customer's own orders. Each pins the
 * one behaviour that would go wrong silently — a case study's results being
 * dropped on the round trip, a report with an absolute URL being stored as
 * typed, a spreadsheet's counts, and one customer reading another's order.
 */
class UncoveredRoutesTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::create([
            'name' => 'Staff', 'email' => $email,
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => $role->value], ['name' => $role->label()],
        ));

        return $user;
    }

    // ------------------------------------------------------ case studies

    public function test_a_case_study_round_trips_its_results_and_publishes_only_when_told(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'cm-cases@example.test');

        $created = $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/case-studies', [
                'title' => 'Harbour Dental network refresh',
                'slug' => 'harbour-dental-network-refresh',
                'client_name' => 'Harbour Dental',
                'summary' => 'Three surgeries, one network.',
                'body' => '<p>What was done.</p>',
                'status' => 'draft',
                'results' => [
                    ['value' => '99.98%', 'label' => 'Uptime since'],
                    ['value' => '3', 'label' => 'Sites'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.results.1.label', 'Sites');

        $id = $created->json('data.id');

        // A draft is not public.
        $this->getJson('/api/v1/case-studies/harbour-dental-network-refresh')->assertNotFound();

        $this->actingAs($editor, 'sanctum')
            ->patchJson("/api/v1/admin/case-studies/{$id}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('data.status', 'published');

        // Published, it is — with the results in the order they were entered,
        // which a JSON column does not promise on its own.
        $this->getJson('/api/v1/case-studies/harbour-dental-network-refresh')
            ->assertOk()
            ->assertJsonPath('data.results.0.value', '99.98%')
            ->assertJsonPath('data.results.1.value', '3');

        $this->actingAs($editor, 'sanctum')
            ->deleteJson("/api/v1/admin/case-studies/{$id}")
            ->assertOk();

        $this->assertNull(CaseStudy::find($id));
    }

    public function test_a_result_without_a_label_is_refused_naming_the_row(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'cm-cases2@example.test');

        $this->actingAs($editor, 'sanctum')
            ->postJson('/api/v1/admin/case-studies', [
                'title' => 'Unlabelled', 'slug' => 'unlabelled', 'client_name' => 'X', 'status' => 'draft',
                'results' => [['value' => '42']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['results.0.label']);
    }

    // ------------------------------------------------------ client errors

    public function test_a_browser_report_is_grouped_and_its_path_is_never_an_absolute_url(): void
    {
        $body = ['area' => 'admin', 'message' => 'Cannot read properties of undefined', 'digest' => 'abc123',
            'path' => 'https://evil.example/phish?x=1'];

        $this->postJson('/api/v1/client-errors', $body)->assertNoContent();
        $this->postJson('/api/v1/client-errors', $body)->assertNoContent();

        $row = ClientError::sole();
        $this->assertSame(2, $row->occurrences);
        // Only the path and query survive; the host somebody else chose does not.
        $this->assertSame('/phish?x=1', $row->path);
        $this->assertSame('admin', $row->area);

        // An unknown area is filed under `site` rather than stored as typed,
        // and an empty message is dropped rather than making a blank row.
        $this->postJson('/api/v1/client-errors', ['area' => 'nope', 'message' => 'x'])->assertNoContent();
        $this->postJson('/api/v1/client-errors', ['message' => '   '])->assertNoContent();
        $this->assertSame(2, ClientError::count());
        $this->assertSame('site', ClientError::where('message', 'x')->sole()->area);
    }

    public function test_resolving_is_a_tick_that_the_next_report_reopens(): void
    {
        $admin = $this->staff(RoleEnum::Admin, 'admin-errors@example.test');

        $this->postJson('/api/v1/client-errors', ['message' => 'Boom', 'area' => 'site'])->assertNoContent();
        $row = ClientError::sole();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/client-errors')
            ->assertOk()
            ->assertJsonPath('meta.unresolved', 1)
            ->assertJsonPath('data.0.message', 'Boom');

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/client-errors/{$row->id}/resolve")
            ->assertOk();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/client-errors')
            ->assertOk()
            ->assertJsonPath('meta.unresolved', 0)
            ->assertJsonCount(0, 'data');

        // The same bug again clears the tick.
        $this->postJson('/api/v1/client-errors', ['message' => 'Boom', 'area' => 'site'])->assertNoContent();

        $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/admin/client-errors')
            ->assertOk()
            ->assertJsonPath('meta.unresolved', 1);

        // Reading them is an administrator's job.
        $support = $this->staff(RoleEnum::SupportEngineer, 'support-errors@example.test');
        $this->actingAs($support, 'sanctum')->getJson('/api/v1/admin/client-errors')->assertForbidden();
    }

    // ------------------------------------------------------ newsletter import

    public function test_the_import_dry_run_counts_rows_and_writes_no_subscriber(): void
    {
        $manager = $this->staff(RoleEnum::CampaignManager, 'campaigns-import@example.test');

        $csv = "Email,First name,Company\n"
            ."one@example.test,One,Acme\n"
            ."two@example.test,Two,Beta\n"
            ."one@example.test,Again,Acme\n"
            ."not-an-address,Three,Gamma\n";

        $response = $this->actingAs($manager, 'sanctum')
            ->post('/api/v1/admin/newsletter/imports/analyse', [
                'file' => UploadedFile::fake()->createWithContent('list.csv', $csv),
            ], ['Accept' => 'application/json'])
            ->assertOk()
            // The mapping is by column index: the email column was found
            // from the heading, and it is the first one.
            ->assertJsonPath('data.mapping.email', 0)
            ->assertJsonPath('data.counts.valid', 2)
            ->assertJsonPath('data.counts.duplicates', 1)
            ->assertJsonPath('data.counts.invalid', 1);

        $this->assertStringStartsWith('newsletter-imports/', $response->json('data.file'));
        $this->assertDatabaseCount('newsletter_subscribers', 0);
    }

    public function test_a_legacy_xls_is_named_and_refused(): void
    {
        $manager = $this->staff(RoleEnum::CampaignManager, 'campaigns-xls@example.test');

        // The OLE2 magic bytes a binary .xls starts with, saved as .csv to get
        // past the extension rule — which is exactly the file this check is for.
        $ole = "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1".str_repeat("\0", 64);

        $this->actingAs($manager, 'sanctum')
            ->post('/api/v1/admin/newsletter/imports/analyse', [
                'file' => UploadedFile::fake()->createWithContent('old.csv', $ole),
            ], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['file']);
    }

    // ------------------------------------------------------ my orders

    public function test_a_customer_sees_their_own_orders_and_nobody_elses(): void
    {
        $mine = Customer::create(['name' => 'Mine', 'email' => 'mine@example.test', 'password' => bcrypt('x'), 'status' => CustomerStatus::Active]);
        $other = Customer::create(['name' => 'Other', 'email' => 'other@example.test', 'password' => bcrypt('x'), 'status' => CustomerStatus::Active]);

        $product = StoreProduct::create([
            'name' => 'A switch', 'slug' => 'a-switch', 'type' => ProductType::Physical,
            'status' => PublishStatus::Published, 'price_paise' => 118000, 'track_stock' => true, 'stock' => 5,
        ]);

        $make = function (Customer $customer) use ($product): Order {
            $order = Order::create([
                'customer_id' => $customer->id, 'status' => OrderStatus::Paid,
                'subtotal_paise' => 118000, 'taxable_paise' => 100000, 'gst_paise' => 18000, 'total_paise' => 118000,
                'customer_name' => $customer->name, 'customer_email' => $customer->email,
                'placed_at' => now(), 'paid_at' => now(),
            ]);
            $order->items()->create([
                'store_product_id' => $product->id, 'name' => $product->name, 'sku' => null,
                'type' => ProductType::Physical, 'quantity' => 1,
                'unit_price_paise' => 118000, 'line_total_paise' => 118000, 'returnable' => true,
            ]);

            return $order;
        };

        $ownOrder = $make($mine);
        $theirs = $make($other);

        $this->actingAs($mine, 'sanctum')
            ->getJson('/api/v1/my/orders')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.order_number', $ownOrder->order_number);

        $this->actingAs($mine, 'sanctum')
            ->getJson("/api/v1/my/orders/{$ownOrder->order_number}")
            ->assertOk()
            ->assertJsonPath('data.order_number', $ownOrder->order_number);

        // 404, never 403 — a 403 confirms the order exists.
        $this->actingAs($mine, 'sanctum')
            ->getJson("/api/v1/my/orders/{$theirs->order_number}")
            ->assertNotFound();
    }

    public function test_my_orders_needs_a_session(): void
    {
        // Its own test: `actingAs` sticks for the rest of a test method, so an
        // unauthenticated call after one would be authenticated after all.
        $this->getJson('/api/v1/my/orders')->assertUnauthorized();
    }
}
