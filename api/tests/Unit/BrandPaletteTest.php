<?php

namespace Tests\Unit;

use App\Support\Colour;
use App\Support\Media\BrandPalette;
use PHPUnit\Framework\TestCase;

class BrandPaletteTest extends TestCase
{
    /**
     * @param  list<array{string, float}>  $pairs
     * @return list<array{hex: string, share: float}>
     */
    private function colours(array $pairs): array
    {
        return array_map(fn (array $pair) => ['hex' => $pair[0], 'share' => $pair[1]], $pairs);
    }

    public function test_three_readings_lead_with_three_different_colours(): void
    {
        // Most used: the pale blue. Boldest: the pink. Darkest: the navy.
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#172554', 0.2],
        ]));

        $by = array_column($out['readings'], null, 'key');

        $this->assertSame(['used', 'bold', 'deep'], array_keys($by));
        $this->assertSame('#93c5fd', $by['used']['primary']);
        $this->assertSame('#e11d48', $by['bold']['primary']);
        $this->assertSame('#172554', $by['deep']['primary']);
    }

    public function test_a_reading_orders_its_other_roles_by_its_own_measure(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#f59e0b', 0.2],
        ]));
        $bold = array_column($out['readings'], null, 'key')['bold'];

        $this->assertSame('#e11d48', $bold['primary']);
        $this->assertGreaterThan(Colour::chroma($bold['accent']), Colour::chroma($bold['secondary']));
    }

    public function test_the_greys_of_a_logo_are_never_brand_colours(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#ffffff', 0.7], ['#000000', 0.2], ['#1d4ed8', 0.1],
        ]));

        $this->assertNotEmpty($out['readings']);

        foreach ($out['readings'] as $reading) {
            $this->assertSame('#1d4ed8', $reading['primary']);

            foreach (['secondary', 'accent'] as $role) {
                $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading[$role]), $role);
            }
        }
    }

    public function test_one_colour_derives_the_other_two_and_leaves_the_bar_blank(): void
    {
        $out = BrandPalette::from($this->colours([['#1d4ed8', 1.0]]));

        $this->assertCount(1, $out['readings'], 'three identical readings are one');
        $reading = $out['readings'][0];

        $this->assertSame('#1d4ed8', $reading['primary']);
        $this->assertSame('', $reading['topbar'], 'the generator derives the bar better than we can pin it');
        $this->assertTrue($reading['derived']);

        foreach (['secondary', 'accent'] as $role) {
            $this->assertNotSame('#1d4ed8', $reading[$role], $role);
            $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading[$role]), $role);
        }
    }

    public function test_two_colours_derive_the_third(): void
    {
        $out = BrandPalette::from($this->colours([['#1d4ed8', 0.6], ['#e11d48', 0.4]]));

        $this->assertNotEmpty($out['readings']);

        foreach ($out['readings'] as $reading) {
            $this->assertNotSame($reading['secondary'], $reading['accent'], 'a role is never repeated');
            $this->assertGreaterThan(BrandPalette::MIN_CHROMA, Colour::chroma($reading['accent']));
            $this->assertTrue($reading['derived']);
        }
    }

    public function test_three_colours_are_not_derived(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#172554', 0.2],
        ]));

        foreach ($out['readings'] as $reading) {
            $this->assertFalse($reading['derived']);
        }
    }

    public function test_the_bar_is_the_darkest_brand_colour(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#172554', 0.3], ['#e11d48', 0.2],
        ]));

        foreach ($out['readings'] as $reading) {
            $this->assertSame('#172554', $reading['topbar']);
        }
    }

    public function test_a_logo_with_no_colour_offers_no_reading(): void
    {
        $out = BrandPalette::from($this->colours([['#ffffff', 0.8], ['#303030', 0.2]]));

        $this->assertSame([], $out['readings']);
        $this->assertCount(2, $out['colours'], 'what it found is still reported');
    }

    public function test_nothing_at_all_is_no_reading_and_no_error(): void
    {
        $this->assertSame(['readings' => [], 'colours' => []], BrandPalette::from([]));
    }

    public function test_every_reading_names_itself_for_the_screen(): void
    {
        $out = BrandPalette::from($this->colours([
            ['#93c5fd', 0.5], ['#e11d48', 0.3], ['#172554', 0.2],
        ]));

        foreach ($out['readings'] as $reading) {
            $this->assertNotSame('', $reading['label']);
            foreach (['primary', 'secondary', 'accent'] as $role) {
                $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $reading[$role], $role);
            }
        }
    }
}
