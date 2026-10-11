<?php

namespace Tests\Unit;

use App\Support\SiteImport\Outline;
use App\Support\SiteImport\PageKind;
use App\Support\SiteImport\PageReader;
use App\Support\SiteImport\Specs;
use App\Support\WordPress\Rendered\Dom;
use App\Support\WordPress\Rendered\RenderedSections;
use Tests\TestCase;

/**
 * Page, post or product by the rules (0.164.0, `PageKind`), the facts a page
 * states about itself (`PageReader`), the spec sheet (`Specs`), the text a
 * model is shown (`Outline`) and the new recognisers: a banner with no
 * `<h1>`, a Vimeo player, a set of pictured cards.
 */
class SiteImportKindTest extends TestCase
{
    /** @return array<string, mixed> the facts `PageReader` finds in a page */
    private function facts(string $html, string $url = 'https://acme.test/x'): array
    {
        return PageReader::read(['url' => $url, 'path' => '/x', 'html' => $html, 'title' => 't', 'status' => 200], [], null)['facts'];
    }

    private function page(string $head, string $body): string
    {
        return '<!doctype html><html><head><title>Page</title>'.$head.'</head><body>'.$body.'</body></html>';
    }

    public function test_structured_data_decides_first(): void
    {
        $post = $this->facts($this->page('<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"BlogPosting","datePublished":"2026-03-04T10:00:00+05:30","author":{"@type":"Person","name":"Asha Rao"}}]}</script>', '<main><p>Words.</p></main>'));
        $this->assertEqualsCanonicalizing(['WebSite', 'BlogPosting', 'Person'], $post['jsonld']);
        $this->assertSame('2026-03-04T10:00:00+05:30', $post['published']);
        $this->assertSame('Asha Rao', $post['author']);
        $this->assertSame(PageKind::POST, PageKind::detect($post, '/something')['kind']);

        $product = $this->facts($this->page('<script type="application/ld+json">{"@type":"Product","name":"Switch","sku":"SW-24"}</script>', '<main><p>Words.</p></main>'));
        $this->assertSame('SW-24', $product['sku']);
        $this->assertSame(PageKind::PRODUCT, PageKind::detect($product, '/anything')['kind']);
    }

    public function test_an_article_with_a_date_and_an_author_is_a_post(): void
    {
        $facts = $this->facts($this->page('', '<main><article><h1>Hello</h1><p class="byline">By Asha Rao</p><time datetime="2026-01-02">2 Jan</time><p>Body.</p></article></main>'));

        $this->assertTrue($facts['article']);
        $this->assertSame('2026-01-02', $facts['time']);
        $this->assertSame(['kind' => PageKind::POST, 'certain' => true], array_intersect_key(PageKind::detect($facts, '/hello'), ['kind' => 1, 'certain' => 1]));
    }

    public function test_the_address_makes_a_post_but_not_a_listing(): void
    {
        $plain = $this->facts($this->page('', '<main><p>Words.</p></main>'));

        $this->assertSame(PageKind::POST, PageKind::detect($plain, '/blog/my-first-post')['kind']);
        $this->assertSame(PageKind::POST, PageKind::detect($plain, '/news/2026/launch')['kind']);
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/blog')['kind'], 'the blog\'s own index');
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/blog/category/wifi')['kind']);
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/blog/page/2')['kind']);
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/blog/2026')['kind'], 'a year archive');
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/about')['kind']);
        $this->assertSame(PageKind::PAGE, PageKind::detect($plain, '/')['kind']);
    }

    public function test_a_sku_beside_a_spec_table_is_a_product_and_either_alone_is_ambiguous(): void
    {
        $table = '<table><tr><th>Ports</th><td>24</td></tr><tr><th>Uplinks</th><td>4 SFP</td></tr><tr><th>Power</th><td>PoE+</td></tr></table>';
        $both = $this->facts($this->page('', '<main><h1>Switch</h1><p>SKU: CBS-24T</p>'.$table.'</main>'));
        $this->assertSame('CBS-24T', $both['sku']);
        $this->assertSame(3, $both['specs']);
        $this->assertSame(PageKind::PRODUCT, PageKind::detect($both, '/shop/cbs-24t')['kind']);

        $tableOnly = PageKind::detect($this->facts($this->page('', '<main><h1>Compare</h1>'.$table.'</main>')), '/compare');
        $this->assertFalse($tableOnly['certain']);
        $this->assertSame(PageKind::PAGE, $tableOnly['kind'], 'with the AI off an ambiguous page is a page');
        $this->assertSame(PageKind::PRODUCT, $tableOnly['guess']);

        $article = PageKind::detect($this->facts($this->page('', '<main><article><h1>Note</h1><time datetime="2026-01-02">x</time><p>y</p></article></main>')), '/note');
        $this->assertFalse($article['certain']);
        $this->assertSame(PageKind::POST, $article['guess']);
    }

    public function test_a_layout_table_is_not_a_spec_sheet_and_the_sheet_comes_out_in_order(): void
    {
        $layout = '<table><tr><td>a</td><td>b</td><td>c</td></tr><tr><td>d</td><td>e</td><td>f</td></tr><tr><td>g</td><td>h</td><td>i</td></tr></table>';
        $this->assertSame([], Specs::split($layout)['specs']);

        $split = Specs::split('<p>Intro</p><dl><dt>Warranty:</dt><dd>3 years</dd><dt>Ports</dt><dd>24</dd><dt>Weight</dt><dd>2 kg</dd></dl><p>Outro</p>');

        $this->assertSame(['Warranty' => '3 years', 'Ports' => '24', 'Weight' => '2 kg'], $split['specs']);
        $this->assertSame(['Warranty', 'Ports', 'Weight'], array_keys($split['specs']), 'the order the page gave');
        $this->assertStringNotContainsString('<dl', $split['html'], 'the sheet is not repeated in the sections');
        $this->assertStringContainsString('Intro', $split['html']);
        $this->assertStringContainsString('Outro', $split['html']);
    }

    public function test_the_outline_is_text_with_numbered_links_and_pictures_and_never_markup(): void
    {
        $outline = Outline::of('<div class="x" onclick="evil()"><h3>Plan</h3><p>Five users. <a href="https://acme.test/buy">Buy now</a></p><ul><li>One</li><li>Two</li></ul><img src="https://acme.test/a.png" alt="A box"><script>alert(1)</script></div>', 'Pricing');

        $text = $outline->text();

        $this->assertStringContainsString('# Pricing', $text);
        $this->assertStringContainsString('### Plan', $text);
        $this->assertStringContainsString('- One', $text);
        $this->assertStringContainsString('Buy now [L1]', $text);
        $this->assertStringContainsString('[P1: A box]', $text);
        $this->assertStringNotContainsString('<', $text);
        $this->assertStringNotContainsString('alert', $text);
        $this->assertStringNotContainsString('onclick', $text);
        $this->assertSame([['title' => 'Buy now', 'path' => 'https://acme.test/buy']], $outline->links());
        $this->assertSame('https://acme.test/a.png', $outline->pictures()[0]['src']);
        $this->assertSame($outline->hash(), Outline::of('<div class="x" onclick="evil()"><h3>Plan</h3><p>Five users. <a href="https://acme.test/buy">Buy now</a></p><ul><li>One</li><li>Two</li></ul><img src="https://acme.test/a.png" alt="A box"><script>alert(1)</script></div>', 'Pricing')->hash());
    }

    private function sections(string $html): array
    {
        $walker = new RenderedSections(
            fn (string $h) => trim($h) === '' ? null : $h,
            fn (string $src) => 'media/'.basename((string) parse_url($src, PHP_URL_PATH)),
            null,
            RenderedSections::siteRecognisers(),
        );

        return $walker->toSections('<div>'.$html.'</div>');
    }

    public function test_a_banner_with_no_h1_is_a_hero_when_nothing_in_it_would_be_lost(): void
    {
        $banner = '<section class="masthead"><div class="container"><div class="display-3">Fast Wi-Fi for offices</div><p>Installed in a week.</p><a class="btn btn-primary" href="/contact">Get a quote</a></div></section><p>The rest of the page carries on here with enough words to matter.</p>';
        $rows = $this->sections($banner);

        $this->assertSame('hero', $rows[0]['type']);
        $this->assertSame('Fast Wi-Fi for offices', $rows[0]['data']['heading']);
        $this->assertSame('Installed in a week.', $rows[0]['data']['lede']);
        $this->assertSame('Get a quote', $rows[0]['data']['primary']['label']);

        // No button: a banner that is only a few words is text.
        $this->assertNotSame('hero', $this->sections('<section class="hero"><div class="title">Just words</div><p>And a line.</p></section>')[0]['type'] ?? null);
        // An extra paragraph the hero would drop keeps the block as text.
        $this->assertNotSame('hero', $this->sections('<section class="hero"><h2>Heading</h2><p>One line.</p><p>A second paragraph of words that a hero has nowhere to put.</p><a class="btn" href="/x">Go</a></section>')[0]['type']);
        // Not classed as a banner: not a hero.
        $this->assertNotSame('hero', $this->sections('<section class="content"><h2>Heading</h2><p>One line.</p><a class="btn" href="/x">Go</a></section>')[0]['type'] ?? null);
    }

    public function test_a_vimeo_player_is_kept_as_a_clean_iframe(): void
    {
        $rows = $this->sections('<p>Watch our story and see how we work with every customer.</p><iframe src="https://player.vimeo.com/video/123456789?h=abc&autoplay=1" width="500" height="281"></iframe><div class="lazy"><iframe data-src="//vimeo.com/987654321"></iframe></div>');
        $all = implode(' ', array_map(fn (array $r) => (string) ($r['data']['body'] ?? ''), $rows));

        $this->assertStringContainsString('<iframe src="https://player.vimeo.com/video/123456789" width="640" height="360"></iframe>', $all);
        $this->assertStringContainsString('https://player.vimeo.com/video/987654321', $all);
        $this->assertStringNotContainsString('autoplay', $all);
    }

    public function test_cards_with_pictures_keep_them_in_a_layout_section(): void
    {
        $card = fn (string $n) => '<div class="col"><img src="https://acme.test/img/'.$n.'.jpg" alt="'.$n.'"><h3>Service '.$n.'</h3><p>What '.$n.' does for you.</p><a href="/s/'.$n.'">More</a></div>';
        $rows = $this->sections('<div class="row">'.$card('a').$card('b').$card('c').'</div>');

        $this->assertSame('layout', $rows[0]['type']);
        $columns = $rows[0]['data']['rows'][0]['columns'];
        $this->assertCount(3, $columns);

        $types = array_column($columns[0]['widgets'], 'type');
        $this->assertSame(['image', 'heading', 'text', 'button'], $types);
        $this->assertStringEndsWith('/a.jpg', $columns[0]['widgets'][0]['image_path']);
        $this->assertSame('Service a', $columns[0]['widgets'][1]['text']);
        $this->assertSame('/s/a', $columns[0]['widgets'][3]['href']);

        // Without pictures it is the features section it always was.
        $plain = $this->sections('<div class="row"><div><h3>One</h3><p>First thing.</p></div><div><h3>Two</h3><p>Second thing.</p></div><div><h3>Three</h3><p>Third thing.</p></div></div>');
        $this->assertSame('features', $plain[0]['type']);
        $this->assertArrayNotHasKey('photo', $plain[0]['data']['items'][0]);
    }

    public function test_the_hero_helper_is_the_same_for_both_heroes(): void
    {
        // The refactor moved GenericHero's accounting into Structure::hero(); an h1 hero reads as before.
        $rows = $this->sections('<header class="hero"><h1>Managed IT</h1><p>We run it.</p><a class="btn" href="/c">Talk</a></header>');
        $this->assertSame('hero', $rows[0]['type']);
        $this->assertSame('Managed IT', $rows[0]['data']['heading']);
        $this->assertNotNull(Dom::load('<p>x</p>'));
    }
}
