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
 * The appearance settings: five colours, two fonts, one theme id.
 *
 * The frontend derives a whole palette from the colours and falls back per
 * field for anything that is not a hex — so the API's job is to refuse the
 * typo at the box it was typed into rather than let the house colour be
 * silently painted where somebody meant their brand's.
 */
class AppearanceSettingsTest extends TestCase
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
            'name' => 'Admin', 'email' => 'appearance-admin@example.test',
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

    public function test_the_eight_keys_are_seeded_and_published(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        foreach (['theme', 'theme_primary', 'theme_secondary', 'theme_accent', 'theme_background', 'theme_text', 'theme_font_display', 'theme_font_body'] as $key) {
            $this->assertArrayHasKey($key, $public, "$key is public — the site cannot paint itself without it");
        }
        $this->assertSame('technoware', $public['theme']);
        $this->assertSame('#6f8641', $public['theme_primary']);
    }

    public function test_a_custom_palette_saves_and_is_lower_cased(): void
    {
        $this->save([
            'theme' => 'custom', 'theme_primary' => '#2563EB', 'theme_accent' => '#10B981',
            'theme_font_display' => 'fraunces',
        ])->assertOk();

        $this->assertSame('#2563eb', Setting::get('theme_primary'));
        $this->assertSame('#10b981', Setting::get('theme_accent'));
        $this->assertSame('fraunces', Setting::get('theme_font_display'));
    }

    /** Refused at the box, not painted over with the house colour. */
    public function test_a_colour_that_is_not_a_hex_is_refused_naming_its_row(): void
    {
        $this->save(['theme_primary' => '#2563eb', 'theme_secondary' => 'blue'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.1.value');

        $this->assertSame('#6f8641', Setting::get('theme_primary'), 'the whole request is refused, not half of it');
    }

    public function test_a_three_digit_hex_is_refused(): void
    {
        $this->save(['theme_background' => '#fff'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.0.value');
    }

    public function test_a_font_id_with_the_wrong_shape_is_refused(): void
    {
        $this->save(['theme_font_body' => 'Inter Tight'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('settings.0.value');
    }

    /** A legacy theme id and a preset id both save; the frontend resolves either. */
    public function test_preset_and_legacy_ids_both_save(): void
    {
        $this->save(['theme' => 'ocean'])->assertOk();
        $this->assertSame('ocean', Setting::get('theme'));

        $this->save(['theme' => 'plum'])->assertOk();
        $this->assertSame('plum', Setting::get('theme'));
    }

    /** A blank colour is stored as null and the frontend falls back — not refused. */
    public function test_a_blank_colour_clears_rather_than_refuses(): void
    {
        $this->save(['theme_accent' => ''])->assertOk();

        $this->assertNull(Setting::get('theme_accent'));
    }
}
