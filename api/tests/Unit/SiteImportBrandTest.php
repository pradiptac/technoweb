<?php

namespace Tests\Unit;

use App\Support\SiteImport\Brand;
use Tests\TestCase;

/**
 * An old site's colours and fonts read from CSS (0.164.0, `Brand`): known CSS
 * gives the expected hexes, greys and whites are never a brand, a role the
 * stylesheet does not settle is left out, and the font list is pinned to the
 * frontend's.
 */
class SiteImportBrandTest extends TestCase
{
    private const CSS = <<<'CSS'
        /* a comment { color: red } */
        :root { --brand-primary: #C2410C; --brand-accent: rgb(14, 165, 233); --text: #1f2937; --font-heading: "Fraunces", serif; }
        body { font-family: 'Sora', sans-serif; background: #fff; color: var(--text); }
        h1, h2 { font-family: var(--font-heading); color: #111; }
        a { color: #c2410c; }
        a:hover { color: #9a3412; }
        .btn-primary { background-color: var(--brand-primary); border-color: #c2410c; color: #fff; }
        .navbar { background: #0f172a; }
        @media (min-width: 600px) { .btn { background: #c2410c; } }
        .card { border: 1px solid #ddd; background: #f3f4f6; }
        @font-face { font-family: 'Gotham'; src: url('../fonts/gotham.woff2?v=3') format('woff2'); font-weight: 400; }
        @font-face { font-family: 'Gotham'; src: url('../fonts/gotham-bold.woff2') format('woff2'); font-weight: 700; }
        CSS;

    public function test_known_css_gives_the_expected_colours(): void
    {
        $brand = Brand::read(self::CSS);

        $this->assertTrue($brand['found']);
        $this->assertSame('#c2410c', $brand['colours']['primary'], 'buttons, links and the --brand-primary variable agree');
        $this->assertSame('#0ea5e9', $brand['colours']['accent'], 'a variable named accent, rgb() read as a hex');
        $this->assertSame('#ffffff', $brand['colours']['background'], 'body background');
        $this->assertSame('#1f2937', $brand['colours']['text'], 'body colour through var()');
        $this->assertSame('#0f172a', $brand['colours']['topbar'], 'the navbar\'s ground');

        foreach ($brand['colours'] as $role => $hex) {
            $this->assertTrue($hex === null || preg_match('/^#[0-9a-f]{6}$/', $hex) === 1, "{$role} is #rrggbb or nothing");
        }
    }

    public function test_greys_and_whites_are_never_a_brand_colour(): void
    {
        $brand = Brand::read('body { color: #333; background: #fafafa } a { color: #555 } .btn { background: #eee } .navbar { background: #fafafa }');

        $this->assertNull($brand['colours']['primary']);
        $this->assertNull($brand['colours']['secondary']);
        $this->assertNull($brand['colours']['accent']);
        $this->assertSame('#fafafa', $brand['colours']['background']);
        $this->assertNull($brand['colours']['topbar'], 'a top bar the colour of the page is no top bar');
    }

    public function test_fonts_match_the_vendored_faces_and_files_are_offered_for_the_rest(): void
    {
        $faces = [
            ['family' => 'Gotham', 'weight' => 400, 'url' => 'https://acme.test/fonts/gotham.woff2'],
            ['family' => 'Gotham', 'weight' => 700, 'url' => 'https://acme.test/fonts/gotham-bold.woff2'],
        ];
        $brand = Brand::read(self::CSS, $faces);

        $this->assertSame(['family' => 'Fraunces', 'id' => 'fraunces', 'custom' => null], $brand['fonts']['display']);
        $this->assertSame(['family' => 'Sora', 'id' => 'sora', 'custom' => null], $brand['fonts']['body']);

        $unknown = Brand::read('body { font-family: Gotham, Arial, sans-serif }', $faces);

        $this->assertNull($unknown['fonts']['body']['id']);
        $this->assertSame('https://acme.test/fonts/gotham.woff2', $unknown['fonts']['body']['custom']['regular']);
        $this->assertSame('https://acme.test/fonts/gotham-bold.woff2', $unknown['fonts']['body']['custom']['bold']);

        $nofile = Brand::read('body { font-family: Gotham, sans-serif }');
        $this->assertSame('Gotham', $nofile['fonts']['body']['family']);
        $this->assertNull($nofile['fonts']['body']['custom'], 'a family with neither a vendored face nor a file is only named');
    }

    public function test_a_google_font_is_offered_by_name_and_preferred_to_the_sites_own_file(): void
    {
        $faces = [['family' => 'Poppins', 'weight' => 400, 'url' => 'https://acme.test/fonts/poppins.woff2']];
        $brand = Brand::read('body { font-family: Poppins, sans-serif }', $faces);

        $this->assertSame(['family' => 'Poppins', 'id' => 'g-poppins', 'custom' => null], $brand['fonts']['body']);

        // A vendored face still wins, and an unknown family is still only named.
        $this->assertSame('inter', Brand::read('body { font-family: Inter }')['fonts']['body']['id']);
        $this->assertNull(Brand::read('body { font-family: Gotham }')['fonts']['body']['id']);
    }

    public function test_a_headline_only_face_is_not_offered_for_the_body(): void
    {
        $brand = Brand::read("body { font-family: 'Playfair Display', serif } h1 { font-family: 'Playfair Display' }");

        $this->assertSame('playfair', $brand['fonts']['display']['id']);
        $this->assertNull($brand['fonts']['body']['id'], 'the vendored list says Playfair is for headlines only');
    }

    public function test_the_font_list_is_the_frontends(): void
    {
        $source = (string) file_get_contents(base_path('../web/src/lib/font-choices.ts'));
        preg_match_all('/\{ id: "([a-z-]+)", label: "[^"]+", variable: "[^"]+", display: (true|false), body: (true|false)/', $source, $m, PREG_SET_ORDER);

        $this->assertNotEmpty($m, 'font-choices.ts could not be read');

        $frontend = [];
        foreach ($m as $row) {
            $frontend[$row[1]] = ['display' => $row[2] === 'true', 'body' => $row[3] === 'true'];
        }

        foreach (Brand::FONTS as $family => $face) {
            $this->assertArrayHasKey($face['id'], $frontend, "{$family} names a font the frontend does not have");
            $this->assertSame($frontend[$face['id']]['display'], $face['display'], "{$family}: display");
            $this->assertSame($frontend[$face['id']]['body'], $face['body'], "{$family}: body");
        }

        foreach (array_keys($frontend) as $id) {
            $this->assertContains($id, array_column(Brand::FONTS, 'id'), "the vendored face {$id} cannot be matched by name");
        }
    }
}
