<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The installable website's settings (2026-10-05, docs/pwa.md).
 *
 * Public, because the manifest, the icons and the service worker are built
 * from them before anybody signs in; on by default; the name under the icon
 * held to what a phone's launcher can print.
 */
class PwaSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function save(array $pairs)
    {
        $user = User::create([
            'name' => 'Admin', 'email' => 'pwa-admin-'.uniqid().'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $this->actingAs($user, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_switches_are_public_and_on_by_default(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('1', (string) $public['pwa_enabled']);
        $this->assertSame('1', (string) $public['pwa_install_prompt']);
        // Blank names and icon are dropped from the public map, so the site falls back.
        $this->assertArrayNotHasKey('pwa_name', $public);
        $this->assertArrayNotHasKey('pwa_icon_url', $public);
    }

    public function test_the_names_are_saved_and_published(): void
    {
        $this->save(['pwa_name' => 'Technoware Support', 'pwa_short_name' => 'Technoware'])->assertOk();

        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertSame('Technoware Support', $public['pwa_name']);
        $this->assertSame('Technoware', $public['pwa_short_name']);
    }

    public function test_a_short_name_a_launcher_would_cut_off_is_refused(): void
    {
        $this->save(['pwa_short_name' => 'Technoware Infra'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.value');

        $this->save(['pwa_name' => str_repeat('a', 46)])->assertStatus(422);
    }
}
