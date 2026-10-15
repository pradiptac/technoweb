<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\ThemeOptions;
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
                'topbar_style' => 'columns',
                'hero_style' => 'split',
                'section_order' => ['cta', 'hero', 'cta', 'partners'],
                'sections' => [
                    'web' => ['kind' => 'default', 'enabled' => false],
                    'resources' => ['kind' => 'default', 'enabled' => 'no'],
                    'partners' => ['kind' => 'solid', 'colour' => '#0B1020', 'angle' => '', 'enabled' => false],
                    'why' => ['kind' => 'gradient', 'colour' => '#1e3a8a', 'colour2' => '#0b1020', 'angle' => 135],
                    'cta' => ['kind' => 'default'],
                    'hero' => ['kind' => 'image', 'image_path' => 'media/2026/09/x.jpg', 'overlay' => 55],
                    // "None": the page's own ground — a colour typed before switching kind is dropped.
                    'support' => ['kind' => 'page', 'colour' => '#123456'],
                    // How a section appears: kept on a default ground, kept beside a
                    // colour, and "none" — the homepage's own default — stores nothing.
                    'solutions' => ['kind' => 'default', 'reveal' => 'fade-up'],
                    'industries' => ['kind' => 'solid', 'colour' => '#1e3a8a', 'reveal' => 'zoom-in'],
                    'clients' => ['kind' => 'default', 'reveal' => 'none'],
                    // A texture over a ground: kept, and "none" stores nothing.
                    'contact' => ['kind' => 'page', 'texture' => 'mesh'],
                    'brands' => ['kind' => 'solid', 'colour' => '#1e3a8a', 'texture' => 'none'],
                ],
            ],
        ]);

        $this->save(['site_theme_options' => $json])->assertOk();

        $stored = json_decode(Setting::get('site_theme_options'), true);

        $this->assertSame('big', $stored['classic']['menu_style']);
        $this->assertSame('columns', $stored['classic']['topbar_style'], 'the top-bar panel style is a choice id like the others');
        $this->assertSame('#0b1020', $stored['classic']['sections']['partners']['colour'], 'lower-cased');
        $this->assertArrayNotHasKey('angle', $stored['classic']['sections']['partners'], 'a blank angle is dropped');
        $this->assertSame(135, $stored['classic']['sections']['why']['angle']);
        $this->assertArrayNotHasKey('cta', $stored['classic']['sections'], 'a default carries nothing');
        $this->assertSame(55, $stored['classic']['sections']['hero']['overlay']);
        $this->assertSame(['cta', 'hero', 'partners'], $stored['classic']['section_order'], 'duplicates dropped, order kept');
        $this->assertSame(['kind' => 'default', 'enabled' => false], $stored['classic']['sections']['web'], 'a switched-off default is kept for the switch');
        $this->assertArrayNotHasKey('resources', $stored['classic']['sections'], 'only an explicit false switches a section off');
        $this->assertFalse($stored['classic']['sections']['partners']['enabled']);
        $this->assertArrayNotHasKey('image_url', $stored['classic']['sections']['hero'], 'the URL is derived on read, never stored');
        $this->assertSame(['kind' => 'page'], $stored['classic']['sections']['support'], 'the page ground carries no colour');
        $this->assertSame(['kind' => 'default', 'reveal' => 'fade-up'], $stored['classic']['sections']['solutions'], 'a reveal survives a default ground');
        $this->assertSame('zoom-in', $stored['classic']['sections']['industries']['reveal']);
        $this->assertArrayNotHasKey('clients', $stored['classic']['sections'], '"none" is the default and stores nothing');
        $this->assertSame(['kind' => 'page', 'texture' => 'mesh'], $stored['classic']['sections']['contact']);
        $this->assertArrayNotHasKey('texture', $stored['classic']['sections']['brands'], 'no texture stores nothing');

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
            json_encode(['classic' => ['sections' => ['why' => ['kind' => 'default', 'reveal' => 'Slide In!']]]]),
            json_encode(['classic' => ['sections' => ['why' => ['kind' => 'default', 'reveal' => 3]]]]),
            json_encode(['classic' => ['section_order' => 'hero,cta']]),
            json_encode(['classic' => ['sections' => ['why' => ['kind' => 'page', 'texture' => 'sparkles']]]]),
            json_encode(['classic' => ['section_order' => ['hero', '../x']]]),
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

    public function test_header_and_footer_parts_are_cleaned_and_stored_as_differences(): void
    {
        $json = json_encode([
            'launch' => [
                'header' => [
                    'parts' => ['search' => ['on' => false], 'phone' => ['on' => false], 'scheme' => ['on' => true]],
                    'order' => ['cta', 'search', 'cta', 'phone'],
                    'cta' => ['label' => '  Get a quote ', 'href' => '/quote', 'on' => true],
                    'cta2' => ['label' => '', 'href' => ''],
                ],
                'footer' => ['parts' => ['signup' => ['on' => false]], 'order' => ['social', 'tagline']],
            ],
            // Nothing in them: stores nothing.
            'classic' => ['header' => [], 'footer' => ['parts' => [], 'order' => []]],
        ]);

        $this->save(['site_theme_options' => $json])->assertOk();

        $stored = json_decode(Setting::get('site_theme_options'), true);

        $this->assertSame(['search' => ['on' => false], 'phone' => ['on' => false], 'scheme' => ['on' => true]], $stored['launch']['header']['parts']);
        $this->assertSame(['cta', 'search', 'phone'], $stored['launch']['header']['order'], 'duplicates dropped, order kept');
        $this->assertSame(['label' => 'Get a quote', 'href' => '/quote', 'on' => true], $stored['launch']['header']['cta'], 'the label is trimmed');
        $this->assertArrayNotHasKey('cta2', $stored['launch']['header'], 'a blank button stores nothing');
        $this->assertSame(['signup' => ['on' => false]], $stored['launch']['footer']['parts']);
        $this->assertSame(['social', 'tagline'], $stored['launch']['footer']['order']);
        $this->assertArrayNotHasKey('header', $stored['classic'], 'an empty header stores nothing: absent is the theme\'s own');
        $this->assertArrayNotHasKey('footer', $stored['classic']);
    }

    public function test_header_and_footer_options_of_the_wrong_shape_are_refused_at_their_row(): void
    {
        foreach ([
            // Not a part this side has.
            ['header' => ['parts' => ['signup' => ['on' => false]]]],
            ['footer' => ['parts' => ['search' => ['on' => false]]]],
            ['header' => ['parts' => ['mystery' => ['on' => false]]]],
            // A button is switched in its own object, not as a part.
            ['header' => ['parts' => ['cta' => ['on' => false]]]],
            ['footer' => ['cta' => ['label' => 'Hi']]],
            // A switch is a boolean.
            ['header' => ['parts' => ['search' => ['on' => 'no']]]],
            ['header' => ['parts' => ['search' => false]]],
            ['header' => ['cta' => ['on' => 0]]],
            // The order names known ids of that side.
            ['header' => ['order' => ['search', 'columns']]],
            ['footer' => ['order' => 'tagline,social']],
            ['header' => ['order' => ['../x']]],
            // A button's words and link.
            ['header' => ['cta' => ['label' => str_repeat('x', 31)]]],
            ['header' => ['cta' => ['label' => '<b>Buy</b>']]],
            ['header' => ['cta' => ['href' => 'javascript:alert(1)']]],
            ['header' => ['cta' => ['href' => '//evil.example']]],
            ['header' => ['cta2' => ['href' => 'no spaces/allowed here']]],
            // An unknown key, and the wrong container.
            ['header' => ['colour' => '#ffffff']],
            ['header' => 'search'],
        ] as $bad) {
            $this->save(['company_name' => 'Technoware', 'site_theme_options' => json_encode(['classic' => $bad])])
                ->assertUnprocessable()
                ->assertJsonValidationErrors('settings.1.value');
        }

        $this->assertNull(Setting::get('site_theme_options'));
    }

    public function test_a_button_label_of_exactly_the_limit_and_the_link_kinds_are_accepted(): void
    {
        $label = str_repeat('x', ThemeOptions::CTA_LABEL_MAX);

        foreach (['/contact', 'https://example.test/book', 'mailto:sales@example.test', 'tel:+911234567890'] as $href) {
            $this->save(['site_theme_options' => json_encode(['classic' => ['header' => ['cta' => ['label' => $label, 'href' => $href]]]])])->assertOk();
            $this->assertSame($href, json_decode(Setting::get('site_theme_options'), true)['classic']['header']['cta']['href']);
        }
    }

    public function test_the_admin_settings_meta_names_the_ids_a_row_may_use(): void
    {
        $meta = $this->actingAs($this->admin(), 'sanctum')->getJson('/api/v1/admin/settings')->json('meta.theme_parts');

        $this->assertSame(ThemeOptions::HEADER_PARTS, $meta['header']);
        $this->assertSame(ThemeOptions::FOOTER_PARTS, $meta['footer']);
        $this->assertSame(30, $meta['cta_label_max']);
    }
}
