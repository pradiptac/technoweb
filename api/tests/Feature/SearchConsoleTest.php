<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Solution;
use App\Models\User;
use App\Support\Seo\SearchConsole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Google Search Console, read into the SEO screens — `App\Support\Seo\SearchConsole`.
 * Google is faked at both endpoints; the service-account key is one made here.
 */
class SearchConsoleTest extends TestCase
{
    use RefreshDatabase;

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

    /**
     * A throwaway RSA key made once with `openssl genrsa 2048` and kept here
     * rather than generated per run: `openssl_pkey_new` needs an
     * `openssl.cnf` this machine's PHP does not ship, and a test that
     * fails for want of one proves nothing about the client.
     */
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

    private function connect(): void
    {
        $row = Setting::updateOrCreate(['key' => 'gsc_service_account'], ['group' => 'integrations', 'type' => 'text', 'is_secret' => true]);
        $row->setPlainValue(json_encode(['client_email' => 'seo@project.iam.gserviceaccount.com', 'private_key' => self::TEST_KEY]));
        $row->save();
        Setting::flushCache();
        Cache::flush();
    }

    private function fakeGoogle(array $pageRows, array $queryRows = []): void
    {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test', 'expires_in' => 3600]),
            'searchconsole.googleapis.com/*' => function ($request) use ($pageRows, $queryRows) {
                $dims = $request->data()['dimensions'] ?? [];

                return Http::response(['rows' => $dims === ['query'] ? $queryRows : $pageRows]);
            },
        ]);
    }

    public function test_it_is_off_until_a_service_account_is_saved(): void
    {
        Http::fake();

        $this->assertFalse(SearchConsole::configured());
        $this->assertSame([], SearchConsole::pages());
        Http::assertNothingSent();
    }

    public function test_the_property_is_derived_from_the_frontend_url_as_a_domain_property(): void
    {
        config(['app.frontend_url' => 'https://www.technoware.in']);

        $this->assertSame('sc-domain:technoware.in', SearchConsole::siteUrl());
    }

    public function test_pages_come_back_keyed_by_path_and_reach_the_overview(): void
    {
        $this->connect();
        $this->fakeGoogle([
            ['keys' => ['https://www.technoware.in/solutions/networking'], 'clicks' => 12, 'impressions' => 480, 'ctr' => 0.025, 'position' => 8.4],
            ['keys' => ['https://www.technoware.in/solutions/firewall/'], 'clicks' => 0, 'impressions' => 90, 'ctr' => 0, 'position' => 14.2],
            ['keys' => ['https://www.technoware.in/'], 'clicks' => 200, 'impressions' => 1000, 'ctr' => 0.2, 'position' => 1.2],
        ]);
        Solution::create(['title' => 'Networking', 'slug' => 'networking', 'summary' => 'x', 'status' => 'published']);
        Solution::create(['title' => 'Firewall', 'slug' => 'firewall', 'summary' => 'x', 'status' => 'published']);

        $pages = SearchConsole::pages();
        $this->assertSame(480, $pages['/solutions/networking']['impressions']);
        $this->assertSame(90, $pages['/solutions/firewall']['impressions'], 'a trailing slash is the same page');
        $this->assertSame(200, $pages['/']['clicks']);

        // The token is asked for once and the table once; the second read is the cache.
        SearchConsole::pages();
        Http::assertSentCount(2);

        $rows = $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?type=solution')->assertOk()->json();
        $this->assertTrue($rows['meta']['search']['configured']);
        $networking = collect($rows['data'])->firstWhere('slug', 'networking');
        $this->assertSame(12, $networking['search']['clicks']);
        $this->assertSame(8.4, $networking['search']['position']);

        // Shown and never opened.
        $noClicks = $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo?search=no_clicks')->assertOk()->json('data');
        $this->assertCount(1, $noClicks);
        $this->assertSame('firewall', $noClicks[0]['slug']);
    }

    public function test_a_pages_queries_are_read_for_the_assistant(): void
    {
        $this->connect();
        $this->fakeGoogle([], [
            ['keys' => ['firewall installation kolkata'], 'clicks' => 3, 'impressions' => 140, 'position' => 6.1],
        ]);

        $queries = SearchConsole::queriesFor('/solutions/firewall');

        $this->assertSame('firewall installation kolkata', $queries[0]['query']);
        $this->assertSame(140, $queries[0]['impressions']);

        Http::assertSent(function ($request) {
            $data = $request->data();

            return str_contains($request->url(), 'searchAnalytics/query')
                && ($data['dimensionFilterGroups'][0]['filters'][0]['expression'] ?? null) === 'https://www.technoware.in/solutions/firewall';
        });
    }

    public function test_a_refusal_is_recorded_in_googles_words_and_the_overview_stands(): void
    {
        $this->connect();
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'ya29.test']),
            'searchconsole.googleapis.com/*' => Http::response(['error' => ['message' => 'User does not have sufficient permission for site sc-domain:technoware.in.']], 403),
        ]);

        $this->assertSame([], SearchConsole::pages());
        $this->assertStringContainsString('sufficient permission', SearchConsole::lastError());

        $this->actingAs($this->seoManager())->getJson('/api/v1/admin/seo')->assertOk()
            ->assertJsonPath('meta.search.configured', true)
            ->assertJsonPath('meta.search.error', 'Google answered 403: User does not have sufficient permission for site sc-domain:technoware.in.');
    }

    public function test_the_settings_test_button_reports_pages_or_googles_words(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/gsc/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'No Search Console service account is saved. Paste the JSON key file above and save first.');

        $this->connect();
        $this->fakeGoogle([['keys' => ['https://www.technoware.in/'], 'clicks' => 1, 'impressions' => 2, 'ctr' => 0.5, 'position' => 1]]);

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/gsc/test')
            ->assertOk()
            ->assertJsonPath('data.pages', 1)
            ->assertJsonPath('data.days', 28);
    }

    public function test_a_key_that_is_not_googles_file_is_refused_before_any_call(): void
    {
        $row = Setting::updateOrCreate(['key' => 'gsc_service_account'], ['group' => 'integrations', 'type' => 'text', 'is_secret' => true]);
        $row->setPlainValue('{"not": "a key"}');
        $row->save();
        Setting::flushCache();
        Cache::flush();
        Http::fake();

        $this->actingAs($this->admin())
            ->postJson('/api/v1/admin/settings/integrations/gsc/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'The service account key is not the JSON file Google issued: it needs client_email and private_key.');

        Http::assertNothingSent();
    }
}
