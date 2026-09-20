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
 * The motion settings: five style ids and one switch.
 *
 * The frontend resolves every id from its own list and falls back to the
 * default for one it does not know, so the API's job is the fonts' job —
 * refuse a value that is not the shape of an id at the box it was typed
 * into, and otherwise stay out of the way. The defaults are the site as it
 * moved before the group existed, which is what the first test pins.
 */
class MotionSettingsTest extends TestCase
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
            'name' => 'Admin', 'email' => 'motion-admin@example.test',
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

    public function test_the_six_keys_are_seeded_public_and_default_to_the_site_as_it_was(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $defaults = [
            'motion_reveal' => 'lift',
            'motion_buttons' => 'lift',
            'motion_page' => 'none',
            'motion_loader' => 'none',
            'motion_splash' => '0',
            'motion_hero' => 'grid',
        ];

        foreach ($defaults as $key => $value) {
            $this->assertArrayHasKey($key, $public, "$key is public — the site cannot know how to move without it");
            $this->assertSame($value, (string) $public[$key], "$key defaults to what the site did before the setting existed");
        }
    }

    public function test_a_style_and_the_splash_switch_save(): void
    {
        $this->save(['motion_reveal' => 'blur', 'motion_page' => 'rise', 'motion_splash' => '1'])->assertOk();

        $this->assertSame('blur', Setting::get('motion_reveal'));
        $this->assertSame('rise', Setting::get('motion_page'));
        $this->assertTrue((bool) Setting::get('motion_splash'));
    }

    public function test_a_value_that_is_not_the_shape_of_an_id_is_refused_at_its_box(): void
    {
        $this->save(['motion_buttons' => 'lift', 'motion_reveal' => 'Zoom In!'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.1.value');

        // Refused whole: the good value beside it is not written either.
        $this->assertSame('lift', Setting::get('motion_reveal'));
    }

    public function test_the_splash_is_zero_or_one(): void
    {
        $this->save(['motion_splash' => '2'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.0.value');

        $this->assertFalse((bool) Setting::get('motion_splash'));
    }

    public function test_the_admin_index_lists_them_under_their_own_group(): void
    {
        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->assertOk()->json('data');

        $this->assertArrayHasKey('motion', $groups);
        $this->assertEqualsCanonicalizing(
            ['motion_reveal', 'motion_buttons', 'motion_page', 'motion_loader', 'motion_splash', 'motion_hero'],
            collect($groups['motion'])->pluck('key')->all(),
        );
    }
}
