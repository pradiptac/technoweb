<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Notifications\EnquiryReceived;
use App\Notifications\TicketAcknowledged;
use App\Notifications\TicketCreated;
use App\Notifications\TicketReplied;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * The notification boundaries.
 *
 * The one that matters is the last group: an internal note must never reach a
 * customer. Everything else here is a convenience; that one is a disclosure
 * bug waiting to happen, and it is guarded at the call site rather than inside
 * the notification, so it needs a test that exercises the call site.
 */
class TicketNotificationTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu',
            'email' => 'neil@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Support Engineer',
            'email' => 'engineer@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        // The admin reply route is behind role:support_engineer. Without this
        // the request is a 403 and the test passes for the wrong reason.
        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value],
            ['name' => RoleEnum::SupportEngineer->label()],
        );
        $user->roles()->attach($role);

        return $user->load('roles');
    }

    private function ticket(Customer $customer): Ticket
    {
        $category = TicketCategory::create(['name' => 'Network', 'slug' => 'network', 'is_active' => true]);

        $ticket = $customer->tickets()->make([
            'subject' => 'Switch keeps dropping',
            'description' => 'The switch drops its uplink every afternoon, and it started after the last firmware update.',
            'ticket_category_id' => $category->id,
            'priority' => 'normal',
            'status' => 'open',
        ]);
        $ticket->save();

        return $ticket;
    }

    public function test_raising_a_ticket_tells_the_desk_and_the_customer(): void
    {
        Notification::fake();
        Setting::create(['group' => 'contact', 'key' => 'support_email', 'value' => 'desk@example.test', 'type' => 'string']);

        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'Switch keeps dropping',
                'description' => 'It drops every afternoon.',
                'ticket_category_id' => TicketCategory::create(['name' => 'Network', 'slug' => 'network', 'is_active' => true])->id,
                'priority' => 'normal',
            ])
            ->assertCreated();

        Notification::assertSentOnDemand(
            TicketCreated::class,
            fn ($notification, $channels, $notifiable) => $notifiable->routes['mail'] === 'desk@example.test',
        );
        Notification::assertSentTo($customer, TicketAcknowledged::class);
    }

    public function test_the_support_address_comes_from_settings_not_config(): void
    {
        Notification::fake();
        Setting::create(['group' => 'contact', 'key' => 'support_email', 'value' => 'moved@example.test', 'type' => 'string']);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'Anything',
                'description' => 'The uplink drops for about a minute every afternoon, and it started last week.',
                'ticket_category_id' => TicketCategory::create(['name' => 'Other', 'slug' => 'other', 'is_active' => true])->id,
                'priority' => 'low',
            ])
            ->assertCreated();

        Notification::assertSentOnDemand(
            TicketCreated::class,
            fn ($n, $channels, $notifiable) => $notifiable->routes['mail'] === 'moved@example.test',
        );
    }

    public function test_a_customer_reply_notifies_the_desk(): void
    {
        Notification::fake();
        Setting::create(['group' => 'contact', 'key' => 'support_email', 'value' => 'desk@example.test', 'type' => 'string']);

        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($customer, 'sanctum')
            ->postJson("/api/v1/tickets/{$ticket->reference}/messages", ['body' => 'Still happening.'])
            ->assertCreated();

        Notification::assertSentOnDemand(TicketReplied::class);
    }

    public function test_a_customer_visible_staff_reply_reaches_the_customer(): void
    {
        Notification::fake();

        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", [
                'body' => 'We have replaced the SFP.',
                'is_internal' => false,
            ])
            ->assertCreated();

        Notification::assertSentTo(
            $customer,
            TicketReplied::class,
            fn (TicketReplied $n) => $n->toCustomer === true,
        );
    }

    /** The one that would be a disclosure bug. */
    public function test_an_internal_note_never_reaches_the_customer(): void
    {
        Notification::fake();

        $customer = $this->customer();
        $ticket = $this->ticket($customer);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", [
                'body' => 'Customer is on an old contract — do not mention the upgrade price.',
                'is_internal' => true,
            ])
            ->assertCreated();

        Notification::assertNothingSentTo($customer);
    }

    public function test_an_enquiry_notifies_the_sales_inbox_from_settings(): void
    {
        Notification::fake();
        Setting::create(['group' => 'contact', 'key' => 'sales_email', 'value' => 'sales@example.test', 'type' => 'string']);

        $this->postJson('/api/v1/enquiries', [
            'name' => 'Priya Shah',
            'email' => 'priya@example.test',
            'message' => 'We need forty access points.',
        ])->assertCreated();

        Notification::assertSentOnDemand(
            EnquiryReceived::class,
            fn ($n, $channels, $notifiable) => $notifiable->routes['mail'] === 'sales@example.test',
        );
    }

    /**
     * A ticket that is saved must report success even if mail is broken.
     * Telling a customer their ticket failed when it is in the database is
     * worse than losing the notification — they will simply send it again.
     */
    public function test_a_mail_failure_does_not_fail_the_request(): void
    {
        Setting::create(['group' => 'contact', 'key' => 'support_email', 'value' => 'desk@example.test', 'type' => 'string']);

        // No Notification::fake(): the array mailer is swapped for one that
        // throws, so the send genuinely fails inside Notifier.
        config(['mail.default' => 'smtp', 'mail.mailers.smtp.host' => '127.0.0.1', 'mail.mailers.smtp.port' => 1]);

        $this->actingAs($this->customer(), 'sanctum')
            ->postJson('/api/v1/tickets', [
                'subject' => 'Mail is down',
                'description' => 'Mail is down, but this ticket should still be created and returned as a 201.',
                'ticket_category_id' => TicketCategory::create(['name' => 'Other', 'slug' => 'other', 'is_active' => true])->id,
                'priority' => 'normal',
            ])
            ->assertCreated();

        $this->assertDatabaseHas('tickets', ['subject' => 'Mail is down']);
    }
}
