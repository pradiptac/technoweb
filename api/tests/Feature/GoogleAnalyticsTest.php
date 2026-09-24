<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Order;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\StoreProduct;
use App\Models\User;
use App\Support\Seo\GoogleAnalytics;
use App\Support\Seo\SearchConsole;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Google Analytics 4, read into the SEO overview and the store dashboard —
 * `App\Support\Seo\GoogleAnalytics`.
 *
 * Google is faked at both endpoints (the token exchange and the Data API's
 * `runReport`); nothing here makes a real call. What is pinned: the report
 * parses into a path-keyed map with query strings stripped and duplicate
 * paths summed; a refusal is recorded in Google's own words and the reads
 * degrade to nothing rather than failing the screen; a success clears it;
 * `productViews()` is **null** — never zero — when GA4 is not configured or
 * refused, because "unmeasured" and "nobody looked" are different claims;
 * the overview rows and the dashboard's funnel carry the figures; and the
 * settings test button answers 200 or 422 with Google's sentence.
 */
class GoogleAnalyticsTest extends TestCase
{
    use RefreshDatabase;

    /** The same throwaway key `SearchConsoleTest` carries, for the same reason. */
    private const TEST_KEY = <<<'PEM'
-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDHWIthAiuJ8KYC
biCk31N++wLfowwAubnhiBs23hfYOkwVAM7O2ahfdVtwgsHTYfZP/lTmznPVgJ9d
IhMs0aBwNJA1rtbKFXjD1M4ldsfJlJ6KkKv3Bi5lng7CzXXxVF9jnlmVd+N2cvaP
WIaNbldPsS2rNCpBo8yex5tKrZJ2NaFxPqF8L+c2NwOIk9viYxBkHpzZSrlnanx+
s1yCHm6Qj0aTZRRJszf3eE8j+Qmrg/SIullQyJET7GDggx6ieKUqulG/Zf7oSSX/
xnUpkL71naglAvBVGTHHX14+hNhpEDi+DkJLLI+7yF6B/4vTMoSngAg2obSKIWEV
KW+++HQ9AgMBAAECggEAQoHnFnlr3zyblkn5uCgOKlpCjixOr9tHCdioA7k7SVfB
1GwNk3OIujhkRnhJhGW1kOCwoMSWXs/n22Gn9hcGKQlQZ6iqXoelX+ia0mL7quRb
tK0pwmOcjSibkiCMTfSxUoIdL0HtcLJQUmjdk0gR9zOMogboZjfo57x+sf6Q08Df
U1O3qJrfPcHH9o/7Quc+xTawbWAU8450yAGAGnceUfzC/f+rf4RgsepkAzavurAP
H/ke5NHsLYJW8bbAQtop+GUspbp6B97K8yWP26u1Z9H0TFezu8+lVGo7Z225Niqh
nBVODVT6xxqLjnUC6t3awC39kj+WGX5e+mFR/c2pPQKBgQD6JUneosZe19R0qvUO
CdT3VRf2uUpOfQO3sxFgVxYu4ye3XnxsjtsOwBBHkxOZLl7B/I7eANx9TH9iytM3
RqsAQBCGYkMxBonQLbPT8vcvmU1ONJpVXo6C8DthZ0jLBah73YnaAriT6CSXVq8v
r5UmtRY8eqvp+R1BxlxE9JQwawKBgQDMAuV4apl6x6E8QqCw8JALlsD9QboeIy51
wnZA60pGGpslYQSA0kAjndErjMpJ6umI3C5OD4d3+QoBibsS2/fUufeVTuK3X+TK
uk+SJ19eivqEXb1oMLQj3Pz0YTPfWlhMG10Z75ld4cqMQOKvStEEMP8mD20VB51g
koGrE3R39wKBgQDDnTlhI0WhkYKRIce1DLdAG4k75bZYHqczlpL2FeRBEl5SpU8D
zcs8g7G3ZyqiVYLAjHJk5aOHULUlWptF1LuQ3IiPrnQA+K344GSKUKxAys+LYtN2
AxXLC3ZEO3LPYUNaaeqNVCdncth6iM1CqzomJOKYtQ2PUMIyV558Rg9EtQKBgA2D
X5nDTdlBId/w9d3igVgTK0NbOC3I3Mn2EIkqTKgqGP6312mFA7SYPoOo9rlAsyla
lEKdara6qzwA2IBeS6MukkS0jfXhhzEaeCzRKNMFV6Su5N3i4/vAJo01Zw8zV8fq
xBb0tO7wBs+VeK5twTyK1ku6F9qdv4HnEmm3hy5vAoGAefCwd4TyEwS2O9zvHkiV
dKbXeHRQRA/+uhvE3egJiA07EUwnVh8eC/Wwen/vSv8+x4r9McZTHRUUOi5bZ6Dk
tLOqLw4WZIMrFRXUZ6GtnSFUereLhn+H2V93BNx5NPgSTZt++l5R8BxWneAx6DK7
/B67i1JsRcdTJq2PVqm105E=
-----END PRIVATE KEY-----
PEM;

    private function admin(): User
    {
        $user = User::firstOrCreate(['email' => 'admin@example.test'], ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => 'Administrator'])->id]);

        return $user;
    }

    private function seoManager(): User
    {
        $user = User::firstOrCreate(['email' => 'seo@example.test'], ['name' => 'Seo', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => 'seo_manager'], ['name' => 'SEO manager'])->id]);

        return $user;
    }

    private function storeManager(): User
    {
        $user = User::firstOrCreate(['email' => 'store@example.test'], ['name' => 'Store', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::StoreManager->value], ['name' => 'Store manager'])->id]);

        return $user;
    }

    /** The service account — the same row Search Console reads — and a property id. */
    private function connect(string $property = '123456789'): void
    {
        $row = Setting::updateOrCreate(['key' => 'gsc_service_account'], ['group' => 'integrations', 'type' => 'text', 'is_secret' => true]);
        $row->setPlainValue(json_encode(['client_email' => 'seo@project.iam.gserviceaccount.com', 'private_key' => self::TEST_KEY]));
        $row->save();
        Setting::updateOrCreate(['key' => 'ga4_property_id'], ['group' => 'integrations', 'type' => 'string', 'value' => $property]);
        Setting::updateOrCreate(['key' => 'ga4_error'], ['group' => 'integrations', 'type' => 'string', 'value' => null]);
        Setting::flushCache();
        Cache::flush();
    }

    /** A `runReport` row as the Data API shapes it: dimension values then metric values, every one a string. */
    private function row(string $path, int $views, int $users): array
    {
        return [
            'dimensionValues' => [['value' => $path]],
            'metricValues' => [['value' => (string) $views], ['value' => (string) $users]],
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $pageRows  rows for a report by `pagePath`
     * @param  int|null  $productViews  the single-row total for the product-views report, or null for no rows
     */
    private function fakeGoogle(array $pageRows, ?int $productViews = null): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test', 'expires_in' => 3600]),
            // The service account is Search Console's too, so the overview reads it as configured; it answers nothing here.
            'searchconsole.googleapis.com/*' => Http::response(['rows' => []]),
            'analyticsdata.googleapis.com/*' => function ($request) use ($pageRows, $productViews) {
                $data = $request->data();

                // No dimensions: the filtered total the dashboard asks for.
                if (($data['dimensions'] ?? []) === []) {
                    return Http::response(['rows' => $productViews === null ? [] : [
                        ['metricValues' => [['value' => (string) $productViews]]],
                    ]]);
                }

                return Http::response(['rows' => $pageRows]);
            },
        ]);
    }

    private function product(): StoreProduct
    {
        return StoreProduct::create([
            'name' => 'A switch', 'slug' => 'switch-'.uniqid(),
            'type' => ProductType::Physical, 'status' => PublishStatus::Published,
            'price_paise' => 1180000, 'track_stock' => true, 'stock' => 20,
        ]);
    }

    private function paidOrder(): Order
    {
        $product = $this->product();
        $total = 1180000;

        $order = Order::create([
            'order_number' => Order::nextNumber(),
            'status' => OrderStatus::Paid,
            'subtotal_paise' => $total, 'taxable_paise' => (int) round($total * 10000 / 11800),
            'gst_paise' => $total - (int) round($total * 10000 / 11800), 'total_paise' => $total,
            'customer_name' => 'Neil Basu', 'customer_email' => 'neil@example.test',
            'placed_at' => now(), 'paid_at' => now(),
        ]);

        $order->items()->create([
            'store_product_id' => $product->id,
            'name' => $product->name, 'type' => $product->type,
            'quantity' => 1, 'unit_price_paise' => $total, 'line_total_paise' => $total,
            'returnable' => true,
        ]);

        return $order;
    }

    // ------------------------------------------------------ configuration

    public function test_it_is_off_until_a_property_id_and_the_service_account_are_saved(): void
    {
        Http::fake();

        $this->assertFalse(GoogleAnalytics::configured());
        $this->assertSame([], GoogleAnalytics::pages());
        $this->assertNull(GoogleAnalytics::productViews(Carbon::today()->subDays(29), Carbon::today()));
        Http::assertNothingSent();

        // The key alone is not enough: the property is the other half.
        $this->connect('');
        $this->assertFalse(GoogleAnalytics::configured());
        $this->assertNull(GoogleAnalytics::productViews(Carbon::today()->subDays(29), Carbon::today()));
        Http::assertNothingSent();
    }

    /** The two Google reads share one credential and ask for one token each, per scope. */
    public function test_the_token_is_asked_for_once_per_scope_and_shared_with_search_console(): void
    {
        $this->connect();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test', 'expires_in' => 3600]),
            'analyticsdata.googleapis.com/*' => Http::response(['rows' => []]),
            'searchconsole.googleapis.com/*' => Http::response(['rows' => []]),
        ]);

        GoogleAnalytics::pages();
        SearchConsole::pages();
        GoogleAnalytics::pages();
        SearchConsole::pages();

        // Two scopes, two tokens; two reports; the repeats are the cache.
        Http::assertSentCount(4);
        Http::assertSent(fn ($request) => $request->url() === 'https://oauth2.googleapis.com/token');
        $this->assertTrue(SearchConsole::configured());
    }

    // ------------------------------------------------------ pages

    public function test_pages_come_back_keyed_by_path_with_query_strings_stripped_and_reach_the_overview(): void
    {
        $this->connect();
        $this->fakeGoogle([
            $this->row('/solutions/networking', 120, 80),
            $this->row('/solutions/networking?utm_source=newsletter', 30, 20),
            $this->row('/solutions/firewall/', 9, 7),
            $this->row('/', 900, 600),
            $this->row('/?fbclid=abc', 10, 8),
        ]);
        Solution::create(['title' => 'Networking', 'slug' => 'networking', 'summary' => 'x', 'status' => 'published']);
        Solution::create(['title' => 'Firewall', 'slug' => 'firewall', 'summary' => 'x', 'status' => 'published']);
        Solution::create(['title' => 'Storage', 'slug' => 'storage', 'summary' => 'x', 'status' => 'published']);

        $pages = GoogleAnalytics::pages();

        $this->assertSame(['views' => 150, 'users' => 100], $pages['/solutions/networking'], 'a query string is the same page, and the rows add up');
        $this->assertSame(['views' => 9, 'users' => 7], $pages['/solutions/firewall'], 'a trailing slash is the same page');
        $this->assertSame(['views' => 910, 'users' => 608], $pages['/'], 'the front page stays /');
        $this->assertNull(GoogleAnalytics::lastError());

        // The token once and the report once; the second read is the cache.
        GoogleAnalytics::pages();
        Http::assertSentCount(2);
        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), '/properties/123456789:runReport')
                && ($data['dimensions'][0]['name'] ?? null) === 'pagePath'
                && ($data['metrics'][0]['name'] ?? null) === 'screenPageViews'
                && ($data['metrics'][1]['name'] ?? null) === 'totalUsers';
        });

        $res = $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?type=solution')->assertOk()->json();
        $this->assertSame(['configured' => true, 'days' => 28, 'error' => null], $res['meta']['analytics']);
        $rows = collect($res['data']);
        $this->assertSame(['views' => 150, 'users' => 100], $rows->firstWhere('slug', 'networking')['analytics']);
        $this->assertNull($rows->firstWhere('slug', 'storage')['analytics'], 'a page nobody opened is null, not zero');
    }

    /**
     * Google shows it, nobody opens it. With Search Console on, `no_views`
     * is a row with search figures and no analytics; without it, any row
     * with no analytics — and when GA4 itself is off there is nothing to
     * say, so the filter yields nothing rather than everything.
     */
    public function test_no_views_filters_to_pages_search_shows_that_nobody_opens(): void
    {
        Solution::create(['title' => 'Networking', 'slug' => 'networking', 'summary' => 'x', 'status' => 'published']);
        Solution::create(['title' => 'Firewall', 'slug' => 'firewall', 'summary' => 'x', 'status' => 'published']);
        Solution::create(['title' => 'Storage', 'slug' => 'storage', 'summary' => 'x', 'status' => 'published']);

        // One fake for the whole test: a second `Http::fake()` never
        // answers a URL the first already stubs.
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test']),
            'analyticsdata.googleapis.com/*' => Http::response(['rows' => [$this->row('/solutions/networking', 5, 5)]]),
            'searchconsole.googleapis.com/*' => Http::response(['rows' => [
                ['keys' => ['https://www.technoware.in/solutions/networking'], 'clicks' => 2, 'impressions' => 40, 'ctr' => 0.05, 'position' => 8],
                ['keys' => ['https://www.technoware.in/solutions/firewall'], 'clicks' => 0, 'impressions' => 60, 'ctr' => 0, 'position' => 12],
            ]]),
        ]);

        // Off: nothing can be said, and nothing is asked.
        $this->assertSame([], $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?analytics=no_views')->assertOk()->json('data'));
        Http::assertNothingSent();

        // On, Search Console not configured (one credential serves both, so
        // the property has to be unresolvable): every page with no views.
        $this->connect();
        config(['app.frontend_url' => '']);
        $this->assertFalse(SearchConsole::configured());
        $slugs = collect($this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?type=solution&analytics=no_views')->assertOk()->json('data'))->pluck('slug')->sort()->values()->all();
        $this->assertSame(['firewall', 'storage'], $slugs);

        // On, Search Console configured too: only the pages search is showing.
        config(['app.frontend_url' => 'https://www.technoware.in']);
        $rows = $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?type=solution&analytics=no_views')->assertOk()->json('data');
        $this->assertCount(1, $rows);
        $this->assertSame('firewall', $rows[0]['slug']);
    }

    // ------------------------------------------------------ refusal

    public function test_a_refusal_is_recorded_in_googles_words_and_a_success_clears_it(): void
    {
        $this->connect();
        $refuse = true;
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test']),
            'searchconsole.googleapis.com/*' => Http::response(['rows' => []]),
            'analyticsdata.googleapis.com/*' => function () use (&$refuse) {
                return $refuse
                    ? Http::response(['error' => ['message' => 'User does not have sufficient permissions for this property.', 'status' => 'PERMISSION_DENIED']], 403)
                    : Http::response(['rows' => [$this->row('/', 1, 1)]]);
            },
        ]);

        $this->assertSame([], GoogleAnalytics::pages());
        $this->assertSame('Google answered 403: User does not have sufficient permissions for this property.', GoogleAnalytics::lastError());
        $this->assertNull(GoogleAnalytics::productViews(Carbon::today()->subDays(29), Carbon::today()), 'a refusal is null, never zero');

        $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo')->assertOk()
            ->assertJsonPath('meta.analytics.configured', true)
            ->assertJsonPath('meta.analytics.error', 'Google answered 403: User does not have sufficient permissions for this property.');

        // The next successful read clears the banner.
        Cache::flush();
        $refuse = false;
        $this->assertSame(['views' => 1, 'users' => 1], GoogleAnalytics::pages()['/']);
        $this->assertNull(GoogleAnalytics::lastError());
    }

    // ------------------------------------------------------ the store dashboard

    public function test_the_funnel_is_null_until_analytics_is_connected(): void
    {
        Http::fake();
        $this->paidOrder();

        $funnel = $this->actingAs($this->storeManager(), 'sanctum')->getJson('/api/v1/admin/store/dashboard')->assertOk()->json('data.funnel');

        $this->assertSame(1, $funnel['paid_orders']);
        $this->assertNull($funnel['product_views']);
        $this->assertNull($funnel['views_to_orders']);
        Http::assertNothingSent();
    }

    public function test_the_funnel_reads_product_views_for_the_window_and_rates_paid_orders_against_them(): void
    {
        $this->connect();
        $this->fakeGoogle([], 400);
        $this->paidOrder();
        $this->paidOrder();

        $funnel = $this->actingAs($this->storeManager(), 'sanctum')->getJson('/api/v1/admin/store/dashboard?days=7')->assertOk()->json('data.funnel');

        $this->assertSame(400, $funnel['product_views']);
        $this->assertSame(2, $funnel['paid_orders']);
        $this->assertSame(0.005, $funnel['views_to_orders']);

        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), ':runReport')
                && ($data['dimensionFilter']['filter']['fieldName'] ?? null) === 'pagePath'
                && ($data['dimensionFilter']['filter']['stringFilter']['value'] ?? null) === '/store/products/'
                && ($data['dateRanges'][0]['startDate'] ?? null) === Carbon::today()->subDays(6)->toDateString()
                && ($data['dateRanges'][0]['endDate'] ?? null) === Carbon::today()->toDateString();
        });

    }

    /** A refusal on the dashboard's own read is null too, not zero, and the words are kept. */
    public function test_a_refused_report_leaves_the_funnel_null(): void
    {
        $this->connect();
        $this->paidOrder();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test']),
            'analyticsdata.googleapis.com/*' => Http::response(['error' => ['message' => 'Quota exceeded.']], 429),
        ]);

        $funnel = $this->actingAs($this->storeManager(), 'sanctum')->getJson('/api/v1/admin/store/dashboard?days=7')->assertOk()->json('data.funnel');

        $this->assertSame(1, $funnel['paid_orders']);
        $this->assertNull($funnel['product_views']);
        $this->assertNull($funnel['views_to_orders']);
        $this->assertSame('Google answered 429: Quota exceeded.', GoogleAnalytics::lastError());
    }

    /** Google answered and there were none: a measured zero, and a rate of nothing over nothing is null. */
    public function test_no_product_views_is_zero_and_the_rate_is_then_null(): void
    {
        $this->connect();
        $this->fakeGoogle([], null);

        $funnel = $this->actingAs($this->storeManager(), 'sanctum')->getJson('/api/v1/admin/store/dashboard')->assertOk()->json('data.funnel');

        $this->assertSame(0, $funnel['product_views']);
        $this->assertNull($funnel['views_to_orders']);
    }

    // ------------------------------------------------------ the settings button

    public function test_the_settings_test_button_reports_pages_or_googles_words(): void
    {
        $refuse = false;
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test']),
            'analyticsdata.googleapis.com/*' => function () use (&$refuse) {
                return $refuse
                    ? Http::response(['error' => ['message' => 'Requested entity was not found.']], 404)
                    : Http::response(['rows' => [$this->row('/', 3, 2), $this->row('/contact', 1, 1)]]);
            },
        ]);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/ga4/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No Google Analytics property is saved. Save the Search Console service account and the GA4 property id above first.');
        Http::assertNothingSent();

        $this->connect();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/ga4/test')
            ->assertOk()
            ->assertJsonPath('data.property', '123456789')
            ->assertJsonPath('data.days', 1)
            ->assertJsonPath('data.pages', 2);

        Http::assertSent(fn ($request) => str_contains($request->url(), ':runReport')
            && ($request->data()['dateRanges'][0]['startDate'] ?? null) === 'yesterday');

        $refuse = true;

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/ga4/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Google answered 404: Requested entity was not found.');
    }

    public function test_a_property_id_that_is_not_a_number_is_refused_on_write(): void
    {
        $this->seed(SettingsSeeder::class);

        $this->actingAs($this->admin())
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ga4_property_id', 'value' => 'G-ABC123']]])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['settings.0.value']);

        $this->actingAs($this->admin())
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ga4_property_id', 'value' => ' 123456789 ']]])
            ->assertOk();

        $this->assertSame('123456789', Setting::get('ga4_property_id'));
    }
}
