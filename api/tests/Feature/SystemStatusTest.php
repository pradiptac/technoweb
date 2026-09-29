<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Support\Backups\Manifest;
use App\Support\System\Requirements;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * System → Status, the screen the updater reads before it offers anything.
 *
 * The version it reports is the one `web/src/lib/version.ts` sets, read from
 * there on a checkout: if the two ever disagreed, the updater would compare a
 * release against a number nobody bumped.
 */
class SystemStatusTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => 'Ada '.$role->value,
            'email' => $role->value.'@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    public function test_it_reports_the_version_the_frontend_declares(): void
    {
        Http::fake(['*/api/health' => Http::response(['status' => 'ok', 'version' => '9.9.9', 'api' => ['reachable' => true]])]);

        preg_match('/APP_VERSION\s*=\s*"([^"]+)"/', (string) file_get_contents(base_path('../web/src/lib/version.ts')), $m);

        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->getJson('/api/v1/admin/system/status')
            ->assertOk()
            ->assertJsonPath('data.version.version', $m[1])
            ->assertJsonPath('data.code_schema', Manifest::codeSchema())
            ->assertJsonPath('data.database_schema', Manifest::codeSchema())
            ->assertJsonPath('data.website.reachable', true)
            ->assertJsonPath('data.website.version', '9.9.9')
            ->assertJsonPath('data.installed', null);
    }

    public function test_an_unreachable_website_is_reported_not_thrown(): void
    {
        Http::fake(['*/api/health' => fn () => throw new ConnectionException('refused')]);

        $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->getJson('/api/v1/admin/system/status')
            ->assertOk()
            ->assertJsonPath('data.website.reachable', false)
            ->assertJsonPath('data.website.version', null);
    }

    public function test_only_an_administrator_can_read_it(): void
    {
        $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum')
            ->getJson('/api/v1/admin/system/status')
            ->assertForbidden();
    }

    public function test_every_requirement_names_what_to_do(): void
    {
        foreach (Requirements::check() as $check) {
            $this->assertNotSame('', $check['detail'], $check['key']);
        }

        // This machine runs the suite, so it meets the bar the wizard sets.
        $this->assertTrue(Requirements::satisfied(), json_encode(array_filter(Requirements::check(), fn ($c) => ! $c['ok'])));
    }
}
