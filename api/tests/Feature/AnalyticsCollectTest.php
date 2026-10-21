<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\AnalyticsHit;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Analytics\Collector;
use App\Support\Analytics\Visitor;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class AnalyticsCollectTest extends TestCase
{
    use RefreshDatabase;

    private const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        RateLimiter::clear('analytics:collect:203.0.113.7');
        RateLimiter::clear('analytics:collect:127.0.0.1');
    }

    /** @param array<string, mixed> $body @param array<string, string> $headers */
    private function collect(array $body, string $ua = self::CHROME, string $ip = '203.0.113.7', array $headers = [])
    {
        return $this->withServerVariables(['REMOTE_ADDR' => $ip])->withHeaders($headers)->withHeader('User-Agent', $ua)->postJson('/api/v1/collect', $body);
    }

    private function set(string $key, string $value): void
    {
        Setting::query()->where('key', $key)->update(['value' => $value]);
        Setting::flushCache();
    }

    /** A request as the server-side conversion hooks will see it. */
    private function visitor(string $ua = self::CHROME, string $ip = '203.0.113.7'): Request
    {
        return Request::create('/', 'POST', server: ['REMOTE_ADDR' => $ip, 'HTTP_USER_AGENT' => $ua]);
    }

    public function test_a_page_view_is_one_row_and_the_address_is_never_stored(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/solutions/networking', 'r' => 'https://www.google.com/', 'w' => 1440])->assertNoContent();

        $hit = AnalyticsHit::sole();
        $this->assertSame('pageview', $hit->kind);
        $this->assertSame('/solutions/networking', $hit->path);
        $this->assertSame('search', $hit->channel);
        $this->assertSame('Google', $hit->source);
        $this->assertSame('desktop', $hit->device);
        $this->assertTrue($hit->entry);
        $this->assertSame(16, strlen($hit->visitor));
        foreach ($hit->getAttributes() as $value) {
            $this->assertStringNotContainsString('203.0.113.7', (string) $value);
        }
    }

    public function test_a_later_view_keeps_the_entry_source(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/feed/', 'w' => 1440]);
        $this->collect(['k' => 'pageview', 'p' => '/about', 'r' => '', 'w' => 1440]);

        $second = AnalyticsHit::orderBy('id')->get()[1];
        $this->assertFalse($second->entry);
        $this->assertSame('social', $second->channel);
        $this->assertSame('LinkedIn', $second->source);
    }

    public function test_the_visitor_changes_at_midnight(): void
    {
        $this->travelTo(now()->setTimezone(config('app.timezone'))->setTime(23, 59));
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440]);
        $this->travelTo(now()->addMinutes(2));
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440]);

        [$a, $b] = AnalyticsHit::orderBy('id')->get()->all();
        $this->assertNotSame($a->visitor, $b->visitor);
        $this->assertTrue($b->entry, 'a new day is a new visit');
    }

    public function test_bots_bad_paths_excluded_addresses_and_oversized_bodies_write_nothing(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/'], 'Googlebot/2.1')->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => 'https://evil.example/x'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/admin/pages'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/order/ORD-2026-00001'])->assertNoContent();
        $this->collect(['k' => 'nonsense', 'p' => '/'])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/'.str_repeat('a', 3000)])->assertNoContent();
        $this->set('native_analytics_exclude_ips', '203.0.113.0/24');
        $this->collect(['k' => 'pageview', 'p' => '/'])->assertNoContent();

        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_switched_off_writes_nothing(): void
    {
        $this->set('native_analytics_enabled', '0');
        $this->collect(['k' => 'pageview', 'p' => '/'])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_events_carry_their_target(): void
    {
        $this->collect(['k' => 'outbound', 'p' => '/contact', 't' => 'https://maps.google.com/x'])->assertNoContent();
        $this->collect(['k' => 'contact', 'p' => '/contact', 't' => 'tel:+919876543210'])->assertNoContent();
        $this->assertSame(['https://maps.google.com/x', 'tel'], AnalyticsHit::orderBy('id')->pluck('target')->all(), 'a phone number is never stored — only that it was a call');
    }

    public function test_a_forwarded_agent_is_believed_only_from_a_trusted_proxy(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440], 'curl/8', '127.0.0.1', ['X-Visitor-Agent' => self::CHROME])->assertNoContent();
        $this->assertSame('Chrome', AnalyticsHit::sole()->browser);

        AnalyticsHit::query()->delete();
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440], 'curl/8', '198.51.100.9', ['X-Visitor-Agent' => self::CHROME])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count(), 'a forged agent is ignored, so the request is curl — a bot');
    }

    public function test_an_event_from_an_excluded_or_foreign_page_writes_nothing(): void
    {
        $this->collect(['k' => 'outbound', 'p' => '/order/ORD-2026-00001', 't' => 'https://maps.google.com/x'])->assertNoContent();
        $this->collect(['k' => 'download', 'p' => 'https://evil.example/x', 't' => '/storage/a.pdf'])->assertNoContent();
        $this->collect(['k' => 'outbound', 't' => 'https://maps.google.com/x'])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_secret_bearing_pages_are_never_counted(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/store/wishlist/stop/'.str_repeat('a', 64)])->assertNoContent();
        $this->collect(['k' => 'pageview', 'p' => '/store/basket/restore/'.str_repeat('a', 64)])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count());
    }

    public function test_the_salt_ends_with_its_day(): void
    {
        $this->travelTo(now()->setTimezone(config('app.timezone'))->setTime(12, 0));
        $day = now()->setTimezone(config('app.timezone'))->toDateString();
        $this->collect(['k' => 'pageview', 'p' => '/', 'w' => 1440]);
        $salt = Visitor::salt($day);
        $this->assertTrue(Cache::has("analytics:salt:{$day}"));

        $this->travelTo(now()->setTimezone(config('app.timezone'))->addDay()->startOfDay()->addSecond());
        $this->assertFalse(Cache::has("analytics:salt:{$day}"), 'yesterday’s salt is not kept');
        $this->assertNotSame($salt, Visitor::salt(now()->setTimezone(config('app.timezone'))->toDateString()));
    }

    public function test_a_view_from_this_sites_own_host_keeps_the_entry_source(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/feed/', 'w' => 1440]);
        $this->collect(['k' => 'pageview', 'p' => '/about', 'r' => config('app.frontend_url').'/', 'w' => 1440]);

        $second = AnalyticsHit::orderBy('id')->get()[1];
        $this->assertSame('LinkedIn', $second->source);
    }

    public function test_a_view_with_utm_tags_is_its_own_source(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/feed/', 'w' => 1440]);
        $this->collect(['k' => 'pageview', 'p' => '/about', 'u' => ['source' => 'newsletter', 'medium' => 'email'], 'w' => 1440]);

        $second = AnalyticsHit::orderBy('id')->get()[1];
        $this->assertFalse($second->entry);
        $this->assertSame('email', $second->channel);
        $this->assertSame('newsletter', $second->source);
    }

    public function test_a_conversion_whose_referrer_is_this_site_is_credited_to_the_entry_hit(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/', 'w' => 1440]);
        $hit = Collector::record($this->visitor(), 'enquiry', ['page' => ['source_path' => '/contact', 'referrer' => config('app.frontend_url').'/solutions']]);

        $this->assertSame('LinkedIn', $hit->source);
    }

    public function test_a_conversion_is_not_limited_by_a_busy_beacon_address(): void
    {
        for ($i = 0; $i < 125; $i++) {
            $this->collect(['k' => 'pageview', 'p' => '/p'.$i]);
        }
        $this->assertLessThan(125, AnalyticsHit::count());

        $this->assertNotNull(Collector::record($this->visitor(), 'order_placed', ['value_paise' => 100]));
    }

    public function test_it_is_throttled_and_still_answers_204(): void
    {
        for ($i = 0; $i < 130; $i++) {
            $res = $this->collect(['k' => 'pageview', 'p' => '/p'.$i]);
        }
        $res->assertNoContent();
        $this->assertLessThan(130, AnalyticsHit::count());
    }

    public function test_a_conversion_with_its_own_referrer_or_utm_takes_its_source_from_the_envelope(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/', 'w' => 1440]);
        $hit = Collector::record($this->visitor(), 'enquiry', ['page' => ['source_path' => '/contact', 'utm_source' => 'diwali', 'utm_medium' => 'email']]);

        $this->assertSame('email', $hit->channel);
        $this->assertSame('diwali', $hit->source);
        $this->assertFalse($hit->entry);
    }

    public function test_a_conversion_without_an_envelope_source_copies_the_entry_hit(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/', 'r' => 'https://www.linkedin.com/', 'w' => 1440]);
        $hit = Collector::record($this->visitor(), 'enquiry', ['page' => ['source_path' => '/contact']]);

        $this->assertSame('social', $hit->channel);
        $this->assertSame('LinkedIn', $hit->source);
    }

    public function test_a_conversion_with_no_envelope_and_no_entry_is_direct(): void
    {
        $hit = Collector::record($this->visitor(), 'order_placed', ['value_paise' => 118000, 'page' => []]);

        $this->assertSame('direct', $hit->channel);
        $this->assertSame(118000, $hit->value_paise);
        $this->assertNull($hit->path);
    }

    public function test_a_conversion_from_a_bot_agent_is_still_recorded(): void
    {
        $this->assertNotNull(Collector::record($this->visitor('Googlebot/2.1'), 'order_paid', ['value_paise' => 5000]));
        $this->assertNull(Collector::record($this->visitor('Googlebot/2.1'), 'pageview', ['path' => '/']));

        $this->set('native_analytics_exclude_ips', '203.0.113.0/24');
        $this->assertNull(Collector::record($this->visitor(), 'order_paid', []), 'excluded addresses still apply');
    }

    public function test_staff_are_dropped_by_default_and_counted_when_the_setting_says_so(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/'], ip: '127.0.0.1', headers: ['X-Visitor-Staff' => '1'])->assertNoContent();
        $this->assertSame(0, AnalyticsHit::count());

        $this->set('native_analytics_count_staff', '1');
        $this->collect(['k' => 'pageview', 'p' => '/'], ip: '127.0.0.1', headers: ['X-Visitor-Staff' => '1'])->assertNoContent();
        $this->assertSame(1, AnalyticsHit::count());
    }

    public function test_the_staff_header_from_an_untrusted_caller_is_ignored(): void
    {
        $this->collect(['k' => 'pageview', 'p' => '/'], headers: ['X-Visitor-Staff' => '1'])->assertNoContent();
        $this->assertSame(1, AnalyticsHit::count());
    }

    private function admin(): User
    {
        $user = User::create(['name' => 'Admin', 'email' => 'an@example.test', 'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()])->id);

        return $user;
    }

    public function test_the_settings_screen_refuses_a_bad_exclude_line_and_saves_a_good_list(): void
    {
        $admin = $this->admin();
        $patch = fn (string $value) => $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'native_analytics_exclude_ips', 'value' => $value]]]);

        $patch("203.0.113.0/24\nnot-an-address")->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $patch('203.0.113.0/33')->assertStatus(422);

        $patch("203.0.113.0/24\n\n2001:db8::/32\n198.51.100.4")->assertOk();
        Setting::flushCache();
        $this->assertSame("203.0.113.0/24\n\n2001:db8::/32\n198.51.100.4", Setting::get('native_analytics_exclude_ips'));
    }
}
