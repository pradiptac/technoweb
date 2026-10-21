<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\AnalyticsHit;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AnalyticsAdminTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-10-21 12:00', 'Asia/Kolkata'));
    }

    private function asStaff(RoleEnum $role, string $tag = 'a'): static
    {
        $user = User::firstOrCreate(['email' => "{$role->value}-an-{$tag}@example.test"], ['name' => ucfirst($role->value)." {$tag}", 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    private function hit(string $path, string $visitor, array $extra = []): void
    {
        AnalyticsHit::create(['day' => '2026-10-21', 'at' => now(), 'kind' => 'pageview', 'path' => $path, 'visitor' => str_pad($visitor, 16, "\0"), 'entry' => true, 'channel' => 'search', 'source' => 'Google', 'device' => 'desktop', ...$extra]);
    }

    public function test_the_summary_and_a_breakdown_answer_for_the_owning_roles(): void
    {
        $this->hit('/', 'a');
        $this->hit('/about', 'b', ['channel' => 'social', 'source' => 'LinkedIn']);

        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/analytics/summary?from=2026-10-15&to=2026-10-21')
            ->assertOk()->assertJsonPath('data.views.value', 2)->assertJsonPath('data.visits.value', 2)->assertJsonCount(7, 'data.series');
        $this->asStaff(RoleEnum::ContentManager)->getJson('/api/v1/admin/analytics/breakdown?dimension=channel')
            ->assertOk()->assertJsonPath('data.0.label', 'Search')->assertJsonPath('data.0.share', 50.0);
    }

    public function test_other_roles_are_refused_and_bad_parameters_are_a_422(): void
    {
        $this->asStaff(RoleEnum::SupportEngineer)->getJson('/api/v1/admin/analytics/summary')->assertForbidden();
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/breakdown?dimension=planet')->assertStatus(422);
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/summary?from=2024-01-01&to=2026-10-21')->assertStatus(422);
    }

    public function test_switched_off_reports_null_and_the_overview_falls_back(): void
    {
        Setting::query()->where('key', 'native_analytics_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->asStaff(RoleEnum::Admin)->getJson('/api/v1/admin/analytics/summary')->assertOk()->assertJsonPath('meta.enabled', false);
        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/seo')->assertOk()->assertJsonPath('meta.analytics.source', null);
    }

    public function test_the_seo_overview_reads_native_views(): void
    {
        $this->hit('/about', 'a');
        $this->asStaff(RoleEnum::SeoManager)->getJson('/api/v1/admin/seo')->assertOk()->assertJsonPath('meta.analytics.source', 'native');
    }

    public function test_the_export_is_a_csv(): void
    {
        $this->hit('/about', 'a');
        $res = $this->asStaff(RoleEnum::Admin)->get('/api/v1/admin/analytics/export?dimension=page');
        $res->assertOk();
        $this->assertStringContainsString('text/csv', (string) $res->headers->get('Content-Type'));
        $this->assertStringContainsString('/about', $res->streamedContent());
    }

    public function test_sales_sees_conversions_by_source(): void
    {
        AnalyticsHit::create(['day' => '2026-10-21', 'at' => now(), 'kind' => 'enquiry', 'path' => '/contact', 'visitor' => str_pad('x', 16, "\0"), 'channel' => 'email', 'source' => 'newsletter']);
        $this->asStaff(RoleEnum::SalesManager)->getJson('/api/v1/admin/leads/sources')->assertOk()->assertJsonPath('data.0.channel', 'email')->assertJsonPath('data.0.enquiries', 1);
    }
}
