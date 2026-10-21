<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\OrderStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\TicketStatus;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Order;
use App\Models\Role;
use App\Models\StaffNotification;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Support\Notifications\NoteKinds;
use App\Support\Revisions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use ReflectionClassConstant;
use Tests\TestCase;

/**
 * Mentions (C2, docs/notifications.md): who the picker offers, and who a
 * ticket, lead or order note tells. Staff sign in with a real Bearer header.
 */
class MentionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function staff(RoleEnum $role, string $tag = 'a'): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value."-mention-{$tag}@example.test"],
            ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user->load('roles');
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = $this->staff($role, $tag);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function ticket(): Ticket
    {
        $customer = Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);
        $ticket = $customer->tickets()->make([
            'subject' => 'A switch keeps rebooting', 'description' => 'It drops every device on it twice a day.',
            'ticket_category_id' => $category->id, 'status' => TicketStatus::Open, 'priority' => 'normal',
        ]);
        $ticket->save();

        return $ticket->fresh();
    }

    private function lead(): Lead
    {
        return Lead::create([
            'name' => 'Old lead', 'email' => 'buyer@meridianfoods.in', 'message' => 'A quotation for 24-port switches, please.',
            'source_path' => '/contact', 'source_type' => 'enquiry', 'source_id' => 1,
            'channel' => 'enquiry', 'status' => 'new', 'score' => 0, 'score_band' => 'cold', 'score_reasons' => [],
        ]);
    }

    private function order(): Order
    {
        return Order::create([
            'status' => OrderStatus::Confirmed, 'subtotal_paise' => 1180000, 'taxable_paise' => 1000000,
            'gst_paise' => 180000, 'total_paise' => 1180000,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test', 'placed_at' => now(),
        ]);
    }

    public function test_note_kinds_has_a_path_for_every_kind_page_history_knows(): void
    {
        $this->assertEqualsCanonicalizing(Revisions::aliases(), array_keys((new ReflectionClassConstant(NoteKinds::class, 'PATHS'))->getValue()));
    }

    public function test_the_picker_lists_only_people_who_can_open_the_scope(): void
    {
        $this->staff(RoleEnum::SupportEngineer, 'Asha');
        $this->staff(RoleEnum::ContentManager, 'Ashok');
        $this->staff(RoleEnum::Admin, 'Ashwin');

        $names = $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/mentionable?scope=ticket&q=Ash')
            ->assertOk()->json('data.*.name');

        $this->assertContains('Support_engineer Asha', $names);
        $this->assertContains('Admin Ashwin', $names);
        $this->assertNotContains('Content_manager Ashok', $names);
    }

    public function test_an_unknown_scope_is_a_422(): void
    {
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/mentionable?scope=planet&q=a')->assertStatus(422);
    }

    public function test_an_internal_ticket_note_notifies_and_a_customer_reply_never_does(): void
    {
        $priya = $this->staff(RoleEnum::SupportEngineer, 'priya');
        $ticket = $this->ticket();
        $body = 'Can you take this, @'.$priya->name.'?';

        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => false, 'mentions' => [$priya->id]])->assertCreated();
        $this->assertSame(0, StaffNotification::count());

        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => true, 'mentions' => [$priya->id]])->assertCreated();
        $row = StaffNotification::sole();
        $this->assertSame('mention_ticket', $row->kind->value);
        $this->assertSame("Support_engineer me mentioned you on ticket {$ticket->reference}.", $row->line);
        $this->assertSame("/admin/tickets/{$ticket->reference}", $row->path);
    }

    public function test_a_name_removed_from_the_text_the_author_and_bad_ids_are_dropped_not_refused(): void
    {
        $priya = $this->staff(RoleEnum::SupportEngineer, 'priya');
        $ravi = $this->staff(RoleEnum::SupportEngineer, 'ravi');
        $me = $this->staff(RoleEnum::SupportEngineer, 'me');
        $ticket = $this->ticket();

        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", [
            'body' => "Over to @{$ravi->name} and @{$me->name}",
            'is_internal' => true,
            'mentions' => [$priya->id, $ravi->id, $ravi->id, $me->id, 999999, 'x', -3, [1]],
        ])->assertCreated();

        $this->assertSame([$ravi->id], StaffNotification::pluck('user_id')->all());
    }

    public function test_a_mentions_value_that_is_not_a_list_is_ignored(): void
    {
        $ticket = $this->ticket();
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => 'Note', 'is_internal' => true, 'mentions' => 'everyone'])->assertCreated();
        $this->assertSame(0, StaffNotification::count());
    }

    public function test_a_person_who_cannot_open_the_screen_is_not_mentioned(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager, 'sam');
        $ticket = $this->ticket();
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => "@{$sales->name} fyi", 'is_internal' => true, 'mentions' => [$sales->id]])->assertCreated();
        $this->assertSame(0, StaffNotification::count());
        Notification::assertNothingSent();
    }

    public function test_at_most_ten_people_are_told(): void
    {
        $ids = [];
        $body = 'All of you:';
        foreach (range(1, 12) as $i) {
            $u = $this->staff(RoleEnum::SupportEngineer, "p{$i}");
            $ids[] = $u->id;
            $body .= " @{$u->name}";
        }
        $ticket = $this->ticket();
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/tickets/{$ticket->reference}/reply", ['body' => $body, 'is_internal' => true, 'mentions' => $ids])->assertCreated();
        $this->assertSame(10, StaffNotification::count());
    }

    public function test_lead_and_order_notes_notify(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager, 'sam');
        $lead = $this->lead();
        $this->asStaff(RoleEnum::SalesManager, 'me')->postJson("/api/v1/admin/leads/{$lead->id}/notes", ['body' => "@{$sales->name} call them", 'mentions' => [$sales->id]])->assertCreated();
        $this->assertDatabaseHas('staff_notifications', ['user_id' => $sales->id, 'kind' => 'mention_lead', 'path' => "/admin/leads/{$lead->id}"]);

        $store = $this->staff(RoleEnum::StoreManager, 'sto');
        $order = $this->order();
        $this->asStaff(RoleEnum::StoreManager, 'me')->postJson("/api/v1/admin/store/orders/{$order->order_number}/notes", ['body' => "@{$store->name} check stock", 'mentions' => [$store->id]])->assertSuccessful();
        $this->assertDatabaseHas('staff_notifications', [
            'user_id' => $store->id, 'kind' => 'mention_order', 'path' => "/admin/store/orders/{$order->order_number}",
            'line' => "Store_manager me mentioned you on order {$order->order_number}.",
        ]);
    }
}
