<?php

namespace Tests\Unit;

use App\Support\Colour;
use PHPUnit\Framework\TestCase;

class ColourTest extends TestCase
{
    public function test_it_reads_every_css_colour_form(): void
    {
        $this->assertSame('#aabbcc', Colour::fromCss('#abc'));
        $this->assertSame('#aabbcc', Colour::fromCss('#AABBCC'));
        $this->assertSame('#ff0000', Colour::fromCss('rgb(255, 0, 0)'));
        $this->assertSame('#ff0000', Colour::fromCss('rgb(255 0 0)'));
        $this->assertSame('#ff0000', Colour::fromCss('rgba(255,0,0,0.9)'));
        $this->assertSame('#4169e1', Colour::fromCss('royalblue'));
        $this->assertSame('#ffffff', Colour::fromCss(' WHITE '));
    }

    public function test_it_refuses_what_is_not_a_colour(): void
    {
        foreach (['none', 'currentColor', 'inherit', 'url(#grad)', 'transparent', '', 'rgb(1,2)', 'notacolour'] as $value) {
            $this->assertNull(Colour::fromCss($value), $value);
        }
    }

    public function test_a_colour_under_half_opaque_is_not_a_colour(): void
    {
        $this->assertNull(Colour::fromCss('rgba(255,0,0,0.3)'));
        $this->assertNull(Colour::fromCss('rgba(255,0,0,30%)'));
        $this->assertSame('#ff0000', Colour::fromCss('rgba(255,0,0,0.5)'));
    }

    public function test_grey_has_no_chroma_and_a_brand_colour_does(): void
    {
        foreach (['#ffffff', '#000000', '#808080', '#f7f7f7'] as $grey) {
            $this->assertLessThan(0.04, Colour::chroma($grey), $grey);
        }

        foreach (['#1d4ed8', '#e11d48', '#6f8641'] as $brand) {
            $this->assertGreaterThan(0.04, Colour::chroma($brand), $brand);
        }
    }

    public function test_lightness_orders_dark_before_light(): void
    {
        $this->assertLessThan(Colour::lightness('#ffffff'), Colour::lightness('#000000'));
        $this->assertLessThan(Colour::lightness('#dbeafe'), Colour::lightness('#1e3a8a'));
    }

    public function test_rotating_the_hue_keeps_the_colour_as_strong(): void
    {
        $turned = Colour::rotate('#1d4ed8', 150);

        $this->assertMatchesRegularExpression('/^#[0-9a-f]{6}$/', $turned);
        $this->assertNotSame('#1d4ed8', $turned);
        $this->assertEqualsWithDelta(Colour::chroma('#1d4ed8'), Colour::chroma($turned), 0.03);
        $this->assertEqualsWithDelta(Colour::lightness('#1d4ed8'), Colour::lightness($turned), 0.03);
    }

    public function test_rotating_grey_stays_grey(): void
    {
        $this->assertLessThan(0.04, Colour::chroma(Colour::rotate('#808080', 150)));
    }

    public function test_a_hex_is_built_from_channels_and_clamped(): void
    {
        $this->assertSame('#ff0080', Colour::hex(255, 0, 128));
        $this->assertSame('#ffffff', Colour::hex(300, 999, 255));
        $this->assertSame('#000000', Colour::hex(-5, -1, 0));
    }
}
