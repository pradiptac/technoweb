<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 0.171.0: the hero heading effect and the small interactions (docs/motion.md). */
class KineticSettingsTest extends TestCase
{
    use RefreshDatabase;

    private ?User $admin = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function admin(): User
    {
        if ($this->admin) {
            return $this->admin;
        }
        $user = $this->admin = User::create(['name' => 'Admin', 'email' => 'kinetic-admin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));

        return $user;
    }

    private function save(array $pairs)
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_four_keys_are_public_with_their_defaults(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('none', $public['motion_headline']);
        $this->assertSame('lively', $public['motion_micro']);
        $this->assertSame('default', $public['hero_kinetic']);
        $this->assertArrayNotHasKey('hero_kinetic_words', $public, 'blank is dropped from the public map');
    }

    public function test_the_motion_ids_are_shape_checked(): void
    {
        $this->save(['motion_headline' => 'decode', 'motion_micro' => 'none'])->assertOk();
        $this->assertSame('decode', Setting::get('motion_headline'));
        $this->assertSame('none', Setting::get('motion_micro'));
        $this->save(['motion_headline' => 'Type It!'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
        $this->save(['motion_micro' => 'Lots'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
    }

    public function test_the_hero_effect_is_one_of_the_list(): void
    {
        $this->save(['hero_kinetic' => 'rotate'])->assertOk();
        $this->assertSame('rotate', Setting::get('hero_kinetic'));
        $this->save(['hero_kinetic' => 'spin'])->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');

        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->json('data.homepage');
        $row = collect($groups)->firstWhere('key', 'hero_kinetic');
        $this->assertSame(['default', 'none', 'rotate', 'type', 'decode', 'highlight'], array_column($row['options'], 'value'));
    }

    public function test_the_words_are_six_short_lines_at_most(): void
    {
        $this->save(['hero_kinetic_words' => "networks\n\nstorage\nsecurity"])->assertOk();
        $this->assertSame("networks\nstorage\nsecurity", Setting::get('hero_kinetic_words'), 'blank lines are dropped');

        $this->save(['hero_kinetic_words' => implode("\n", array_fill(0, 7, 'word'))])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
        $this->save(['hero_kinetic_words' => str_repeat('x', 41)])
            ->assertUnprocessable()->assertJsonValidationErrors('settings.0.value');
    }
}
