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
 * How the footer's social row is drawn (the client, 2026-09-24): flip tiles
 * spelling a word, or the magnifying dock.
 *
 * Both keys are public — the footer renders before anybody signs in — the
 * style is refused outside its list, and the word is one letter per tile, so
 * anything but letters and digits is refused and what is stored is capitals.
 */
class SocialStyleSettingsTest extends TestCase
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
            'name' => 'Admin', 'email' => 'social-admin-'.uniqid().'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $this->actingAs($user, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_corners_and_spacing_are_public_offered_and_refused_outside_their_lists(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('soft', $public['theme_radius']);
        $this->assertSame('comfortable', $public['theme_density']);

        $this->save(['theme_radius' => 'round', 'theme_density' => 'airy'])->assertOk();
        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertSame('round', $public['theme_radius']);
        $this->assertSame('airy', $public['theme_density']);

        $this->save(['theme_radius' => 'pill'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['theme_density' => 'cramped'])->assertStatus(422);

        $this->assertSame('flat', $public['theme_surface'] ?? $this->getJson('/api/v1/settings')->json('data.theme_surface'));
        $this->save(['theme_surface' => 'elevated'])->assertOk();
        $this->save(['theme_surface' => 'glossy'])->assertStatus(422);
        // 0.121.0: two more finishes, and the heading scale beside them.
        $this->save(['theme_surface' => 'soft'])->assertOk();
        $this->save(['theme_surface' => 'glow'])->assertOk();
        $this->assertSame('glow', $this->getJson('/api/v1/settings')->json('data.theme_surface'));
        $this->save(['theme_type_scale' => 'large'])->assertOk();
        $this->assertSame('large', $this->getJson('/api/v1/settings')->json('data.theme_type_scale'));
        $this->save(['theme_type_scale' => 'huge'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['motion_cards' => 'tilt'])->assertOk();
        $this->save(['motion_cards' => 'Tilt It!'])->assertStatus(422);
    }

    public function test_both_keys_are_seeded_public_with_flip_as_the_default(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('flip', $public['social_style']);
        $this->assertSame('FOLLOW', $public['social_flip_word']);
    }

    public function test_the_style_is_refused_outside_its_list_and_offered_as_options(): void
    {
        $this->save(['social_style' => 'carousel'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $this->save(['social_style' => 'dock'])->assertOk();
        $this->assertSame('dock', Setting::get('social_style'));

        $row = collect($this->getJson('/api/v1/admin/settings')->assertOk()->json('data.social'))
            ->firstWhere('key', 'social_style');
        $this->assertSame(['flip', 'dock'], array_column($row['options'], 'value'));
    }

    public function test_the_word_is_letters_and_digits_and_stored_in_capitals(): void
    {
        $this->save(['social_flip_word' => 'say hi'])->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        // Seven tiles at most: CONTACT fits, one more letter does not.
        $this->save(['social_flip_word' => 'contacts'])->assertStatus(422);

        $this->save(['social_flip_word' => 'Contact'])->assertOk();
        $this->assertSame('CONTACT', Setting::get('social_flip_word'));

        // Blank is allowed: every tile then shows its network's initial.
        $this->save(['social_flip_word' => ''])->assertOk();
        $this->assertNull(Setting::get('social_flip_word'));
    }
}
