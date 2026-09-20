<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\KnowledgeArticle;
use App\Models\KnowledgeCategory;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The four endpoints the UX audit of 2026-09-15 asked the API for: bulk
 * ticket changes, the knowledge base's "was this helpful", the ticket trail
 * on the portal, `?since=` on the dashboard, and the console's search.
 *
 * Each pins the rule that makes the feature safe rather than the happy
 * path alone: a refused move in a batch leaves the rest applied; a vote is
 * 204 whatever happened; the trail a customer sees carries no note; the
 * search offers nothing the caller cannot open.
 */
class ConsoleInteractivityTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum ...$roles): User
    {
        static $n = 0;
        $user = User::create([
            'name' => 'Staff '.(++$n),
            'email' => "staff{$n}@example.test",
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        foreach ($roles as $role) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user->load('roles');
    }

    private function customer(): Customer
    {
        return Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu',
            'company' => 'Meridian Foods',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(string $subject, TicketStatus $status = TicketStatus::Open): Ticket
    {
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);

        $ticket = $this->customer()->tickets()->make([
            'subject' => $subject,
            'description' => 'Enough words to be a description.',
            'ticket_category_id' => $category->id,
            'status' => $status,
            'priority' => 'normal',
        ]);
        $ticket->save();

        return $ticket->fresh();
    }

    public function test_bulk_applies_to_every_ticket_it_can_and_names_the_ones_it_cannot(): void
    {
        $staff = $this->staff(RoleEnum::SupportEngineer);
        $open = $this->ticket('Open one');
        $another = $this->ticket('Open two');
        $closed = $this->ticket('Closed already', TicketStatus::Closed);

        $response = $this->actingAs($staff, 'sanctum')
            ->postJson('/api/v1/admin/tickets/bulk', [
                'ids' => [$open->id, $another->id, $closed->id],
                'assigned_to' => $staff->id,
                'status' => TicketStatus::Resolved->value,
            ])
            ->assertOk();

        // Closed → Resolved is not a legal move (only a reopen is); the other
        // two went through.
        $this->assertEqualsCanonicalizing([$open->reference, $another->reference], $response->json('updated'));
        $this->assertSame($closed->reference, $response->json('refused.0.reference'));
        $this->assertStringContainsString('cannot move from Closed', $response->json('refused.0.message'));

        $this->assertSame(TicketStatus::Resolved, $open->fresh()->status);
        $this->assertSame($staff->id, $open->fresh()->assigned_to);
        $this->assertSame(TicketStatus::Closed, $closed->fresh()->status, 'the refused one is untouched');

        // Each applied change is on the trail, per ticket, like a single update.
        $this->assertSame(2, $open->events()->whereIn('type', ['assigned', 'status_changed'])->count());
    }

    public function test_a_helpful_vote_increments_and_answers_204_always(): void
    {
        $category = KnowledgeCategory::create(['name' => 'Guides', 'slug' => 'guides']);
        $article = KnowledgeArticle::create([
            'title' => 'Reset a switch', 'slug' => 'reset-a-switch', 'body' => '<p>Hold the button.</p>',
            'knowledge_category_id' => $category->id, 'status' => 'published', 'published_at' => now(),
        ]);
        $draft = KnowledgeArticle::create([
            'title' => 'Not yet', 'slug' => 'not-yet', 'body' => '<p>Draft.</p>',
            'knowledge_category_id' => $category->id, 'status' => 'draft',
        ]);

        $this->postJson('/api/v1/knowledge-base/reset-a-switch/helpful')->assertNoContent();
        $this->postJson('/api/v1/knowledge-base/reset-a-switch/helpful')->assertNoContent();
        $this->assertSame(2, $article->fresh()->helpful_count);

        // A draft answers exactly the same and counts nothing: the response
        // must not tell a published slug from an unpublished one.
        $this->postJson('/api/v1/knowledge-base/not-yet/helpful')->assertNoContent();
        $this->assertSame(0, $draft->fresh()->helpful_count);
    }

    public function test_the_portal_sees_the_ticket_trail_and_no_note_in_it(): void
    {
        $staff = $this->staff(RoleEnum::SupportEngineer);
        $ticket = $this->ticket('Uplink drops');

        $this->actingAs($staff, 'sanctum')
            ->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $staff->id])
            ->assertOk();
        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => 'Internal: SFP batch again', 'is_internal' => true])
            ->assertCreated();

        $trail = $this->actingAs($this->customer(), 'sanctum')
            ->getJson("/api/v1/tickets/{$ticket->reference}")
            ->assertOk()
            ->json('data.events');

        // 'created' is written by the customer's own store path, which this
        // fixture bypasses; the assignment and the status it implies are the
        // trail the desk's PATCH left.
        $this->assertSame(['assigned', 'status_changed'], array_column($trail, 'type'));
        $this->assertSame($staff->name, $trail[0]['by']);
        $this->assertStringNotContainsString('SFP', json_encode($trail), 'an internal note is never an event');
    }

    public function test_the_dashboard_counts_what_arrived_since(): void
    {
        $staff = $this->staff(RoleEnum::SupportEngineer);
        $old = $this->ticket('Old');
        $old->forceFill(['created_at' => now()->subDays(2)])->save();
        $this->ticket('New');

        $since = now()->subHour()->toIso8601String();

        $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/dashboard?since='.urlencode($since))
            ->assertOk()
            ->assertJsonPath('data.new_since.tickets', 1)
            // A support engineer cannot open the leads screen, so the leads
            // figure is an absence, not a zero.
            ->assertJsonPath('data.new_since.leads', null);

        $this->actingAs($staff, 'sanctum')
            ->getJson('/api/v1/admin/dashboard')
            ->assertOk()
            ->assertJsonPath('data.new_since', null);
    }

    public function test_new_since_is_light_and_nulls_what_the_role_cannot_open(): void
    {
        $this->ticket('New');
        $since = now()->subHour()->toIso8601String();

        // A support engineer sees tickets and enquiries, and no leads figure.
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/new-since?since='.urlencode($since))
            ->assertOk()
            ->assertJsonPath('data.tickets', 1)
            ->assertJsonPath('data.enquiries', 0)
            ->assertJsonPath('data.leads', null);

        // A content manager can open neither queue: every figure is an absence.
        $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum')
            ->getJson('/api/v1/admin/new-since?since='.urlencode($since))
            ->assertOk()
            ->assertJsonPath('data.tickets', null)
            ->assertJsonPath('data.leads', null);

        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/new-since')
            ->assertStatus(422);
    }

    public function test_the_console_search_offers_only_what_the_caller_can_open(): void
    {
        $this->ticket('Boardroom access point');

        $support = $this->staff(RoleEnum::SupportEngineer);
        $groups = $this->actingAs($support, 'sanctum')
            ->getJson('/api/v1/admin/search?q=boardroom')
            ->assertOk()
            ->json('data');

        $this->assertSame(['ticket'], array_column($groups, 'type'));
        $this->assertSame('Boardroom access point', $groups[0]['items'][0]['label']);
        $this->assertStringStartsWith('/admin/tickets/TW-', $groups[0]['items'][0]['admin_path']);

        // A content manager cannot open tickets, and the term matches nothing
        // they may open — so the answer is empty, not a group they cannot use.
        $content = $this->staff(RoleEnum::ContentManager);
        $this->actingAs($content, 'sanctum')
            ->getJson('/api/v1/admin/search?q=boardroom')
            ->assertOk()
            ->assertExactJson(['data' => []]);

        // Under two characters answers nothing rather than most of the table.
        $this->actingAs($support, 'sanctum')
            ->getJson('/api/v1/admin/search?q=b')
            ->assertOk()
            ->assertExactJson(['data' => []]);
    }
}
