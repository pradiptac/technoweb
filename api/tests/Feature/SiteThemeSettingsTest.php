<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The site theme: one id naming a folder under `web/src/themes/`.
 *
 * The frontend owns the list and falls back to `classic` for an id it does
 * not know, so — as with the motion ids — the API refuses only a value that
 * is not the shape of an id, at the box it was typed into. `classic` is the
 * site as it was before themes existed, which is what the first test pins:
 * a fresh install, or one that never runs the seeder, renders unchanged.
 */
class SiteThemeSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private ?User $admin = null;

    private function admin(): User
    {
        if ($this->admin) {
            return $this->admin;
        }

        $user = $this->admin = User::create([
            'name' => 'Admin', 'email' => 'theme-admin@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $user;
    }

    private function save(array $pairs)
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_it_is_seeded_public_and_defaults_to_classic(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertArrayHasKey('site_theme', $public, 'the site cannot pick its theme without it');
        $this->assertSame('classic', $public['site_theme']);
    }

    public function test_an_id_saves(): void
    {
        $this->save(['site_theme' => 'editorial'])->assertOk();

        $this->assertSame('editorial', Setting::get('site_theme'));
    }

    public function test_a_value_that_is_not_the_shape_of_an_id_is_refused_at_its_box(): void
    {
        $this->save(['company_name' => 'Technoware', 'site_theme' => '../classic'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.1.value');

        $this->assertSame('classic', Setting::get('site_theme'));
    }

    public function test_the_admin_index_lists_it_under_its_own_group(): void
    {
        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->assertOk()->json('data');

        $this->assertArrayHasKey('themes', $groups);
        $this->assertSame(['site_theme'], array_column($groups['themes'], 'key'));
    }
}
