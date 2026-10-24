<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Fluid motion (0.192.0): `motion_feel` and `motion_text`, and the new ids
 * on the existing motion rows. Shape is all the API checks — the lists live
 * in web/src/lib/motion-choices.ts.
 */
class MotionFluidSettingsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private ?User $admin = null;

    private function save(array $pairs)
    {
        $admin = $this->admin ??= User::create([
            'name' => 'Admin', 'email' => 'fluid-admin@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $admin->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        )->id]);

        return $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_new_keys_are_seeded_public_and_default_to_the_site_as_it_was(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('standard', $public['motion_feel']);
        $this->assertSame('none', $public['motion_text']);
    }

    public function test_the_new_ids_save(): void
    {
        $this->save([
            'motion_feel' => 'fluid',
            'motion_text' => 'wave',
            'motion_buttons' => 'magnetic',
            'motion_cards' => 'spring',
            'motion_micro' => 'fluid',
        ])->assertOk();

        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertSame('fluid', $public['motion_feel']);
        $this->assertSame('wave', $public['motion_text']);
        $this->assertSame('magnetic', $public['motion_buttons']);
        $this->assertSame('spring', $public['motion_cards']);
        $this->assertSame('fluid', $public['motion_micro']);
    }

    public function test_a_badly_shaped_id_is_refused_on_its_row(): void
    {
        foreach (['motion_feel', 'motion_text'] as $key) {
            $this->save([$key => 'Fluid Feel!'])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['settings.0.value']);
        }
    }
}
