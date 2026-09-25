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
        $this->save(['social_flip_word' => 'thirteenchars'])->assertStatus(422);

        $this->save(['social_flip_word' => 'Connect1'])->assertOk();
        $this->assertSame('CONNECT1', Setting::get('social_flip_word'));

        // Blank is allowed: every tile then shows its network's initial.
        $this->save(['social_flip_word' => ''])->assertOk();
        $this->assertNull(Setting::get('social_flip_word'));
    }
}
