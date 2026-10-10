<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use App\Support\System\SpeedChecks;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * System → Status, "Speed" (docs/distribution.md "Speed suggestions").
 *
 * OPcache's real state is not asserted: it is a fact about whichever PHP runs
 * the suite. Everything else is driven through configuration and rows.
 */
class SystemSpeedTest extends TestCase
{
    use RefreshDatabase;

    private function bearer(RoleEnum $role): static
    {
        $user = User::firstOrCreate(['email' => $role->value.'@example.test'], [
            'name' => 'Ada '.$role->value,
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin', ['admin'])->plainTextToken);
    }

    /** @return array<string, mixed> */
    private function check(string $key): array
    {
        $speed = $this->speed();

        foreach ($speed['checks'] as $check) {
            if ($check['key'] === $key) {
                return $check;
            }
        }

        $this->fail("No check named {$key}.");
    }

    /** @return array<string, mixed> */
    private function speed(): array
    {
        Http::fake(['*/api/health' => Http::response(['status' => 'ok', 'version' => '9.9.9'])]);

        return $this->bearer(RoleEnum::Admin)->getJson('/api/v1/admin/system/status')->assertOk()->json('data.speed');
    }

    public function test_the_status_carries_a_speed_block_of_the_agreed_shape(): void
    {
        $speed = $this->speed();

        $this->assertSame(['measured', 'summary', 'checks'], array_keys($speed));
        $this->assertSame(['boot_ms', 'db_ms', 'website_ms'], array_keys($speed['measured']));
        $this->assertNotNull($speed['measured']['db_ms']);
        $this->assertNotNull($speed['measured']['website_ms'], 'the website answered, so its time was measured');

        $keys = array_column($speed['checks'], 'key');
        foreach (['opcache', 'xdebug', 'optimize', 'debug', 'cache_store', 'queue', 'log_level', 'autoloader', 'database', 'realpath_cache', 'php_version', 'media_cdn', 'large_images', 'third_party'] as $key) {
            $this->assertContains($key, $keys);
        }

        foreach ($speed['checks'] as $check) {
            $this->assertContains($check['group'], ['server', 'app', 'content'], $check['key']);
            $this->assertContains($check['impact'], ['high', 'medium', 'low'], $check['key']);
            $this->assertContains($check['state'], ['good', 'attention', 'unknown', 'info'], $check['key']);
            $this->assertLessThanOrEqual(60, mb_strlen($check['label']), $check['key']);
            $this->assertNotSame('', $check['detail'], $check['key']);
            $this->assertIsString($check['fix']);
            $this->assertTrue($check['snippet'] === null || is_string($check['snippet']), $check['key']);

            if ($check['state'] === 'attention') {
                $this->assertNotSame('', $check['fix'], $check['key'].' says what is wrong and not how to fix it');
            }
        }

        $this->assertContains($this->check('opcache')['state'], ['good', 'attention', 'unknown']);
    }

    public function test_the_summary_adds_up(): void
    {
        $speed = $this->speed();
        $counts = array_count_values(array_column($speed['checks'], 'state'));

        foreach (['good', 'attention', 'unknown'] as $state) {
            $this->assertSame($counts[$state] ?? 0, $speed['summary'][$state], $state);
        }
    }

    public function test_only_an_administrator_can_read_it(): void
    {
        $this->bearer(RoleEnum::ContentManager)->getJson('/api/v1/admin/system/status')->assertForbidden();
    }

    public function test_a_database_cache_is_flagged_and_a_file_cache_is_not(): void
    {
        config(['cache.default' => 'database']);
        $this->assertSame('attention', $this->check('cache_store')['state']);
        $this->assertSame('CACHE_STORE=file', $this->check('cache_store')['snippet']);

        config(['cache.default' => 'file']);
        $this->assertSame('good', $this->check('cache_store')['state']);
    }

    public function test_debug_mode_is_flagged_outside_a_development_install_only(): void
    {
        config(['app.debug' => true, 'app.env' => 'production']);
        $this->assertSame('attention', $this->check('debug')['state']);

        config(['app.debug' => true, 'app.env' => 'local']);
        $this->assertSame('good', $this->check('debug')['state']);

        config(['app.debug' => false, 'app.env' => 'production']);
        $this->assertSame('good', $this->check('debug')['state']);
    }

    public function test_a_queue_that_runs_jobs_at_once_is_flagged(): void
    {
        config(['queue.default' => 'sync']);

        $check = $this->check('queue');

        $this->assertSame('attention', $check['state']);
        $this->assertStringContainsString('while the visitor waits', $check['detail']);
    }

    public function test_an_oversized_picture_is_counted_and_named_and_small_and_trashed_ones_are_not(): void
    {
        Media::create(['disk' => 'public', 'path' => 'media/small.jpg', 'filename' => 'small.jpg', 'mime' => 'image/jpeg', 'size' => 200_000, 'width' => 800, 'height' => 600]);
        Media::create(['disk' => 'public', 'path' => 'media/doc.pdf', 'filename' => 'brochure.pdf', 'mime' => 'application/pdf', 'size' => 9_000_000]);
        $gone = Media::create(['disk' => 'public', 'path' => 'media/gone.jpg', 'filename' => 'deleted-huge.jpg', 'mime' => 'image/jpeg', 'size' => 8_000_000, 'width' => 6000, 'height' => 4000]);
        $gone->delete();

        $this->assertSame('good', $this->check('large_images')['state']);

        Media::create(['disk' => 'public', 'path' => 'media/big.jpg', 'filename' => 'warehouse-photo.jpg', 'mime' => 'image/jpeg', 'size' => 3_500_000, 'width' => 4000, 'height' => 3000]);
        Media::create(['disk' => 'public', 'path' => 'media/wide.png', 'filename' => 'wide-banner.png', 'mime' => 'image/png', 'size' => 400_000, 'width' => 3200, 'height' => 800]);

        $check = $this->check('large_images');

        $this->assertSame('attention', $check['state']);
        $this->assertStringContainsString('2 pictures', $check['detail']);
        $this->assertStringContainsString('warehouse-photo.jpg (3.3 MB)', $check['detail']);
        $this->assertStringContainsString('wide-banner.png', $check['detail']);
        $this->assertStringNotContainsString('small.jpg', $check['detail']);
        $this->assertStringNotContainsString('deleted-huge.jpg', $check['detail']);
        $this->assertStringContainsString('Resize', $check['fix']);
    }

    public function test_a_check_that_throws_comes_back_unknown_and_the_rest_still_run(): void
    {
        $speed = SpeedChecks::run(null, null, [
            'broken' => ['server', 'low', fn () => throw new \RuntimeException('proc_open is disabled'), 'A check that cannot run'],
        ]);

        $broken = collect($speed['checks'])->firstWhere('key', 'broken');

        $this->assertSame('unknown', $broken['state']);
        $this->assertSame('A check that cannot run', $broken['label']);
        $this->assertStringNotContainsString('proc_open', $broken['detail'], 'the exception is not shown to the owner');
        $this->assertContains('debug', array_column($speed['checks'], 'key'));
        $this->assertSame(array_sum($speed['summary']), count(array_filter($speed['checks'], fn ($c) => $c['state'] !== 'info')));
    }
}
