<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Support\Backups\Manifest;
use App\Support\System\Requirements;
use App\Support\System\SchedulerSetup;
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

    /**
     * The scheduler's command is worked out for the server answering, and
     * tested where the server allows it (0.128.0). On this machine it is the
     * PHP running the suite, so every part can be asserted exactly.
     */
    public function test_it_reports_the_exact_scheduler_command_for_this_server(): void
    {
        Http::fake(['*/api/health' => Http::response(['status' => 'ok', 'version' => '9.9.9'])]);

        $setup = $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->getJson('/api/v1/admin/system/status')
            ->assertOk()
            ->assertJsonPath('data.scheduler.known', true)
            ->json('data.scheduler.setup');

        $windows = PHP_OS_FAMILY === 'Windows';

        $this->assertSame(PHP_BINARY, $setup['php'], 'the suite runs on the command-line PHP, so that is the answer');
        $this->assertSame(base_path('artisan'), $setup['artisan']);
        $this->assertStringContainsString(PHP_BINARY, $setup['command']);
        $this->assertStringContainsString('artisan', $setup['command']);
        $this->assertStringContainsString(' schedule:run', $setup['command']);
        $this->assertStringEndsWith(' schedule:work', $setup['work']);
        $this->assertTrue($setup['dev'], 'a checkout, not an install');

        if ($windows) {
            // No cron on Windows: a Task Scheduler line instead, and no redirect to a device it does not have.
            $this->assertNull($setup['cron']);
            $this->assertStringStartsWith('schtasks /Create /SC MINUTE /MO 1 ', $setup['windows_task']);
            $this->assertStringNotContainsString('/dev/null', $setup['command']);
        } else {
            $this->assertSame('* * * * * '.$setup['command'], $setup['cron']);
            $this->assertStringEndsWith(' schedule:run >> /dev/null 2>&1', $setup['cron']);
            $this->assertNull($setup['windows_task']);
        }

        // The diagnosis ran the binary and read its version back.
        if (function_exists('proc_open')) {
            $this->assertTrue($setup['php_checked']);
            $this->assertSame(PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION.'.'.PHP_RELEASE_VERSION, $setup['php_version']);
        } else {
            $this->assertNull($setup['php_checked']);
        }
    }

    public function test_a_php_that_cannot_run_the_site_is_reported_as_checked_and_wrong(): void
    {
        // Not a PHP at all: the run fails, which is a result — not "unknown".
        $missing = SchedulerSetup::verify(base_path('no-such-php-binary'));

        if (function_exists('proc_open')) {
            $this->assertSame(['ok' => false, 'version' => null, 'sapi' => null], $missing);
        } else {
            $this->assertNull($missing);
        }
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
