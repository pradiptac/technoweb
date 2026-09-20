<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A customer's verdict on a staff reply: one to five stars, and a report.
 *
 * Both are per message and reach the desk on the same resource the console
 * already reads; the queue filters on `?reported=1`. What is pinned here is
 * the boundary rather than the arithmetic: only a *visible staff reply on
 * the customer's own ticket* can be rated or reported, and every other
 * message — their own, an internal note, another customer's — answers 404,
 * because a 403 would confirm what the customer endpoint must not.
 */
class TicketReplyVerdictTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
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

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu', 'email' => $email,
            'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
    }

    private function ticket(Customer $customer): Ticket
    {
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);
        $ticket = $customer->tickets()->make([
            'subject' => 'A switch keeps rebooting',
            'description' => 'It drops every device on it twice a day.',
            'ticket_category_id' => $category->id,
            'status' => TicketStatus::InProgress,
            'priority' => 'normal',
        ]);
        $ticket->save();

        return $ticket->fresh();
    }

    private function reply(Ticket $ticket, User $staff, bool $internal = false): TicketMessage
    {
        $message = $ticket->messages()->make(['body' => 'We will check and update you.', 'is_internal' => $internal]);
        $message->author()->associate($staff);
        $message->save();

        return $message;
    }

    public function test_a_customer_rates_a_staff_reply_and_may_change_their_mind(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $reply = $this->reply($ticket, $this->staff());

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/rating", ['rating' => 4])
            ->assertOk()
            ->assertJsonPath('data.rating', 4);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/rating", ['rating' => 2])
            ->assertOk();

        $this->assertSame(2, $reply->fresh()->rating);
        $this->assertNotNull($reply->fresh()->rated_at);

        // The thread carries it back, so the stars are lit on the next read.
        $this->actingAs($customer, 'sanctum')
            ->getJson("/api/v1/tickets/{$ticket->reference}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.rating', 2);
    }

    public function test_a_rating_outside_one_to_five_is_refused(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $reply = $this->reply($ticket, $this->staff());

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/rating", ['rating' => 6])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('rating');
    }

    public function test_a_report_keeps_its_first_timestamp_when_re_worded(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $reply = $this->reply($ticket, $this->staff());

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/report", ['reason' => 'This did not answer my question.'])
            ->assertOk()
            ->assertJsonPath('data.report_reason', 'This did not answer my question.');

        $first = $reply->fresh()->reported_at;
        $this->travel(1)->hours();

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/report", ['reason' => 'Still unanswered, and now the switch is down.'])
            ->assertOk();

        $fresh = $reply->fresh();
        $this->assertSame('Still unanswered, and now the switch is down.', $fresh->report_reason);
        $this->assertTrue($first->equalTo($fresh->reported_at), 'a re-worded report keeps when it was first raised');
    }

    public function test_only_a_visible_staff_reply_on_the_customers_own_ticket_can_be_judged(): void
    {
        $customer = $this->customer();
        $ticket = $this->ticket($customer);
        $staff = $this->staff();
        $reply = $this->reply($ticket, $staff);

        // Their own message.
        $own = $ticket->messages()->make(['body' => 'Any news?', 'is_internal' => false]);
        $own->author()->associate($customer);
        $own->save();
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$own->id}/rating", ['rating' => 5])
            ->assertNotFound();

        // An internal note — its existence is not confirmed either way.
        $note = $this->reply($ticket, $staff, internal: true);
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$note->id}/report", ['reason' => 'I can see this?'])
            ->assertNotFound();

        // Another customer's ticket, by a customer who is not its owner.
        $other = $this->customer('other@example.test');
        $this->actingAs($other, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$reply->id}/rating", ['rating' => 1])
            ->assertNotFound();

        // A reply that belongs to a different ticket, named under this one.
        $second = $this->ticket($customer);
        $elsewhere = $this->reply($second, $staff);
        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages/{$elsewhere->id}/rating", ['rating' => 3])
            ->assertNotFound();

        $this->assertNull($reply->fresh()->rating);
        $this->assertNull($own->fresh()->rating);
    }

    public function test_the_queue_filters_reported_tickets_and_the_desk_reads_the_reason(): void
    {
        $customer = $this->customer();
        $staff = $this->staff();
        $reported = $this->ticket($customer);
        $quiet = $this->ticket($customer);
        $reply = $this->reply($reported, $staff);
        $this->reply($quiet, $staff);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$reported->reference}/messages/{$reply->id}/report", ['reason' => 'Wrong server.'])
            ->assertOk();

        $rows = $this->actingAs($staff, 'sanctum')->getJson('/api/v1/admin/tickets?reported=1')->assertOk()->json('data');
        $this->assertSame([$reported->reference], array_column($rows, 'reference'));

        $this->actingAs($staff, 'sanctum')
            ->getJson("/api/v1/admin/tickets/{$reported->reference}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.report_reason', 'Wrong server.');
    }
}
