<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\StaffNotificationKind;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StaffNotification;
use App\Models\StaffPreference;
use App\Models\User;
use App\Notifications\StaffAssigned;
use App\Notifications\StaffMentioned;
use App\Support\Notifications\Notifications;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
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
}
