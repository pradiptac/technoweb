<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use App\Support\System\AppVersion;
use App\Support\System\UpdateMode;
use App\Support\System\Updater;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
use ZipArchive;

/**
 * System → Updates, driven the way the console drives it: apply, then step
 * until done — against a throwaway install folder (`Updater::useHome`), a
 * release zip built and signed here with a key of the test's own.
 *
 * What is pinned is what a customer is trusting: a zip changed after it was
 * signed is refused before anything moves; a file that does not match its
 * signed hash stops the update before the swap and reopens the site; a good
 * one ends with the new code in place, the old one kept, the website
 * restarted and asked for its pages again; and a rollback puts the old code
 * back.
 */
class SystemUpdateTest extends TestCase
{
    use RefreshDatabase;

    private string $home;

    private string $secretKey;

    protected function setUp(): void
    {
        parent::setUp();

        $this->home = sys_get_temp_dir().'/tw-update-'.bin2hex(random_bytes(4));
        foreach (['api/public', 'web/tmp', 'config', 'updates', 'storage/app/public'] as $dir) {
            mkdir($this->home.'/'.$dir, 0755, true);
        }
        file_put_contents($this->home.'/api/marker.txt', 'old');
        file_put_contents($this->home.'/web/marker.txt', 'old');
        file_put_contents($this->home.'/config/install.json', json_encode(['version' => AppVersion::current()]));

        $pair = sodium_crypto_sign_keypair();
        $this->secretKey = sodium_crypto_sign_secretkey($pair);
        config(['release.public_key' => base64_encode(sodium_crypto_sign_publickey($pair)), 'app.internal_token' => str_repeat('t', 64)]);

        Updater::useHome($this->home);

        // The website reports whichever release its folder holds.
        Http::fake(function ($request) {
            if (str_ends_with($request->url(), '/api/health')) {
                $marker = @file_get_contents($this->home.'/web/marker.txt');

                return Http::response(['status' => 'ok', 'version' => $marker === 'new' ? '9.0.0' : AppVersion::current()]);
            }

            return Http::response('ok');
        });
    }

    protected function tearDown(): void
    {
        Updater::useHome(null);
        Updater::remove($this->home);
        UpdateMode::off();

        parent::tearDown();
    }

    private function admin(): User
    {
        $user = User::create(['name' => 'Ada', 'email' => 'ada@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        return $user;
    }

    /**
     * @param  array<string, string>  $files  relative path => contents
     * @param  array<string, string>  $lieAbout  relative path => the hash to claim instead
     */
    private function release(string $version, array $files, array $lieAbout = [], bool $sign = true, ?callable $tamper = null, string $product = 'altis-tech-cms'): string
    {
        $root = "technoware-{$version}";
        $hashes = [];
        foreach ($files as $rel => $contents) {
            $hashes[$rel] = $lieAbout[$rel] ?? hash('sha256', $contents);
        }

        $json = json_encode([
            'product' => $product, 'version' => $version, 'min_from' => '0.0.1',
            'requires' => ['php' => '8.3.0'], 'migrations' => [], 'changelog' => [['version' => $version, 'date' => '2026-10-01', 'text' => 'Test.']],
            'files' => $hashes,
        ])."\n";

        $path = $this->home."/updates/{$root}.zip";
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $zip->addFromString("{$root}/release.json", $tamper ? $tamper($json) : $json);
        if ($sign) {
            $zip->addFromString("{$root}/release.json.sig", base64_encode(sodium_crypto_sign_detached($json, $this->secretKey)));
        }
        foreach ($files as $rel => $contents) {
            $zip->addFromString("{$root}/{$rel}", $contents);
        }
        $zip->addFromString("{$root}/config/api.env", 'MUST_NOT_BE_WRITTEN=1');
        $zip->close();

        return basename($path);
    }

    private function goodFiles(): array
    {
        return [
            'api/marker.txt' => 'new',
            'api/public/index.php' => '<?php // new',
            'web/marker.txt' => 'new',
            'web/tmp/.keep' => '',
            // Next's catch-all routes are folders with dots in their names.
            'web/.next/server/app/brands/[...rest]/page.js' => '// new',
        ];
    }

    /** Press "step" until the run stops moving. @return array<string, mixed> */
    private function drive(User $admin): array
    {
        $run = [];
        for ($i = 0; $i < 60; $i++) {
            $run = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/step')->assertOk()->json('data');
            if (! in_array($run['status'], [...Updater::FORWARD, ...Updater::BACKWARD], true)) {
                break;
            }
        }

        return $run;
    }

    public function test_a_signed_release_is_listed_with_its_changelog(): void
    {
        $file = $this->release('9.0.0', $this->goodFiles());

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/system/updates')
            ->assertOk()
            ->assertJsonPath('data.updatable', true)
            ->assertJsonPath('data.packages.0.file', $file)
            ->assertJsonPath('data.packages.0.signed', true)
            ->assertJsonPath('data.packages.0.refusal', null)
            ->assertJsonPath('data.packages.0.changelog.0.version', '9.0.0');
    }

    public function test_a_zip_changed_after_signing_is_refused_before_anything_moves(): void
    {
        $file = $this->release('9.0.0', $this->goodFiles(), tamper: fn ($json) => str_replace('Test.', 'Evil.', $json));

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])
            ->assertStatus(422)
            ->assertJsonPath('errors.update.0', fn ($m) => str_contains($m, 'signature'));

        $this->assertSame('old', file_get_contents($this->home.'/api/marker.txt'));
        $this->assertFalse(UpdateMode::active());
    }

    public function test_an_unsigned_zip_is_refused(): void
    {
        $file = $this->release('9.0.0', $this->goodFiles(), sign: false);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])
            ->assertStatus(422);
    }

    public function test_a_file_that_does_not_match_its_hash_stops_before_the_swap_and_reopens_the_site(): void
    {
        $file = $this->release('9.0.0', $this->goodFiles(), lieAbout: ['api/marker.txt' => str_repeat('0', 64)]);
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])->assertOk();
        $run = $this->drive($admin);

        $this->assertSame('failed', $run['status']);
        $this->assertSame('extract', $run['failed_at']);
        $this->assertStringContainsString('checksum', $run['error']);
        $this->assertSame('old', file_get_contents($this->home.'/api/marker.txt'));
        $this->assertFalse(UpdateMode::active());

        // Nothing live changed, so it can simply be put aside.
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/abandon')->assertOk();
        $this->assertDirectoryDoesNotExist($this->home.'/api.new');
    }

    public function test_an_update_replaces_both_halves_and_a_rollback_puts_them_back(): void
    {
        $file = $this->release('9.0.0', $this->goodFiles());
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])
            ->assertOk()->assertJsonPath('data.to', '9.0.0');

        $run = $this->drive($admin);

        $this->assertSame('done', $run['status'], json_encode($run));
        $this->assertSame('new', file_get_contents($this->home.'/api/marker.txt'));
        $this->assertSame('old', file_get_contents($this->home.'/api.prev/marker.txt'));
        $this->assertSame('new', file_get_contents($this->home.'/web/marker.txt'));
        $this->assertFileExists($this->home.'/web/tmp/restart.txt');
        $this->assertFileDoesNotExist($this->home.'/config/api.env', 'config/ in a release is never written');
        $this->assertFalse(UpdateMode::active());
        $this->assertSame('9.0.0', json_decode(file_get_contents($this->home.'/config/install.json'), true)['version']);
        Http::assertSent(fn ($r) => str_ends_with($r->url(), '/api/internal/revalidate') && $r->hasHeader('Authorization', 'Bearer '.str_repeat('t', 64)));
        $this->assertDatabaseHas('backups', ['trigger' => 'pre_update']);
        $this->assertDatabaseHas('activity_log', ['action' => 'update_started']);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/system/updates')
            ->assertJsonPath('data.history.0.to', '9.0.0')
            ->assertJsonPath('data.rollback.to', AppVersion::current());

        $key = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/rollback')->assertOk()->json('data.key');
        $this->assertIsString($key);

        // Driven by the run's key alone, as the console does once the restore
        // has dropped the sign-in tables. A wrong key is nothing at all.
        $this->postJson('/api/v1/system/updates/continue', [], ['X-Update-Key' => 'wrong'])->assertNotFound();
        $run = [];
        for ($i = 0; $i < 60; $i++) {
            $run = $this->postJson('/api/v1/system/updates/continue', [], ['X-Update-Key' => $key])->assertOk()->json('data');
            if (! in_array($run['status'], [...Updater::FORWARD, ...Updater::BACKWARD], true)) {
                break;
            }
        }

        $this->assertSame('rolled_back', $run['status'], json_encode($run['log'] ?? $run));
        $this->assertSame('old', file_get_contents($this->home.'/api/marker.txt'));
        $this->assertSame('old', file_get_contents($this->home.'/web/marker.txt'));
        $this->assertDirectoryDoesNotExist($this->home.'/api.failed');
        $this->assertSame(AppVersion::current(), json_decode(file_get_contents($this->home.'/config/install.json'), true)['version']);
    }

    public function test_while_updating_the_rest_of_the_api_is_closed_but_the_updater_is_not(): void
    {
        UpdateMode::on('test');
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/activity')->assertStatus(503)->assertJsonPath('updating', true);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/system/updates')->assertOk();
    }

    public function test_a_path_that_climbs_out_of_the_install_is_refused(): void
    {
        $files = $this->goodFiles() + ['web/../../escaped.txt' => 'nope'];
        $file = $this->release('9.0.0', $files);
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])->assertOk();
        $run = $this->drive($admin);

        $this->assertSame('failed', $run['status']);
        $this->assertStringContainsString('not allowed', $run['error']);
        $this->assertFileDoesNotExist(dirname($this->home).'/escaped.txt');
        $this->assertFalse(UpdateMode::active());
    }

    public function test_a_release_under_the_old_name_is_still_accepted_and_a_stranger_is_not(): void
    {
        $legacy = $this->release('9.0.0', $this->goodFiles(), product: 'technoware');
        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/system/updates')
            ->assertJsonPath('data.packages.0.file', $legacy)
            ->assertJsonPath('data.packages.0.refusal', null);

        unlink($this->home.'/updates/'.$legacy);
        $this->release('9.0.0', $this->goodFiles(), product: 'somebody-else');

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/system/updates')
            ->assertJsonPath('data.packages.0.signed', false)
            ->assertJsonPath('data.packages.0.refusal', fn ($r) => str_contains((string) $r, 'not a release of this software') || str_contains((string) $r, 'cannot read'));
    }

    public function test_an_older_release_is_not_an_update(): void
    {
        $file = $this->release('0.0.2', $this->goodFiles());

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/system/updates/apply', ['file' => $file])
            ->assertStatus(422)
            ->assertJsonPath('errors.update.0', fn ($m) => str_contains($m, 'older'));
    }
}
