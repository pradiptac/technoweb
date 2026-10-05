<?php

namespace Tests\Unit;

use App\Support\WordPress\GutenbergSections;
use Tests\TestCase;

/**
 * A WordPress page's blocks as builder sections (0.109.0): the parser's
 * nesting, each mapping, and the fallbacks that keep every word.
 */
class GutenbergSectionsTest extends TestCase
{
    private function convert(string $raw, ?GutenbergSections &$converter = null): array
    {
        $converter = new GutenbergSections(
            fn (string $html) => trim($html) === '' ? null : $html,
            fn (int|string $source) => is_int($source) ? "media/{$source}.jpg" : 'media/'.basename((string) parse_url($source, PHP_URL_PATH)),
        );

        return $converter->toSections(GutenbergSections::parse($raw));
    }

    public function test_the_parser_keeps_nesting_and_the_markup_around_children(): void
    {
        $blocks = GutenbergSections::parse(
            '<!-- wp:group --><div class="wp-block-group"><!-- wp:paragraph --><p>Inside</p><!-- /wp:paragraph --></div><!-- /wp:group -->'
            .'<!-- wp:separator /--><!-- wp:heading {"level":3} --><h3>H</h3><!-- /wp:heading -->'
        );

        $this->assertSame(['core/group', 'core/separator', 'core/heading'], array_column($blocks, 'name'));
        $this->assertSame('core/paragraph', $blocks[0]['children'][0]['name']);
        $this->assertSame('<div class="wp-block-group"><p>Inside</p></div>', GutenbergSections::markup($blocks[0]));
        $this->assertSame(3, $blocks[2]['attrs']['level']);
        $this->assertTrue(GutenbergSections::isBlocks('<!-- wp:paragraph --><p>x</p><!-- /wp:paragraph -->'));
        $this->assertFalse(GutenbergSections::isBlocks('<p>classic</p>'));
    }

    public function test_a_cover_opening_the_page_is_the_hero_with_its_buttons(): void
    {
        $sections = $this->convert(
            '<!-- wp:cover {"url":"https://old.test/wp-content/uploads/hero.jpg","id":12} --><div class="wp-block-cover"><img src="https://old.test/wp-content/uploads/hero.jpg"/><div class="wp-block-cover__inner-container">'
            .'<!-- wp:heading {"level":1} --><h1>We keep networks running</h1><!-- /wp:heading -->'
            .'<!-- wp:paragraph --><p>Since 2010.</p><!-- /wp:paragraph -->'
            .'<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link" href="/contact">Talk to us</a></div><!-- /wp:button --></div><!-- /wp:buttons -->'
            .'</div></div><!-- /wp:cover -->'
        );

        $this->assertSame('hero', $sections[0]['type']);
        $this->assertSame('We keep networks running', $sections[0]['data']['heading']);
        $this->assertSame('Since 2010.', $sections[0]['data']['lede']);
        $this->assertSame('cover', $sections[0]['data']['layout']);
        $this->assertSame('media/12.jpg', $sections[0]['data']['image_path']);
        $this->assertSame(['label' => 'Talk to us', 'href' => '/contact'], $sections[0]['data']['primary']);
    }

    public function test_media_text_columns_quote_video_and_details_map_to_their_sections(): void
    {
        $column = fn (string $t, string $b) => '<!-- wp:column --><div class="wp-block-column"><!-- wp:heading {"level":3} --><h3>'.$t.'</h3><!-- /wp:heading --><!-- wp:paragraph --><p>'.$b.'</p><!-- /wp:paragraph --></div><!-- /wp:column -->';

        $sections = $this->convert(
            '<!-- wp:paragraph --><p>Opening words.</p><!-- /wp:paragraph -->'
            .'<!-- wp:media-text {"mediaId":7,"mediaType":"image","mediaPosition":"right"} --><div class="wp-block-media-text"><figure><img src="x.jpg"/></figure><div class="wp-block-media-text__content">'
            .'<!-- wp:heading --><h2>Our engineers</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Certified.</p><!-- /wp:paragraph --></div></div><!-- /wp:media-text -->'
            .'<!-- wp:columns --><div class="wp-block-columns">'.$column('Fast', 'Four hours.').$column('Tidy', 'Labelled racks.').'</div><!-- /wp:columns -->'
            .'<!-- wp:quote --><blockquote class="wp-block-quote"><p>They fixed it.</p><cite>Asha Menon</cite></blockquote><!-- /wp:quote -->'
            .'<!-- wp:embed {"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","providerNameSlug":"youtube"} --><figure class="wp-block-embed"></figure><!-- /wp:embed -->'
            .'<!-- wp:separator --><hr class="wp-block-separator"/><!-- /wp:separator -->'
            .'<!-- wp:details --><details><summary>Do you cover Pune?</summary><p>Yes.</p></details><!-- /wp:details -->'
            .'<!-- wp:details --><details><summary>Weekends?</summary><p>For contracts.</p></details><!-- /wp:details -->'
        );

        $this->assertSame(['rich_text', 'media_text', 'features', 'testimonial', 'video', 'divider', 'faq'], array_column($sections, 'type'));
        $this->assertSame('Our engineers', $sections[1]['data']['heading']);
        $this->assertSame('media/7.jpg', $sections[1]['data']['image_path']);
        $this->assertSame('right', $sections[1]['data']['side']);
        $this->assertStringContainsString('Certified.', $sections[1]['data']['body']);
        $this->assertStringNotContainsString('Our engineers', $sections[1]['data']['body']);
        $this->assertSame([['title' => 'Fast', 'body' => 'Four hours.'], ['title' => 'Tidy', 'body' => 'Labelled racks.']], $sections[2]['data']['items']);
        $this->assertSame(['quote' => 'They fixed it.', 'name' => 'Asha Menon'], $sections[3]['data']);
        $this->assertSame('https://www.youtube.com/watch?v=dQw4w9WgXcQ', $sections[4]['data']['youtube']);
        $this->assertCount(2, $sections[6]['data']['items']);
        $this->assertSame('Do you cover Pune?', $sections[6]['data']['items'][0]['question']);
    }

    public function test_text_is_cut_at_level_two_headings_and_misfits_fall_back_to_text(): void
    {
        $sections = $this->convert(
            '<!-- wp:heading --><h2>About</h2><!-- /wp:heading --><!-- wp:paragraph --><p>Story.</p><!-- /wp:paragraph -->'
            .'<!-- wp:heading {"level":3} --><h3>Small</h3><!-- /wp:heading --><!-- wp:list --><ul><li>a</li></ul><!-- /wp:list -->'
            .'<!-- wp:quote --><blockquote class="wp-block-quote"><p>Nobody named.</p></blockquote><!-- /wp:quote -->'
            .'<!-- wp:heading --><h2>Next</h2><!-- /wp:heading --><!-- wp:paragraph --><p>More.</p><!-- /wp:paragraph -->'
        );

        $this->assertSame(['rich_text', 'rich_text'], array_column($sections, 'type'));
        $this->assertSame('About', $sections[0]['data']['heading']);
        $this->assertStringContainsString('<h3>Small</h3>', $sections[0]['data']['body']);
        $this->assertStringContainsString('Nobody named.', $sections[0]['data']['body']);
        $this->assertSame('Next', $sections[1]['data']['heading']);
    }

    public function test_empty_dynamic_blocks_are_named_and_dividers_never_open_or_close(): void
    {
        $sections = $this->convert(
            '<!-- wp:separator --><hr/><!-- /wp:separator --><!-- wp:latest-posts /-->'
            .'<!-- wp:paragraph --><p>Words.</p><!-- /wp:paragraph --><!-- wp:separator --><hr/><!-- /wp:separator -->',
            $converter,
        );

        $this->assertSame(['rich_text'], array_column($sections, 'type'));
        $this->assertSame(['core/latest-posts'], $converter->skipped);
    }
}
