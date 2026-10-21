<?php

namespace Tests\Feature;

use App\Models\AnalyticsHit;
use App\Models\NewsletterGroup;
use App\Models\Order;
use App\Models\Setting;
use App\Support\Analytics\Conversions;
use App\Support\Newsletter\SubscriberIntake;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class AnalyticsConversionsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->withHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36');
    }

    public function test_an_enquiry_is_a_conversion_attributed_to_the_page_that_sent_it(): void
    {
        $this->postJson('/api/v1/enquiries', [
            'name' => 'Priya', 'email' => 'priya@meridian.test', 'message' => 'We need twenty access points for two floors.',
            '_source_url' => 'https://www.technoware.in/solutions/wifi', '_utm_source' => 'linkedin', '_utm_medium' => 'social',
        ])->assertSuccessful();

        $hit = AnalyticsHit::where('kind', 'enquiry')->sole();
        $this->assertSame('/solutions/wifi', $hit->path);
        $this->assertSame('social', $hit->channel);
        $this->assertSame('linkedin', $hit->source);
    }

    public function test_an_order_placed_and_paid_are_two_conversions_with_a_value(): void
    {
        $order = Order::create(['status' => 'pending_payment', 'subtotal_paise' => 118000, 'taxable_paise' => 100000, 'gst_paise' => 18000, 'total_paise' => 118000, 'customer_name' => 'N', 'customer_email' => 'n@example.test', 'placed_at' => now()]);
        $order->update(['paid_at' => now(), 'status' => 'paid']);

        $this->assertSame(['order_placed', 'order_paid'], AnalyticsHit::orderBy('id')->pluck('kind')->all());
        $this->assertSame(118000, (int) AnalyticsHit::where('kind', 'order_paid')->value('value_paise'));
        $this->assertSame($order->order_number, AnalyticsHit::where('kind', 'order_paid')->value('target'));
    }

    public function test_a_site_search_records_the_term_and_the_result_count(): void
    {
        $this->getJson('/api/v1/search?q=Firewall+Rental')->assertOk();
        $hit = AnalyticsHit::where('kind', 'search')->sole();
        $this->assertSame('firewall rental', $hit->target);
        $this->assertSame('/search', $hit->path);
        $this->assertSame(0, $hit->results);
    }

    public function test_a_shop_search_records_the_term_under_the_stores_path(): void
    {
        $this->getJson('/api/v1/store/products?q=Switch')->assertOk();
        $hit = AnalyticsHit::where('kind', 'search')->sole();
        $this->assertSame('switch', $hit->target);
        $this->assertSame('/store', $hit->path);
    }

    public function test_a_term_that_looks_personal_is_not_stored(): void
    {
        $this->getJson('/api/v1/search?q=priya@meridian.test')->assertOk();
        $this->getJson('/api/v1/search?q=%2B91+98765+43210')->assertOk();
        $this->assertSame(0, AnalyticsHit::where('kind', 'search')->count());
    }

    public function test_a_public_newsletter_signup_is_a_conversion_and_an_import_is_not(): void
    {
        NewsletterGroup::create(['name' => 'General newsletter', 'slug' => 'general-newsletter']);
        $this->postJson('/api/v1/newsletter/subscribe', ['email' => 'reader@example.test', '_source_url' => 'https://www.technoware.in/blog'])->assertStatus(202);
        $this->assertSame('/blog', AnalyticsHit::where('kind', 'newsletter_signup')->sole()->path);

        SubscriberIntake::take('imported@example.test', [], [], 'import');
        $this->assertSame(1, AnalyticsHit::where('kind', 'newsletter_signup')->count());
    }

    public function test_a_conversion_failure_never_fails_the_request(): void
    {
        Schema::drop('analytics_hits');
        $this->postJson('/api/v1/enquiries', ['name' => 'P', 'email' => 'p@example.test', 'message' => 'Twenty access points, please, for two floors.'])->assertSuccessful();
        Conversions::record('order_paid', null, 100);
        $this->assertTrue(true, 'nothing was thrown');
    }

    public function test_switched_off_records_no_conversion(): void
    {
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->postJson('/api/v1/enquiries', ['name' => 'P', 'email' => 'p@example.test', 'message' => 'Twenty access points, please, for two floors.'])->assertSuccessful();
        $this->assertSame(0, AnalyticsHit::count());
    }
}
