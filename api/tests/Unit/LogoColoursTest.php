<?php

namespace Tests\Unit;

use App\Support\Colour;
use App\Support\Media\LogoColours;
use PHPUnit\Framework\TestCase;

class LogoColoursTest extends TestCase
{
    private string $dir;

    protected function setUp(): void
    {
        parent::setUp();
        $this->dir = sys_get_temp_dir().'/logo-colours-'.bin2hex(random_bytes(4));
        mkdir($this->dir);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->dir.'/*') ?: [] as $file) {
            @unlink($file);
        }

        @rmdir($this->dir);
        parent::tearDown();
    }

    private function svg(string $body, string $open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'): string
    {
        $path = $this->dir.'/logo-'.bin2hex(random_bytes(3)).'.svg';
        file_put_contents($path, $open.$body.'</svg>');

        return $path;
    }

    /** Two thirds red, one third blue, with a transparent margin. */
    private function png(): string
    {
        $image = imagecreatetruecolor(60, 30);
        imagealphablending($image, false);
        imagesavealpha($image, true);
        imagefill($image, 0, 0, (int) imagecolorallocatealpha($image, 0, 0, 0, 127));
        imagefilledrectangle($image, 0, 0, 39, 29, (int) imagecolorallocate($image, 255, 0, 0));
        imagefilledrectangle($image, 40, 0, 59, 29, (int) imagecolorallocate($image, 0, 0, 255));
        $path = $this->dir.'/logo.png';
        imagepng($image, $path);
        imagedestroy($image);

        return $path;
    }

    public function test_a_raster_logo_is_read_by_share(): void
    {
        $colours = LogoColours::read($this->png());

        $this->assertNotEmpty($colours);
        $this->assertSame('#ff0000', $colours[0]['hex']);
        $this->assertSame('#0000ff', $colours[1]['hex']);
        $this->assertGreaterThan($colours[1]['share'], $colours[0]['share']);
        $this->assertEqualsWithDelta(1.0, array_sum(array_column($colours, 'share')), 0.001);
    }

    public function test_a_transparent_ground_is_not_the_logos_colour(): void
    {
        foreach (LogoColours::read($this->png()) as $colour) {
            $this->assertNotSame('#000000', $colour['hex']);
        }
    }

    public function test_an_svg_is_read_from_its_fill_attributes(): void
    {
        $colours = LogoColours::read($this->svg(
            '<path d="M0 0h10v10H0z" fill="#1d4ed8"/><path d="M20 0h10v10H20z" fill="#e11d48"/>'
        ));

        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_an_svg_is_read_from_a_style_attribute(): void
    {
        $colours = LogoColours::read($this->svg('<path d="M0 0h10v10H0z" style="fill:#1d4ed8;stroke:#e11d48"/>'));

        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_an_svg_is_read_from_a_style_block(): void
    {
        $colours = LogoColours::read($this->svg(
            '<style>.a{fill:#1d4ed8}.b{fill:#e11d48;stroke:none}</style>'
            .'<path class="a" d="M0 0h1v1H0z"/><path class="b" d="M2 0h1v1H2z"/>'
        ));

        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_a_gradients_stops_are_colours(): void
    {
        $colours = LogoColours::read($this->svg(
            '<defs><linearGradient id="g"><stop stop-color="#1d4ed8"/><stop offset="1" stop-color="#e11d48"/></linearGradient></defs>'
            .'<path d="M0 0h10v10H0z" fill="url(#g)"/>'
        ));

        $this->assertEqualsCanonicalizing(['#1d4ed8', '#e11d48'], array_column($colours, 'hex'));
    }

    public function test_a_big_background_beats_many_small_marks(): void
    {
        $marks = str_repeat('<path d="M1 1h2v2H1z" fill="#e11d48"/>', 40);
        $colours = LogoColours::read($this->svg('<rect width="100" height="100" fill="#1d4ed8"/>'.$marks));

        $this->assertSame('#1d4ed8', $colours[0]['hex'], 'the rect covers the logo, so it leads');
    }

    public function test_an_svg_with_no_colour_of_its_own_reads_as_nothing(): void
    {
        $this->assertSame([], LogoColours::read($this->svg(
            '<path d="M0 0h10v10H0z" fill="currentColor"/><path d="M1 1h2v2H1z" fill="none" stroke="inherit"/>'
        )));
    }

    public function test_a_file_it_cannot_read_is_no_colours_and_no_error(): void
    {
        $broken = $this->dir.'/broken.svg';
        file_put_contents($broken, '<svg><path fill="#1d4ed8"');

        $this->assertSame([], LogoColours::read($broken));
        $this->assertSame([], LogoColours::read($this->dir.'/missing.png'));
        $this->assertSame([], LogoColours::read($this->dir));
    }

    public function test_near_identical_pixels_count_as_one_colour(): void
    {
        $image = imagecreatetruecolor(40, 10);
        imagefilledrectangle($image, 0, 0, 19, 9, (int) imagecolorallocate($image, 255, 0, 0));
        imagefilledrectangle($image, 20, 0, 39, 9, (int) imagecolorallocate($image, 253, 2, 1));
        $path = $this->dir.'/close.png';
        imagepng($image, $path);
        imagedestroy($image);

        $this->assertCount(1, LogoColours::read($path));
    }

    public function test_it_answers_at_most_twelve_colours(): void
    {
        $body = '';

        for ($i = 0; $i < 30; $i++) {
            $body .= sprintf('<path d="M%d 0h1v1H%dz" fill="%s"/>', $i, $i, Colour::hex($i * 8, 255 - $i * 8, 128));
        }

        $this->assertLessThanOrEqual(12, count(LogoColours::read($this->svg($body))));
    }
}
