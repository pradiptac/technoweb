<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\TicketPriority;
use App\Enums\TicketStatus;
use App\Models\AlertFire;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\StaffNotification;
use App\Models\StaffPreference;
use App\Models\StaffPushSubscription;
use App\Models\Ticket;
use App\Models\TicketCategory;
use App\Notifications\StaffAlerts;
use App\Notifications\StaffAssigned;
use App\Support\Alerts\AlertCheck;
use App\Support\Alerts\Rules;
use App\Support\Messaging\Providers\Fcm;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use ReflectionClassConstant;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class AlertCheckTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
        Http::preventStrayRequests();
        $this->travelTo(now()->setTimezone('Asia/Kolkata')->setTime(12, 0));
    }

    private function overdue(): Ticket
    {
        $customer = Customer::query()->first();
        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['name' => 'C', 'email' => 'c@example.test', 'password' => 'x', 'status' => 'active', 'email_verified_at' => now()])->save();
        }
        $cat = TicketCategory::firstOrCreate(['slug' => 'general'], ['name' => 'General', 'sort_order' => 1]);

        return Ticket::create([
            'customer_id' => $customer->id, 'ticket_category_id' => $cat->id, 'subject' => 'S', 'description' => 'D',
            'status' => TicketStatus::Open, 'priority' => TicketPriority::Normal, 'due_at' => now()->subMinute(),
        ]);
    }

    private function pushOn(): void
    {
        foreach ([
            Fcm::KEY => (string) json_encode([
                'client_email' => 'p@project.iam.gserviceaccount.com',
                'private_key' => (new ReflectionClassConstant(SearchConsoleTest::class, 'TEST_KEY'))->getValue(),
                'project_id' => 'technoware-push',
            ]),
            'messaging_push_provider' => 'fcm',
        ] as $key => $value) {
            $this->assertTrue(Setting::put($key, $value), "{$key} is not a seeded setting.");
        }
        Setting::flushCache();
    }

    public function test_one_hit_fires_once_across_two_checks(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();

        AlertCheck::run();
        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 1);
    }

    public function test_three_hits_make_one_email(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();
        $this->overdue();
        $this->overdue();

        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 1);
        Notification::assertSentTo($support, StaffAlerts::class, fn (StaffAlerts $n) => count($n->lines) === 3);
    }

    public function test_a_cleared_alert_fires_again_when_it_returns(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $ticket = $this->overdue();

        AlertCheck::run();
        $ticket->update(['due_at' => now()->addDay()]);
        AlertCheck::run();
        $this->assertNotNull(AlertFire::first()->cleared_at);
        $ticket->update(['due_at' => now()->subMinute()]);
        AlertCheck::run();

        Notification::assertSentToTimes($support, StaffAlerts::class, 2);
    }

    public function test_two_people_each_get_their_own(): void
    {
        $a = $this->staff(RoleEnum::SupportEngineer, 'a');
        $b = $this->staff(RoleEnum::SupportEngineer, 'b');
        $this->overdue();

        AlertCheck::run();

        Notification::assertSentToTimes($a, StaffAlerts::class, 1);
        Notification::assertSentToTimes($b, StaffAlerts::class, 1);
    }

    public function test_a_person_without_the_role_gets_nothing(): void
    {
        $content = $this->staff(RoleEnum::ContentManager);
        $admin = $this->staff(RoleEnum::Admin);
        $this->overdue();

        AlertCheck::run();

        Notification::assertNotSentTo($content, StaffAlerts::class);
        Notification::assertSentTo($admin, StaffAlerts::class);
    }

    public function test_switched_off_by_the_person_or_the_site_sends_nothing(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPreference::create(['user_id' => $support->id, 'alerts' => ['ticket_overdue' => false]]);
        $this->overdue();
        AlertCheck::run();
        Notification::assertNotSentTo($support, StaffAlerts::class);

        $other = $this->staff(RoleEnum::SupportEngineer, 'b');
        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        AlertCheck::run();
        Notification::assertNotSentTo($other, StaffAlerts::class);
    }

    public function test_switching_a_rule_off_clears_its_open_fires(): void
    {
        $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();
        AlertCheck::run();

        Setting::put('alert_ticket_overdue_enabled', '0');
        Setting::flushCache();
        AlertCheck::run();

        $this->assertSame(0, AlertFire::query()->whereNull('cleared_at')->count());
    }

    public function test_a_rule_at_its_cap_clears_nothing_it_did_not_see(): void
    {
        $user = $this->staff(RoleEnum::SupportEngineer);
        $tickets = collect(range(1, Rules::CAP + 1))->map(fn () => $this->overdue());
        $seen = Rules::all()[1]->current()->pluck('subject')->all();
        $unseen = $tickets->map(fn (Ticket $t) => 'ticket:'.$t->id)->first(fn (string $s) => ! in_array($s, $seen, true));
        $this->assertNotNull($unseen);
        AlertFire::query()->create(['rule' => 'ticket_overdue', 'subject' => $unseen, 'user_id' => $user->id, 'fired_at' => now()]);

        AlertCheck::run();

        $this->assertNull(AlertFire::query()->where('subject', $unseen)->value('cleared_at'), 'A subject past the cap is still wrong, so its alert stays open.');
    }

    public function test_inactive_staff_get_nothing(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $support->update(['is_active' => false]);
        $this->overdue();

        AlertCheck::run();

        Notification::assertNotSentTo($support, StaffAlerts::class);
    }

    public function test_a_rule_that_throws_spares_the_rest(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();
        // A broken rule: HealthDrop's table is gone, so its query throws. (QueueHealth swallows its own errors.)
        DB::statement('DROP TABLE health_snapshots');

        AlertCheck::run();

        Notification::assertSentTo($support, StaffAlerts::class);
    }

    public function test_push_is_one_message_and_skipped_in_quiet_hours(): void
    {
        $this->pushOn();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29']),
            'fcm.googleapis.com/*' => Http::response(['name' => 'projects/technoware-push/messages/1']),
        ]);
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPushSubscription::create(['user_id' => $support->id, 'token' => str_repeat('t', 40), 'label' => 'Chrome on Windows']);
        $this->overdue();
        $this->overdue();

        AlertCheck::run();
        $pushes = fn () => collect(Http::recorded())->filter(fn ($pair) => str_contains($pair[0]->url(), 'messages:send'))->count();
        $this->assertSame(1, $pushes());
        Http::assertSent(fn (ClientRequest $r) => str_contains($r->url(), 'messages:send')
            && $r['message']['notification']['title'] === '2 things need you'
            && ! str_contains((string) json_encode($r->data()), 'c@example.test'));

        $this->travelTo(now()->setTime(22, 0));
        $this->overdue();
        AlertCheck::run();
        $this->assertSame(1, $pushes(), 'Quiet hours: no new push.');
        Notification::assertSentToTimes($support, StaffAlerts::class, 2);
    }

    public function test_an_unregistered_token_is_deleted_and_the_email_still_goes(): void
    {
        $this->pushOn();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29']),
            'fcm.googleapis.com/*' => Http::response(['error' => ['message' => 'gone',
                'details' => [['@type' => 'type.googleapis.com/google.firebase.fcm.v1.FcmError', 'errorCode' => 'UNREGISTERED']]]], 404),
        ]);
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPushSubscription::create(['user_id' => $support->id, 'token' => str_repeat('t', 40)]);
        $this->overdue();

        AlertCheck::run();

        $this->assertSame(0, StaffPushSubscription::count());
        Notification::assertSentTo($support, StaffAlerts::class);
    }

    public function test_the_command_runs_and_the_prune_drops_old_cleared_fires(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        AlertFire::create(['rule' => 'ticket_overdue', 'subject' => 'ticket:1', 'user_id' => $support->id, 'fired_at' => now()->subDays(40), 'cleared_at' => now()->subDays(31)]);
        AlertFire::create(['rule' => 'ticket_overdue', 'subject' => 'ticket:2', 'user_id' => $support->id, 'fired_at' => now()->subDays(40)]);

        $this->artisan('technoware:check-alerts')->assertSuccessful();
        $this->artisan('technoware:prune-alert-fires')->assertSuccessful();

        $this->assertSame(['ticket:2'], AlertFire::pluck('subject')->all());
    }

    /** C2 (docs/notifications.md): every new fire is a bell row too, and no second email. */
    public function test_a_fire_writes_one_bell_row_and_nothing_more_is_sent(): void
    {
        $support = $this->staff(RoleEnum::SupportEngineer);
        $this->overdue();

        AlertCheck::run();
        AlertCheck::run();

        $this->assertSame(1, StaffNotification::query()->where('user_id', $support->id)->where('kind', 'alert')->count());
        Notification::assertSentToTimes($support, StaffAlerts::class, 1);
        Notification::assertNotSentTo($support, StaffAssigned::class);
    }
}
