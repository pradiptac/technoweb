<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\AnalyticsDaily;
use App\Models\AnalyticsHit;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Analytics\Report;
use App\Support\Analytics\Visitor;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

/** The whole-branch review's five findings on native analytics (C3). */
class AnalyticsFinalFixTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        RateLimiter::clear('analytics:collect:127.0.0.1');
        $this->withHeader('User-Agent', self::CHROME);
    }

    private function newOrder(): Order
    {
        return Order::create(['status' => 'pending_payment', 'subtotal_paise' => 118000, 'taxable_paise' => 100000, 'gst_paise' => 18000, 'total_paise' => 118000,
            'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now()]);
    }

    // 1. Salt

    public function test_the_rollup_forgets_the_salts_of_past_days_and_keeps_todays(): void
    {
        $today = now()->toDateString();
        $past = array_map(fn ($n) => now()->subDays($n)->toDateString(), [1, 2, 3]);
        foreach ($past as $day) {
            Cache::put("analytics:salt:{$day}", 'old');
        }
        Visitor::salt($today);

        Artisan::call('technoware:analytics-rollup');

        foreach ($past as $day) {
            $this->assertFalse(Cache::has("analytics:salt:{$day}"), "the salt of {$day} is gone");
        }
        $this->assertTrue(Cache::has("analytics:salt:{$today}"));
    }

    public function test_no_hit_is_written_when_there_is_no_salt(): void
    {
        config(['cache.default' => 'null']);
        Cache::forgetDriver();

        $this->postJson('/api/v1/collect', ['k' => 'pageview', 'p' => '/solutions', 'w' => 1440])->assertNoContent();

        $this->assertSame(0, AnalyticsHit::count(), 'an unsalted hash would be stable for ever');
    }

    // 2. order_paid

    public function test_a_paid_order_takes_the_attribution_of_its_placed_hit_and_ignores_exclusions(): void
    {
        $order = $this->newOrder();
        AnalyticsHit::where('kind', 'order_placed')->update(['channel' => 'social', 'source' => 'linkedin', 'visitor' => 'visitor-one-0001']);
        Setting::query()->where('key', 'native_analytics_exclude_ips')->update(['value' => '127.0.0.1']);
        Setting::flushCache();
        $this->actingAs(User::create(['name' => 'Desk', 'email' => 'desk@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]), 'sanctum');

        $order->update(['paid_at' => now(), 'status' => 'paid']);

        $paid = AnalyticsHit::where('kind', 'order_paid')->sole();
        $this->assertSame('social', $paid->channel);
        $this->assertSame('linkedin', $paid->source);
        $this->assertSame('visitor-one-0001', $paid->visitor);
        $this->assertSame(118000, (int) $paid->value_paise);
    }

    public function test_a_paid_order_with_no_placed_hit_is_direct(): void
    {
        $order = $this->newOrder();
        AnalyticsHit::query()->delete();
        $order->update(['paid_at' => now(), 'status' => 'paid']);

        $this->assertSame('direct', AnalyticsHit::where('kind', 'order_paid')->sole()->channel);
    }

    public function test_a_placed_then_paid_order_is_one_conversion(): void
    {
        $order = $this->newOrder();
        $order->update(['paid_at' => now(), 'status' => 'paid']);
        $this->newOrder(); // placed and never paid

        $s = Report::summary(now()->startOfDay(), now(), 'none');
        $this->assertSame(1, $s['conversions']['value']);
        $this->assertSame(3, AnalyticsHit::count(), 'the placed hits stay stored on their own kind');
    }

    public function test_the_breakdown_of_all_conversions_counts_a_paid_order_once(): void
    {
        $this->newOrder()->update(['paid_at' => now(), 'status' => 'paid']);
        $staff = User::create(['name' => 'S', 'email' => 's@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);
        $staff->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => 'Administrator'])->id);

        $res = $this->withHeader('Authorization', 'Bearer '.$staff->createToken('admin', ['admin'])->plainTextToken)->getJson('/api/v1/admin/analytics/breakdown?dimension=channel&kind=conversions&from='.now()->toDateString())->assertOk();

        $this->assertSame(1, array_sum(array_column($res->json('data'), 'views')));
    }

    // 3. Search

    public function test_a_search_is_recorded_only_when_the_request_says_so_and_once_a_day(): void
    {
        $this->getJson('/api/v1/search?q=firewal')->assertOk();
        $this->assertSame(0, AnalyticsHit::where('kind', 'search')->count(), 'a type-ahead is not a search');

        $this->getJson('/api/v1/search?q=firewall&record=1')->assertOk();
        $this->getJson('/api/v1/search?q=firewall&record=1')->assertOk();
        $this->assertSame(1, AnalyticsHit::where('kind', 'search')->count(), 'the same visitor, term and day is one search');

        $this->getJson('/api/v1/search?q=router&record=1')->assertOk();
        $this->assertSame(2, AnalyticsHit::where('kind', 'search')->count());
    }

    public function test_a_shop_search_is_recorded_only_when_the_request_says_so_and_once_a_day(): void
    {
        $this->getJson('/api/v1/store/products?q=switch&per_page=6')->assertOk();
        $this->assertSame(0, AnalyticsHit::where('kind', 'search')->count());

        $this->getJson('/api/v1/store/products?q=switch&record=1')->assertOk();
        $this->getJson('/api/v1/store/products?q=switch&record=1')->assertOk();
        $this->assertSame(1, AnalyticsHit::where('kind', 'search')->count());
    }

    // 4. Report aggregation

    public function test_closed_days_are_summed_per_key_in_sql(): void
    {
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Asia/Kolkata'));
        foreach (['2026-10-17', '2026-10-18', '2026-10-19'] as $i => $day) {
            $rows = [['day' => $day, 'dimension' => 'total', 'key' => '', 'kind' => 'pageview', 'views' => 10, 'visitors' => 4, 'entries' => 3, 'bounces' => 1, 'value_paise' => 0]];
            foreach (range(1, 30) as $k) {
                $rows[] = ['day' => $day, 'dimension' => 'page', 'key' => "/p{$k}", 'kind' => 'pageview', 'views' => $k, 'visitors' => 1, 'entries' => 0, 'bounces' => 0, 'value_paise' => 0];
            }
            AnalyticsDaily::insert($rows);
        }

        $top = Report::breakdown('page', Carbon::parse('2026-10-17'), Carbon::parse('2026-10-19'), 'pageview', 2);
        $this->assertSame([['/p30', 90, 3], ['/p29', 87, 3]], array_map(fn ($r) => [$r['key'], $r['views'], $r['visitors']], $top));

        $s = Report::summary(Carbon::parse('2026-10-17'), Carbon::parse('2026-10-19'), 'none');
        $this->assertSame([30, 12, 9], [$s['views']['value'], $s['visits']['value'], $s['entries']['value']]);
        $this->assertSame([10, 10, 10], array_column(Report::series(Carbon::parse('2026-10-17'), Carbon::parse('2026-10-19')), 'views'));

        DB::enableQueryLog();
        Report::breakdown('page', Carbon::parse('2026-10-17'), Carbon::parse('2026-10-19'));
        $this->assertStringContainsString('sum(', strtolower(DB::getQueryLog()[0]['query']), 'closed days are aggregated by the database');
    }

    // 5. Now

    public function test_the_now_tile_reads_only_the_recent_days(): void
    {
        DB::enableQueryLog();
        Report::now();
        $sql = DB::getQueryLog()[0]['query'];
        $this->assertStringContainsString('`day` >=', $sql);
    }
}
