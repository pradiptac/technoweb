<?php

namespace Tests\Unit;

use App\Support\SiteImport\Chrome;
use App\Support\SiteImport\NavReader;
use App\Support\SiteImport\PageDocument;
use App\Support\SiteImport\Paths;
use App\Support\SiteImport\SiteName;
use App\Support\SiteImport\ZipSource;
use Tests\TestCase;

/**
 * The site import's reading of a page: what is furniture (`Chrome`), the menu
 * it holds (`NavReader`), the site's name in its titles, an address as a key,
 * and a ZIP's file names (the zip-slip check).
 */
class SiteImportChromeTest extends TestCase
{
    private function body(string $inner): \DOMElement
    {
        return PageDocument::load('<html><head><title>T</title></head><body>'.$inner.'</body></html>', 'https://site.test/')->absolutise()->body();
    }

    /** @return list<string> the tags removed */
    private function stripped(string $inner, array $repeated = []): array
    {
        return array_map(fn (\DOMElement $e) => $e->tagName, Chrome::strip($this->body($inner), $repeated));
    }

    public function test_a_nav_a_top_level_footer_and_a_header_with_a_menu_are_chrome_by_what_they_are(): void
    {
        $this->assertSame(['header', 'footer'], $this->stripped(
            '<header><a href="/">Logo</a><nav><a href="/a">A</a><a href="/b">B</a></nav></header><p>Content here.</p><footer>Contact us</footer>',
        ));
    }

    public function test_a_header_holding_the_headline_is_content_and_so_is_a_footer_inside_an_article(): void
    {
        $this->assertSame([], $this->stripped('<header class="masthead"><h1>The headline</h1><p>The line under it.</p></header>'));
        $this->assertSame([], $this->stripped('<article><h2>Post</h2><p>Text</p><footer>Posted by Ana on Tuesday</footer></article>'));
        // Its menu goes, even inside a masthead.
        $this->assertSame(['nav'], $this->stripped('<header><h1>Welcome</h1><nav><a href="/a">A</a></nav></header>'));
    }

    public function test_a_block_on_most_pages_is_chrome_and_two_pages_prove_nothing(): void
    {
        $block = '<div class="promo">Free delivery on orders over five hundred rupees</div>';
        $signature = array_key_first(Chrome::candidates($this->body($block.'<p>x</p>')));

        $this->assertSame([], Chrome::repeated([$signature => 2], 2), 'two pages: too few to call anything furniture');
        $this->assertSame([$signature], Chrome::repeated([$signature => 3], 3));
        $this->assertSame([], Chrome::repeated([$signature => 3], 10), 'three of ten is not most');
        $this->assertSame([$signature], Chrome::repeated([$signature => 6], 10));

        $this->assertSame(['div'], $this->stripped($block.'<p>Different on every page.</p>', [$signature]));
    }

    public function test_content_that_matches_a_piece_of_the_chrome_stays(): void
    {
        // "About" is in the menu on every page; the About link in a paragraph is the page's own.
        $menu = '<div id="top"><ul><li><a href="/a">Home</a></li><li><a href="/b">About</a></li><li><a href="/c">Contact</a></li></ul></div>';
        $signature = array_key_first(Chrome::candidates($this->body($menu)));
        $body = $this->body($menu.'<p>Read <a href="/b">About</a> us.</p>');

        Chrome::strip($body, [$signature]);

        $this->assertStringContainsString('About</a> us', $body->ownerDocument->saveHTML($body));
        $this->assertStringNotContainsString('Contact', $body->ownerDocument->saveHTML($body));
    }

    public function test_a_repeated_block_with_the_headline_in_it_is_never_chrome(): void
    {
        $block = '<div><h1>Same headline everywhere</h1><p>And the same words under it on every page.</p></div>';
        $signature = array_key_first(Chrome::candidates($this->body($block)));

        $this->assertSame([], $this->stripped($block, [$signature]));
    }

    public function test_the_menus_are_read_from_the_chrome(): void
    {
        $menus = Chrome::menus($this->body(
            '<nav><ul><li><a href="/">Home</a></li><li><a href="/services">Services</a><ul><li><a href="/services/a">A</a></li></ul></li><li><a href="/contact">Contact</a></li></ul></nav>'
            .'<main><p>x</p></main><footer><ul><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li></ul></footer>',
        ));

        $this->assertSame(['Home', 'Services', 'Contact'], array_column($menus['primary'], 'label'));
        $this->assertSame(['A'], array_column($menus['primary'][1]['children'], 'label'));
        $this->assertSame('https://site.test/services/a', $menus['primary'][1]['children'][0]['href']);
        $this->assertSame(['Privacy', 'Terms'], array_column($menus['footer'], 'label'));
    }

    public function test_a_site_built_of_divs_has_its_menu_found_by_what_repeats(): void
    {
        $menu = '<div id="top"><ul id="menu"><li><a href="/">Home</a></li><li><a href="/about">About us</a></li><li><a href="/contact">Contact</a></li></ul></div>';
        $body = $this->body($menu.'<div id="content"><h1>Hi</h1></div>');
        $repeated = [array_key_first(Chrome::candidates($body))];

        $this->assertSame(['Home', 'About us', 'Contact'], array_column(Chrome::menus($body, $repeated)['primary'], 'label'));
    }

    public function test_a_dropdown_toggle_with_no_address_is_a_heading_over_its_items(): void
    {
        $nav = $this->body('<nav><ul><li><a href="#">Products</a><ul><li><a href="/p/a">Alpha</a></li><li><a href="/p/b">Beta</a></li></ul></li><li><a href="/x">Other</a></li></ul></nav>')->getElementsByTagName('nav')->item(0);
        $items = NavReader::read($nav);

        $this->assertNull($items[0]['href']);
        $this->assertSame(['Alpha', 'Beta'], array_column($items[0]['children'], 'label'));
    }

    public function test_addresses_are_keys_and_slugs(): void
    {
        foreach (['/about', '/about/', '/about.html', '/About/index.html', 'https://x.test/about?utm=1#team'] as $url) {
            $this->assertSame('/about', Paths::normalise($url), $url);
        }

        $this->assertSame('/', Paths::normalise('https://x.test/index.html'));
        $this->assertSame('/services/web-design', Paths::normalise('/services/web-design.php'));
        $this->assertSame('services-web-design', Paths::slug('/services/web-design'));
        $this->assertSame('home-page', Paths::slug('/'), '"home" is a route here');
        $this->assertTrue(Paths::sameSite('https://www.x.test/a', 'http://x.test'));
        $this->assertFalse(Paths::sameSite('https://y.test/a', 'http://x.test'));
    }

    public function test_the_sites_name_is_what_most_titles_end_with(): void
    {
        $titles = ['Home | Acme Networks', 'About us | Acme Networks', 'Contact | Acme Networks', 'Weird page'];

        $this->assertSame('Acme Networks', SiteName::detect($titles));
        $this->assertSame('About us', SiteName::strip('About us | Acme Networks', 'Acme Networks'));
        $this->assertSame('About us', SiteName::strip('Acme Networks — About us', 'Acme Networks'));
        $this->assertSame('Acme Networks', SiteName::strip('Acme Networks', 'Acme Networks'), 'a title that is only the name stays');
        $this->assertNull(SiteName::detect(['One', 'Two']));
    }

    public function test_a_zip_entry_may_not_leave_the_folder(): void
    {
        foreach (['../evil.html', 'a/../../evil.html', '/etc/passwd', 'C:/Windows/x.html', 'a\\..\\b.html', "a\0b.html"] as $name) {
            $this->assertNull(ZipSource::relative($name), $name);
        }

        $this->assertSame('css/site.css', ZipSource::relative('site/css/site.css', 'site'));
        $this->assertSame('about/index.html', ZipSource::relative('about\\index.html'));
    }

    public function test_the_one_folder_a_zip_sits_in_is_not_part_of_every_address(): void
    {
        $this->assertSame('site', ZipSource::prefix(['site/', 'site/index.html', 'site/css/a.css', '../evil.html', '__MACOSX/site/._x']));
        $this->assertNull(ZipSource::prefix(['index.html', 'css/a.css']));
        $this->assertNull(ZipSource::prefix(['site/index.html', 'other/about.html']));
    }
}
