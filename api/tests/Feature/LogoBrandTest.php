<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\Media\BrandPalette;
use App\Support\Media\LogoColours;
use App\Support\System\LogoBrand;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The one place a logo's colours are applied by anything but a person
 * pressing Save: the setup wizard (0.173.0).
 */
class LogoBrandTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function value(string $key): ?string
    {
        return Setting::query()->where('key', $key)->value('value');
    }

    public function test_it_writes_the_four_colours_and_turns_the_palette_custom(): void
    {
        LogoBrand::apply([
            'primary' => '#1d4ed8',
            'secondary' => '#e11d48',
            'accent' => '#0f766e',
            'topbar' => '#172554',
        ]);

        $this->assertSame('custom', $this->value('theme'));
        $this->assertSame('#1d4ed8', $this->value('theme_primary'));
        $this->assertSame('#e11d48', $this->value('theme_secondary'));
        $this->assertSame('#0f766e', $this->value('theme_accent'));
        $this->assertSame('#172554', $this->value('theme_topbar'));
    }

    public function test_a_blank_bar_is_left_for_the_generator_to_derive(): void
    {
        Setting::query()->where('key', 'theme_topbar')->update(['value' => '']);

        LogoBrand::apply([
            'primary' => '#1d4ed8',
            'secondary' => '#e11d48',
            'accent' => '#0f766e',
            'topbar' => '',
        ]);

        $this->assertSame('', $this->value('theme_topbar'), 'blank means derived, never pinned to Primary');
        $this->assertSame('#1d4ed8', $this->value('theme_primary'));
    }

    public function test_it_never_touches_the_background_or_the_text(): void
    {
        $background = $this->value('theme_background');
        $text = $this->value('theme_text');

        LogoBrand::apply([
            'primary' => '#1d4ed8',
            'secondary' => '#e11d48',
            'accent' => '#0f766e',
            'topbar' => '#172554',
        ]);

        $this->assertSame($background, $this->value('theme_background'));
        $this->assertSame($text, $this->value('theme_text'));
    }

    public function test_a_real_logo_goes_from_file_to_settings(): void
    {
        $path = sys_get_temp_dir().'/wizard-logo-'.bin2hex(random_bytes(4)).'.svg';
        file_put_contents($path, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
            .'<rect width="100" height="60" fill="#1d4ed8"/><path d="M0 70h20v20H0z" fill="#e11d48"/></svg>');

        try {
            $palette = BrandPalette::from(LogoColours::read($path));
            $this->assertNotEmpty($palette['readings']);

            LogoBrand::apply($palette['readings'][0]);

            $this->assertSame('custom', $this->value('theme'));
            $this->assertSame('#1d4ed8', $this->value('theme_primary'), 'the big rect is most of the logo');
            $this->assertSame('#e11d48', $this->value('theme_secondary'));
        } finally {
            @unlink($path);
        }
    }

    /**
     * The wizard boots Laravel before it reads the logo's bytes.
     *
     * `Wizard.php` is framework-free until `laravel()`, which is where
     * `vendor/autoload.php` is required — so an `App\` class named before
     * that line is a fatal, not a refusal. The SVG check was above it, and
     * since an SVG is what most logos are, uploading one through the wizard
     * answered `Class "App\Support\SvgSanitiser" not found` with a 500. No
     * audit reaches the wizard; it was found by driving a real install.
     *
     * Read from the source rather than driven, because the wizard answers
     * 404 on a checkout by design (no `config/` beside `api/`) and its input
     * is `$_FILES`. The rule it pins is the one that broke: the boot comes
     * first.
     */
    public function test_the_wizard_boots_laravel_before_it_reads_the_logo(): void
    {
        $source = file_get_contents(base_path('install/Wizard.php'));
        $this->assertIsString($source);

        $start = strpos($source, 'private function logo()');
        $this->assertNotFalse($start, 'Wizard::logo() has been renamed.');

        // To the end of the method: the next method's declaration.
        $end = strpos($source, "
    private function", $start + 10);
        $body = substr($source, $start, $end === false ? null : $end - $start);

        // Comments out first, or this test reads the note above the boot line
        // -- which names the class -- as the code naming it. It did.
        $body = (string) preg_replace('#^\s*//.*$#m', '', $body);

        $boot = strpos($body, '$this->laravel();');
        $this->assertNotFalse($boot, 'Wizard::logo() no longer boots Laravel.');

        // Every class the step needs the autoloader for.
        foreach (['SvgSanitiser', 'MediaUploader', 'Setting::', 'Storage::', 'BrandPalette', 'LogoColours'] as $class) {
            $at = strpos($body, $class);
            if ($at === false) {
                continue;
            }

            $this->assertGreaterThan(
                $boot,
                $at,
                "Wizard::logo() names {$class} before \$this->laravel(), so the autoloader has not run and the step is a 500 rather than a refusal.",
            );
        }
    }
}
