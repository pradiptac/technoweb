<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\CannedReply;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Saved replies for the support desk.
 *
 * What is pinned: the CRUD is `role:support_engineer` and a content manager
 * is refused; and the per-ticket read hands back every reply with its
 * placeholders **already filled for that ticket** — the console inserts text
 * and never learns the placeholder rules, so the API is the only place the
 * fill happens and this is the only place it is tested. An unknown
 * placeholder is stripped rather than left showing its braces, the rule
 * `Placeholders::strip()` already keeps for the email templates.
 */
class CannedReplyTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role = RoleEnum::SupportEngineer, string $email = 'engineer@example.test'): User
    {
        $user = User::create([
            'name' => 'Priya Sharma', 'email' => $email,
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user->load('roles');
    }

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'company' => 'Meridian Foods',
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(Customer $customer): Ticket
    {
        return $customer->tickets()->create([
            'subject' => 'Switch keeps dropping',
            'description' => 'The uplink drops every afternoon.',
            'priority' => 'normal',
            'status' => TicketStatus::Open,
        ]);
    }

    public function test_a_support_engineer_manages_saved_replies(): void
    {
        $staff = $this->staff();

        $created = $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/canned-replies', [
                'title' => 'Firmware rollback',
                'body' => "Hello {{first_name}},\n\nWe have rolled the switch back a version.",
                'sort_order' => 2,
            ])
            ->assertCreated()
            ->assertJsonPath('data.title', 'Firmware rollback')
            ->assertJsonPath('data.sort_order', 2)
            ->assertJsonPath('data.created_by.name', 'Priya Sharma');

        $id = $created->json('data.id');

        $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/canned-replies')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $id)
            // The chips the management screen shows come from the API, never
            // from a list typed into TypeScript.
            ->assertJsonPath('meta.placeholders.0.name', 'customer_name')
            ->assertJsonStructure(['meta' => ['placeholders' => [['name', 'about']]]]);

        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/canned-replies/{$id}")
            ->assertOk()
            ->assertJsonPath('data.body', "Hello {{first_name}},\n\nWe have rolled the switch back a version.");

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/canned-replies/{$id}", ['title' => 'Firmware rolled back'])
            ->assertOk()
            ->assertJsonPath('data.title', 'Firmware rolled back')
            // A PATCH mentioning only the title leaves the body alone.
            ->assertJsonPath('data.body', "Hello {{first_name}},\n\nWe have rolled the switch back a version.");

        $this->actingAs($staff, 'sanctum')
            ->deleteJson("/api/v1/admin/canned-replies/{$id}")
            ->assertOk();

        $this->assertSame(0, CannedReply::count());
    }

    public function test_a_blank_title_or_body_is_refused(): void
    {
        $this->actingAs($this->staff(), 'sanctum')
            ->postJson('/api/v1/admin/canned-replies', ['title' => '', 'body' => ''])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['title', 'body']);
    }

    public function test_a_content_manager_is_refused(): void
    {
        $manager = $this->staff(RoleEnum::ContentManager, 'editor@example.test');
        $reply = CannedReply::create(['title' => 'Thanks', 'body' => 'Thanks for writing in.']);

        $this->actingAs($manager, 'sanctum')->getJson('/api/v1/admin/canned-replies')->assertForbidden();
        $this->actingAs($manager, 'sanctum')->postJson('/api/v1/admin/canned-replies', ['title' => 'x', 'body' => 'y'])->assertForbidden();
        $this->actingAs($manager, 'sanctum')->deleteJson("/api/v1/admin/canned-replies/{$reply->id}")->assertForbidden();

        $this->assertSame(1, CannedReply::count());
    }

    public function test_the_per_ticket_read_fills_every_placeholder_and_strips_the_unknown(): void
    {
        $staff = $this->staff();
        $ticket = $this->ticket($this->customer());

        CannedReply::create([
            'title' => 'Everything',
            'body' => 'Dear {{customer_name}} ({{ first_name }}) of {{company}}: re {{reference}} "{{subject}}". — {{agent_name}} {{no_such_thing}}!',
            'sort_order' => 5,
        ]);
        CannedReply::create(['title' => 'First', 'body' => 'Hi {{first_name}}.', 'sort_order' => 1]);

        $response = $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$ticket->reference}/canned-replies")
            ->assertOk()
            ->assertJsonCount(2, 'data');

        // Sort order, not creation order.
        $this->assertSame('First', $response->json('data.0.title'));
        $this->assertSame('Hi Neil.', $response->json('data.0.body'));

        $this->assertSame(
            'Dear Neil Basu (Neil) of Meridian Foods: re '.$ticket->reference.' "Switch keeps dropping". — Priya Sharma !',
            $response->json('data.1.body'),
        );
        // The braces are gone from the filled copy, and the stored body is untouched.
        $this->assertStringNotContainsString('{{', $response->json('data.1.body'));
        $this->assertStringContainsString('{{no_such_thing}}', CannedReply::where('title', 'Everything')->sole()->body);
    }

    public function test_a_customer_with_no_company_fills_a_blank_not_a_placeholder(): void
    {
        $staff = $this->staff();
        $customer = $this->customer();
        $customer->update(['company' => null]);
        $ticket = $this->ticket($customer);
        CannedReply::create(['title' => 'Co', 'body' => 'At {{company}}, ok.']);

        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$ticket->reference}/canned-replies")
            ->assertOk()
            ->assertJsonPath('data.0.body', 'At , ok.');
    }
}
