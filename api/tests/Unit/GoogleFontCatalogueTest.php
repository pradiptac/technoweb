<?php

namespace Tests\Unit;

use App\Support\Fonts\GoogleFontCatalogue;
use Tests\TestCase;

class GoogleFontCatalogueTest extends TestCase
{
    public function test_a_family_is_found_by_its_slug(): void
    {
        $f = GoogleFontCatalogue::find('noto-sans-devanagari');
        $this->assertSame('Noto Sans Devanagari', $f['family']);
        $this->assertContains('devanagari', $f['subsets']);
        $this->assertContains(400, $f['weights']);
    }

    public function test_an_unknown_slug_is_null(): void
    {
        $this->assertNull(GoogleFontCatalogue::find('not-a-font-anywhere'));
    }

    public function test_search_puts_a_prefix_match_first_and_pages(): void
    {
        $r = GoogleFontCatalogue::search('noto sans', null, 1, 10);
        $this->assertCount(10, $r['data']);
        $this->assertStringStartsWith('Noto Sans', $r['data'][0]['family']);
        $this->assertGreaterThan(10, $r['total']);
    }

    public function test_the_slug_rule(): void
    {
        $this->assertSame('noto-sans-devanagari', GoogleFontCatalogue::slug('Noto Sans Devanagari'));
        $this->assertSame('m-plus-1p', GoogleFontCatalogue::slug('M PLUS 1p'));
    }
}
