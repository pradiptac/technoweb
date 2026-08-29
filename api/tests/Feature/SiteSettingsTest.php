<?php

namespace Tests\Feature;

use App\Models\Media;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The public settings response, and specifically the image settings.
 *
 * A logo is the one setting whose *shape* the browser has to know before it
 * arrives: the header reserves space from it. The frontend used to guess the
 * aspect ratio, and a guess about a file the client uploaded is wrong by
 * definition — 180x40 declared against a 600x81 mark held 126px open and then
 * painted 207px, so the navigation beside it jumped right on every cold load.
 *
 * These pin the two halves of the fix that can silently come apart: the
 * numbers being present and correct, and their being *absent* rather than
 * wrong when nothing knows them.
 */
class SiteSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function setLogo(string $path): void
    {
        Setting::updateOrCreate(
            ['key' => 'logo_path'],
            ['value' => $path, 'group' => 'general', 'type' => 'string', 'is_secret' => false],
        );
    }

    private function media(array $attributes = []): Media
    {
        return Media::create(array_merge([
            'disk' => 'public',
            'path' => 'media/2026/08/logo.png',
            'filename' => 'logo.png',
            'mime' => 'image/png',
            'size' => 4096,
            'width' => 600,
            'height' => 81,
        ], $attributes));
    }

    public function test_an_image_setting_carries_the_files_own_dimensions(): void
    {
        $this->media();
        $this->setLogo('media/2026/08/logo.png');

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('600', $data['logo_width']);
        $this->assertSame('81', $data['logo_height']);
        // The URL is what it always was; the dimensions travel beside it.
        $this->assertStringEndsWith('storage/media/2026/08/logo.png', $data['logo_url']);
    }

    public function test_dimensions_are_absent_rather_than_guessed_when_no_media_row_exists(): void
    {
        // A path typed by hand, or one uploaded before the library recorded
        // dimensions. Sending 0 or a default here would be worse than sending
        // nothing: the frontend cannot tell a real number from a made-up one.
        $this->setLogo('media/2026/08/typed-by-hand.png');

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertArrayNotHasKey('logo_width', $data);
        $this->assertArrayNotHasKey('logo_height', $data);
        $this->assertArrayHasKey('logo_url', $data);
    }

    public function test_a_binned_file_still_reports_its_dimensions(): void
    {
        /*
         * Deleting a media row fills the bin and **keeps the bytes**, so the
         * path still serves and the image still renders. Dimensions that
         * vanished with the soft delete would reintroduce the layout shift for
         * a logo that is still on screen — and the default scope is exactly
         * what makes that happen silently.
         */
        $this->media()->delete();
        $this->setLogo('media/2026/08/logo.png');

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('600', $data['logo_width']);
        $this->assertSame('81', $data['logo_height']);
    }

    public function test_dimensions_are_absent_when_the_row_never_recorded_them(): void
    {
        // width/height are nullable, so a row can exist and know nothing.
        $this->media(['width' => null, 'height' => null]);
        $this->setLogo('media/2026/08/logo.png');

        $data = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertArrayNotHasKey('logo_width', $data);
        $this->assertArrayNotHasKey('logo_height', $data);
    }
}
