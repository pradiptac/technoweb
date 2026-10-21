<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Enums\StaffNotificationKind;
use App\Enums\TicketStatus;
use App\Models\Backup;
use App\Models\Customer;
use App\Models\Lead;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StaffNotification;
use App\Models\StaffPreference;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Models\User;
use App\Models\WordPressImport;
use App\Notifications\StaffAssigned;
use App\Notifications\StaffMentioned;
use App\Support\Notifications\Notifications;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The console's bell (C2, docs/notifications.md): who a row is written for,
 * what reaches them by email and push, and the caller's own read of it.
 * Staff are authenticated with a real `Authorization: Bearer` header.
 */
class StaffNotificationsTest extends TestCase
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
            ['email' => $role->value."-bell-{$tag}@example.test"],
            ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true],
        );
        $user->roles()->syncWithoutDetaching([
            Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id,
        ]);

        return $user->load('roles');
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = $this->staff($role, $tag);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    public function test_a_row_is_written_for_someone_who_can_open_the_screen(): void
    {
        $to = $this->staff(RoleEnum::SupportEngineer, 'to');
        $row = Notifications::send($to, StaffNotificationKind::TicketAssigned, 'Asha assigned TW-2026-00041 to you.', '/admin/tickets/TW-2026-00041');

        $this->assertNotNull($row);
        $this->assertDatabaseHas('staff_notifications', ['user_id' => $to->id, 'kind' => 'ticket_assigned', 'path' => '/admin/tickets/TW-2026-00041']);
    }

    public function test_nothing_is_written_for_the_actor_an_inactive_account_or_a_screen_they_cannot_open(): void
    {
        $engineer = $this->staff(RoleEnum::SupportEngineer, 'e');
        $this->assertNull(Notifications::send($engineer, StaffNotificationKind::TicketAssigned, 'x', '/admin/tickets/TW-1', null, $engineer));

        $off = $this->staff(RoleEnum::SupportEngineer, 'off');
        $off->update(['is_active' => false]);
        $this->assertNull(Notifications::send($off, StaffNotificationKind::TicketAssigned, 'x', '/admin/tickets/TW-1'));

        $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', '/admin/pages/1'));
        $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', '/nowhere'));
        $this->assertNull(Notifications::send($engineer, StaffNotificationKind::MentionNote, 'x', null));
        $this->assertSame(0, StaffNotification::count());
    }

    public function test_an_administrator_can_be_told_about_any_console_screen(): void
    {
        $admin = $this->staff(RoleEnum::Admin, 'adm');
        $this->assertNotNull(Notifications::send($admin, StaffNotificationKind::MentionNote, 'x', '/admin/pages/1'));
    }

    public function test_delivery_follows_the_preferences_and_the_site_switch(): void
    {
        $to = $this->staff(RoleEnum::SupportEngineer, 'd');
        Notifications::send($to, StaffNotificationKind::TicketAssigned, 'one', '/admin/tickets/TW-1');
        Notification::assertSentToTimes($to, StaffAssigned::class, 1);

        StaffPreference::create(['user_id' => $to->id, 'notify_mentions' => false]);
        $to->unsetRelation('staffPreference');
        Notifications::send($to, StaffNotificationKind::MentionTicket, 'two', '/admin/tickets/TW-1');
        Notification::assertNotSentTo($to, StaffMentioned::class);

        StaffPreference::query()->where('user_id', $to->id)->update(['notify_mentions' => true, 'alert_email' => false]);
        $to->unsetRelation('staffPreference');
        Notifications::send($to, StaffNotificationKind::MentionTicket, 'three', '/admin/tickets/TW-1');
        Notification::assertNotSentTo($to, StaffMentioned::class);

        StaffPreference::query()->where('user_id', $to->id)->update(['alert_email' => true]);
        $to->unsetRelation('staffPreference');
        Setting::updateOrCreate(['key' => 'alerts_mentions_enabled'], ['group' => 'alerts', 'value' => '0', 'type' => 'boolean']);
        Setting::flushCache();
        Notifications::send($to, StaffNotificationKind::MentionTicket, 'four', '/admin/tickets/TW-1');
        Notification::assertNotSentTo($to, StaffMentioned::class);

        Setting::query()->where('key', 'alerts_mentions_enabled')->update(['value' => '1']);
        Setting::flushCache();
        Notifications::send($to, StaffNotificationKind::MentionTicket, 'five', '/admin/tickets/TW-1');
        Notification::assertSentToTimes($to, StaffMentioned::class, 1);

        $this->assertSame(5, StaffNotification::where('user_id', $to->id)->count(), 'The bell fills whatever the delivery.');
    }

    public function test_an_alert_row_and_a_finished_job_are_never_delivered(): void
    {
        $to = $this->staff(RoleEnum::Admin, 'al');
        Notifications::send($to, StaffNotificationKind::Alert, 'TW-1 is past its due time.', '/admin/tickets/TW-1', null, null, false);
        Notifications::send($to, StaffNotificationKind::JobFinished, 'The backup has finished.', '/admin/backups');
        Notification::assertNothingSent();
        $this->assertSame(2, StaffNotification::count());
    }

    public function test_a_failure_never_reaches_the_caller(): void
    {
        $to = $this->staff(RoleEnum::SupportEngineer, 'f');
        $this->assertNull(Notifications::send($to, StaffNotificationKind::TicketAssigned, 'x', '/admin/tickets/'.str_repeat('x', 300)));
        $this->assertSame(0, StaffNotification::count());
    }

    public function test_rows_are_pruned_after_ninety_days(): void
    {
        $to = $this->staff(RoleEnum::SupportEngineer, 'p');
        $old = Notifications::send($to, StaffNotificationKind::TicketAssigned, 'old', '/admin/tickets/TW-1');
        $old->forceFill(['created_at' => now()->subDays(91)])->save();
        Notifications::send($to, StaffNotificationKind::TicketAssigned, 'new', '/admin/tickets/TW-2');

        $this->artisan('technoware:prune-staff-notifications')->assertExitCode(0);
        $this->assertSame(['new'], StaffNotification::pluck('line')->all());
    }

    public function test_the_bell_lists_only_the_callers_rows_newest_first_and_counts_unread(): void
    {
        $me = $this->staff(RoleEnum::SupportEngineer, 'me');
        $other = $this->staff(RoleEnum::SupportEngineer, 'other');
        Notifications::send($me, StaffNotificationKind::TicketAssigned, 'first', '/admin/tickets/TW-1');
        $this->travel(1)->minutes();
        Notifications::send($me, StaffNotificationKind::TicketAssigned, 'second', '/admin/tickets/TW-2');
        Notifications::send($other, StaffNotificationKind::TicketAssigned, 'not mine', '/admin/tickets/TW-3');

        $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/notifications?filter=all')
            ->assertOk()
            ->assertJsonPath('data.0.line', 'second')
            ->assertJsonPath('data.0.group', 'assigned')
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.unread', 2)
            ->assertJsonPath('meta.per_page', 30);
    }

    public function test_read_one_read_all_and_another_persons_row_is_a_404(): void
    {
        $me = $this->staff(RoleEnum::SupportEngineer, 'me');
        $other = $this->staff(RoleEnum::SupportEngineer, 'other');
        $mine = Notifications::send($me, StaffNotificationKind::TicketAssigned, 'a', '/admin/tickets/TW-1');
        Notifications::send($me, StaffNotificationKind::TicketAssigned, 'b', '/admin/tickets/TW-2');
        $theirs = Notifications::send($other, StaffNotificationKind::TicketAssigned, 'c', '/admin/tickets/TW-3');

        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/notifications/{$theirs->id}/read")->assertNotFound();
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson("/api/v1/admin/notifications/{$mine->id}/read")->assertOk();
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/notifications')->assertJsonCount(1, 'data')->assertJsonPath('meta.unread', 1);
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->postJson('/api/v1/admin/notifications/read-all')->assertOk()->assertJsonPath('updated', 1);
        $this->assertNull($theirs->fresh()->read_at);
    }

    public function test_new_since_carries_the_unread_count(): void
    {
        $me = $this->staff(RoleEnum::SupportEngineer, 'me');
        Notifications::send($me, StaffNotificationKind::TicketAssigned, 'a', '/admin/tickets/TW-1');
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/new-since?since='.urlencode(now()->subHour()->toIso8601String()))
            ->assertOk()->assertJsonPath('data.notifications_unread', 1);
    }

    private function ticket(array $attributes = []): Ticket
    {
        $customer = Customer::firstOrCreate(['email' => 'neil@example.test'], [
            'name' => 'Neil Basu', 'password' => 'password-for-tests', 'status' => CustomerStatus::Active,
        ]);
        $category = TicketCategory::firstOrCreate(['slug' => 'network'], ['name' => 'Network', 'is_active' => true]);
        $ticket = $customer->tickets()->make($attributes + [
            'subject' => 'A switch keeps rebooting',
            'description' => 'It drops every device on it twice a day since the firmware update.',
            'ticket_category_id' => $category->id,
            'status' => TicketStatus::Open,
            'priority' => 'normal',
        ]);
        $ticket->save();

        return $ticket->fresh();
    }

    private function asCustomer(Customer $customer): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$customer->createToken('portal', ['portal'])->plainTextToken);
    }

    public function test_assigning_a_ticket_tells_the_assignee_and_not_the_assigner(): void
    {
        $engineer = $this->staff(RoleEnum::SupportEngineer, 'eng');
        $ticket = $this->ticket();

        $this->asStaff(RoleEnum::SupportEngineer, 'lead')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $engineer->id])->assertOk();

        $row = StaffNotification::where('user_id', $engineer->id)->sole();
        $this->assertSame('ticket_assigned', $row->kind->value);
        $this->assertSame("Support_engineer lead assigned {$ticket->reference} to you.", $row->line);
        $this->assertStringNotContainsString($ticket->subject, $row->line);

        $this->asStaff(RoleEnum::SupportEngineer, 'eng')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $engineer->id]);
        $this->assertSame(1, StaffNotification::where('user_id', $engineer->id)->count(), 'An unchanged assignee is not told again.');

        $this->asStaff(RoleEnum::SupportEngineer, 'eng')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => null]);
        $this->asStaff(RoleEnum::SupportEngineer, 'eng')->patchJson("/api/v1/admin/tickets/{$ticket->reference}", ['assigned_to' => $engineer->id]);
        $this->assertSame(1, StaffNotification::where('user_id', $engineer->id)->count(), 'Taking it yourself tells nobody.');
    }

    public function test_a_customer_reply_tells_the_assignee(): void
    {
        $engineer = $this->staff(RoleEnum::SupportEngineer, 'eng');
        $ticket = $this->ticket(['assigned_to' => $engineer->id, 'status' => TicketStatus::Assigned]);

        $this->asCustomer($ticket->customer)->postJson("/api/v1/tickets/{$ticket->reference}/messages", ['body' => 'Any news?'])->assertCreated();

        $this->assertDatabaseHas('staff_notifications', ['user_id' => $engineer->id, 'kind' => 'ticket_customer_reply', 'line' => "The customer replied on {$ticket->reference}."]);
    }

    public function test_assigning_a_lead_tells_the_assignee(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager, 's');
        $lead = Lead::create([
            'name' => 'Old lead', 'email' => 'buyer@meridianfoods.in', 'company' => 'Meridian Foods',
            'message' => 'We need a quotation for 24-port PoE switches.',
            'source_path' => '/contact', 'source_type' => 'enquiry', 'source_id' => 1,
            'channel' => 'enquiry', 'status' => 'new', 'score' => 0, 'score_band' => 'cold', 'score_reasons' => [],
        ]);

        $this->asStaff(RoleEnum::SalesManager, 'boss')->patchJson("/api/v1/admin/leads/{$lead->id}", ['assigned_to' => $sales->id])->assertOk();

        $this->assertDatabaseHas('staff_notifications', [
            'user_id' => $sales->id, 'kind' => 'lead_assigned', 'path' => "/admin/leads/{$lead->id}",
            'line' => "Sales_manager boss assigned lead #{$lead->id} to you.",
        ]);
    }

    public function test_a_finished_backup_tells_whoever_started_it(): void
    {
        $admin = $this->staff(RoleEnum::Admin, 'bk');
        $backup = Backup::create([
            'uuid' => (string) Str::uuid(), 'type' => 'full', 'trigger' => 'manual', 'status' => 'uploading',
            'folder' => 'f', 'includes' => [], 'destinations' => [], 'created_by' => $admin->id,
        ]);
        $backup->update(['progress' => ['x' => 1]]);
        $this->assertSame(0, StaffNotification::count(), 'Only a change of status counts.');

        $backup->update(['status' => 'completed']);

        $this->assertDatabaseHas('staff_notifications', ['user_id' => $admin->id, 'kind' => 'job_finished', 'line' => 'The backup has finished.', 'path' => '/admin/backups']);
        Notification::assertNothingSent();

        $safety = Backup::create([
            'uuid' => (string) Str::uuid(), 'type' => 'full', 'trigger' => 'pre_restore', 'status' => 'uploading',
            'folder' => 'g', 'includes' => [], 'destinations' => [], 'created_by' => $admin->id,
        ]);
        $safety->update(['status' => 'completed']);
        $this->assertSame(1, StaffNotification::count(), 'A safety copy inside a restore is not announced.');
    }

    public function test_a_wordpress_import_ready_to_review_tells_its_starter_and_expiry_does_not(): void
    {
        $admin = $this->staff(RoleEnum::Admin, 'wp');
        $import = WordPressImport::create(['uploaded_by' => $admin->id, 'site_url' => 'https://shop.example', 'site' => sha1('shop'), 'status' => 'analysing']);

        $import->update(['status' => 'ready']);
        $import->update(['status' => 'expired']);

        $this->assertSame(['The WordPress import is ready to review.'], StaffNotification::where('user_id', $admin->id)->pluck('line')->all());
    }

    public function test_the_mentions_preference_is_saved(): void
    {
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->patchJson('/api/v1/admin/notifications/preferences', ['notify_mentions' => false])
            ->assertOk()->assertJsonPath('data.notify_mentions', false);
        $this->asStaff(RoleEnum::SupportEngineer, 'me')->getJson('/api/v1/admin/notifications/preferences')
            ->assertOk()->assertJsonPath('data.notify_mentions', false);
    }
}
