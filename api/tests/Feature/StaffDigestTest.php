<?php

namespace Tests\Feature;

use App\Enums\LeadStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Lead;
use App\Models\StaffPreference;
use App\Notifications\StaffDigest;
use App\Support\Digest\DigestBuilder;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class StaffDigestTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
    }

    private function at(string $when): void
    {
        $this->travelTo(Carbon::parse($when, 'Asia/Kolkata'));
    }

    public function test_the_digest_is_the_copilot_figures_for_the_persons_roles(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager);
        Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact']);

        $digest = DigestBuilder::build($sales, null);

        $keys = array_column($digest->items, 'key');
        $this->assertContains('leads_new', $keys);
        foreach ($digest->items as $item) {
            $this->assertNotSame(0, $item['figure']);
        }
        $this->assertStringNotContainsString('ticket', implode(' ', $keys), 'A sales manager sees no support question.');
    }

    public function test_a_change_is_against_the_last_digest_and_only_for_whole_numbers(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager);
        foreach (range(1, 4) as $i) {
            Lead::create(['name' => "L{$i}", 'email' => "l{$i}@example.test", 'status' => LeadStatus::New, 'channel' => 'contact']);
        }
        $first = DigestBuilder::build($sales, null);
        $item = collect($first->items)->firstWhere('key', 'leads_new');
        $this->assertSame(4, $item['figure']);
        $this->assertNull($item['change']);

        $second = DigestBuilder::build($sales, ['leads_new' => 1]);
        $this->assertSame('up 3', collect($second->items)->firstWhere('key', 'leads_new')['change']);

        $third = DigestBuilder::build($sales, ['leads_new' => 4]);
        $this->assertNull(collect($third->items)->firstWhere('key', 'leads_new')['change'], 'Unchanged says nothing.');
    }

    public function test_a_zero_is_stored_so_a_later_rise_reads_up(): void
    {
        $sales = $this->staff(RoleEnum::SalesManager);
        $before = DigestBuilder::build($sales, null);
        $this->assertSame(0, $before->figures()['leads_new']);

        Lead::create(['name' => 'A', 'email' => 'a@example.test', 'status' => LeadStatus::New, 'channel' => 'contact']);
        $after = DigestBuilder::build($sales, $before->figures());
        $this->assertSame('up 1', collect($after->items)->firstWhere('key', 'leads_new')['change']);
    }

    public function test_zero_figures_fold_into_the_all_clear_line(): void
    {
        $digest = DigestBuilder::build($this->staff(RoleEnum::SupportEngineer), null);

        $this->assertTrue($digest->allZero);
        $this->assertSame([], $digest->items);
        $this->assertNotEmpty($digest->clear);
    }

    public function test_due_on_the_hour_and_the_weekday(): void
    {
        $daily = new StaffPreference(['digest' => 'daily', 'digest_hour' => 8]);
        $weekly = new StaffPreference(['digest' => 'weekly', 'digest_hour' => 8, 'digest_weekday' => 1]);
        $off = new StaffPreference(['digest' => 'off', 'digest_hour' => 8]);

        $monday8 = CarbonImmutable::parse('2026-10-26 08:10', 'Asia/Kolkata');
        $tuesday8 = $monday8->addDay();
        $monday9 = $monday8->addHour();

        $this->assertTrue(DigestBuilder::due($daily, $monday8));
        $this->assertTrue(DigestBuilder::due($daily, $tuesday8));
        $this->assertFalse(DigestBuilder::due($daily, $monday9));
        $this->assertTrue(DigestBuilder::due($weekly, $monday8));
        $this->assertFalse(DigestBuilder::due($weekly, $tuesday8));
        $this->assertFalse(DigestBuilder::due($off, $monday8));
    }

    public function test_once_a_day_even_when_run_twice(): void
    {
        $this->at('2026-10-26 08:05');
        $support = $this->staff(RoleEnum::SupportEngineer);
        StaffPreference::create(['user_id' => $support->id, 'digest' => 'daily', 'digest_hour' => 8]);

        $this->artisan('technoware:send-digests')->assertSuccessful();
        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertSentToTimes($support, StaffDigest::class, 1);
        $this->assertNotNull(StaffPreference::first()->last_digest_at);
    }

    public function test_the_default_reaches_somebody_who_never_saved(): void
    {
        $this->at('2026-10-26 08:05'); // a Monday
        $support = $this->staff(RoleEnum::SupportEngineer);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertSentTo($support, StaffDigest::class);
    }

    public function test_a_quiet_day_is_skipped_only_when_asked(): void
    {
        $this->at('2026-10-26 08:05');
        $a = $this->staff(RoleEnum::SupportEngineer, 'a');
        $b = $this->staff(RoleEnum::SupportEngineer, 'b');
        StaffPreference::create(['user_id' => $a->id, 'digest' => 'daily', 'digest_hour' => 8, 'digest_skip_quiet' => true]);
        StaffPreference::create(['user_id' => $b->id, 'digest' => 'daily', 'digest_hour' => 8]);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertNotSentTo($a, StaffDigest::class);
        Notification::assertSentTo($b, StaffDigest::class);
    }

    public function test_inactive_staff_get_none(): void
    {
        $this->at('2026-10-26 08:05');
        $support = $this->staff(RoleEnum::SupportEngineer);
        $support->update(['is_active' => false]);

        $this->artisan('technoware:send-digests')->assertSuccessful();

        Notification::assertNotSentTo($support, StaffDigest::class);
    }
}
