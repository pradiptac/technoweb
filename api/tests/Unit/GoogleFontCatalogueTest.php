<?php

namespace Tests\Unit;

use App\Support\Fonts\GoogleFontCatalogue;
use Tests\TestCase;

class GoogleFontCatalogueTest extends TestCase
{
    public function test_a_family_is_found_by_its_slug(): void
    {
        $f = GoogleFontCatalogue::find('poppins');
        $this->assertSame('Poppins', $f['family']);
        $this->assertContains('latin', $f['subsets']);
        $this->assertContains(400, $f['weights']);
    }

    public function test_an_unknown_slug_is_null(): void
    {
        $this->assertNull(GoogleFontCatalogue::find('not-a-font-anywhere'));
    }

    public function test_search_puts_a_prefix_match_first_and_pages(): void
    {
        $r = GoogleFontCatalogue::search('roboto', null, 1, 3);
        $this->assertCount(3, $r['data']);
        $this->assertStringStartsWith('Roboto', $r['data'][0]['family']);
        $this->assertGreaterThan(3, $r['total']);
    }

    public function test_the_noto_families_are_not_offered(): void
    {
        $this->assertNull(GoogleFontCatalogue::find('noto-sans'));
        // "Monoton" contains the letters, so the rule is on the family's own name.
        $this->assertSame([], array_filter(GoogleFontCatalogue::all(), fn ($f) => str_starts_with($f['slug'], 'noto-')));
    }

    public function test_the_slug_rule(): void
    {
        $this->assertSame('open-sans-condensed', GoogleFontCatalogue::slug('Open Sans Condensed'));
        $this->assertSame('m-plus-1p', GoogleFontCatalogue::slug('M PLUS 1p'));
    }
}
