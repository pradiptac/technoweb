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
        $this->assertSame(['site_theme', 'site_theme_options'], array_column($groups['themes'], 'key'));
    }

    public function test_theme_options_are_cleaned_and_stored_as_json(): void
    {
        $json = json_encode([
            'classic' => [
                'menu_style' => 'big',
                'hero_style' => 'split',
                'sections' => [
                    'partners' => ['kind' => 'solid', 'colour' => '#0B1020', 'angle' => ''],
                    'why' => ['kind' => 'gradient', 'colour' => '#1e3a8a', 'colour2' => '#0b1020', 'angle' => 135],
                    'cta' => ['kind' => 'default'],
                    'hero' => ['kind' => 'image', 'image_path' => 'media/2026/09/x.jpg', 'overlay' => 55],
                ],
            ],
        ]);

        $this->save(['site_theme_options' => $json])->assertOk();

        $stored = json_decode(Setting::get('site_theme_options'), true);

        $this->assertSame('big', $stored['classic']['menu_style']);
        $this->assertSame('#0b1020', $stored['classic']['sections']['partners']['colour'], 'lower-cased');
        $this->assertArrayNotHasKey('angle', $stored['classic']['sections']['partners'], 'a blank angle is dropped');
        $this->assertSame(135, $stored['classic']['sections']['why']['angle']);
        $this->assertArrayNotHasKey('cta', $stored['classic']['sections'], 'a default carries nothing');
        $this->assertSame(55, $stored['classic']['sections']['hero']['overlay']);
        $this->assertArrayNotHasKey('image_url', $stored['classic']['sections']['hero'], 'the URL is derived on read, never stored');

        // Published with the URL beside the path, on both responses.
        $public = json_decode($this->getJson('/api/v1/settings')->json('data.site_theme_options'), true);
        $this->assertStringEndsWith('/storage/media/2026/09/x.jpg', $public['classic']['sections']['hero']['image_url']);

        $groups = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->json('data');
        $row = collect($groups['themes'])->firstWhere('key', 'site_theme_options');
        $this->assertStringContainsString('image_url', $row['value']);
    }

    public function test_theme_options_of_the_wrong_shape_are_refused_at_their_row(): void
    {
        foreach ([
            'not json',
            '[1,2]',
            json_encode(['../x' => []]),
            json_encode(['classic' => ['menu_style' => 'Big Menu']]),
            json_encode(['classic' => ['sections' => ['hero' => ['kind' => 'neon']]]]),
            json_encode(['classic' => ['sections' => ['hero' => ['kind' => 'solid', 'colour' => 'red']]]]),
            json_encode(['classic' => ['sections' => ['hero' => ['kind' => 'gradient', 'colour' => '#000000']]]]),
            json_encode(['classic' => ['sections' => ['hero' => ['kind' => 'image', 'image_path' => '../../.env']]]]),
            json_encode(['classic' => ['sections' => ['hero' => ['kind' => 'image', 'image_path' => 'media/a.jpg', 'overlay' => 95]]]]),
        ] as $bad) {
            $this->save(['company_name' => 'Technoware', 'site_theme_options' => $bad])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('settings.1.value');
        }

        $this->assertNull(Setting::get('site_theme_options'));
    }

    public function test_a_blank_theme_options_row_clears_it(): void
    {
        $this->save(['site_theme_options' => json_encode(['classic' => ['menu_style' => 'simple']])])->assertOk();
        $this->save(['site_theme_options' => ''])->assertOk();

        $this->assertNull(Setting::get('site_theme_options'));
        $this->assertArrayNotHasKey('site_theme_options', $this->getJson('/api/v1/settings')->json('data'));
    }
}
