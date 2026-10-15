<?php

namespace Tests\Unit;

use App\Support\SiteImport\Chrome;
use App\Support\SiteImport\PageDocument;
use App\Support\WordPress\Rendered\Piece;
use App\Support\WordPress\Rendered\RenderedSections;
use Tests\TestCase;

/**
 * The generic recognisers (0.163.0, the site import): blocks found by their
 * structure, on four sites that share no class names — a Bootstrap landing
 * page, a Tailwind one, a Webflow export and a plain hand-written page — and
 * the promise that they take nothing the WordPress recognisers claim.
 * Fixtures are in `tests/fixtures/site-import/`.
 */
class SiteImportRecognisersTest extends TestCase
{
    /** @return list<Piece> the content of a fixture page after its chrome is taken off */
    private function pieces(string $fixture): array
    {
        $html = (string) file_get_contents(base_path('tests/fixtures/site-import/'.$fixture));
        $doc = PageDocument::load($html, 'https://fixture.test/'.basename($fixture))->absolutise();
        Chrome::strip($doc->body(), []);

        return $this->walker()->pieces(PageDocument::inner($doc->content()));
    }

    private function walker(?array $recognisers = null): RenderedSections
    {
        return new RenderedSections(
            fn (string $html) => trim($html) === '' ? null : $html,
            fn (string $src) => 'media/'.basename((string) parse_url($src, PHP_URL_PATH)),
            null,
            $recognisers ?? RenderedSections::siteRecognisers(),
        );
    }

    /** @param  list<Piece>  $pieces */
    private function kinds(array $pieces): array
    {
        return array_map(fn (Piece $p) => $p->kind, array_values(array_filter($pieces, fn (Piece $p) => $p->kind !== 'text' || trim(strip_tags($p->html)) !== '' || $p->heading !== null)));
    }

    private function piece(array $pieces, string $kind): Piece
    {
        foreach ($pieces as $piece) {
            if ($piece->kind === $kind) {
                return $piece;
            }
        }

        $this->fail("No {$kind} piece in: ".implode(', ', array_map(fn (Piece $p) => $p->kind, $pieces)));
    }

    public function test_a_bootstrap_landing_page_is_read_by_its_structure(): void
    {
        $pieces = $this->pieces('bootstrap/index.html');

        $this->assertSame(['hero', 'features', 'media_text', 'figures', 'testimonial', 'faq', 'cta'], $this->kinds($pieces));

        $hero = $this->piece($pieces, 'hero');
        $this->assertSame('Managed IT that just works', $hero->data['heading']);
        $this->assertSame('https://fixture.test/img/hero.jpg', $hero->data['image'], 'a background image on the block');
        $this->assertSame('Get a quote', $hero->data['primary']['label']);
        $this->assertSame('Our services', $hero->data['secondary']['label']);

        $cards = $this->piece($pieces, 'features');
        $this->assertSame('What we do', $cards->heading);
        $this->assertCount(3, $cards->items);
        $this->assertSame('Enterprise Wi-Fi', $cards->items[0]['title']);
        $this->assertSame('https://fixture.test/services.html#wifi', $cards->items[0]['href']);

        $mediaText = $this->piece($pieces, 'media_text');
        $this->assertSame('left', $mediaText->data['side']);
        $this->assertSame('https://fixture.test/img/office.jpg', $mediaText->data['image']);
        $this->assertSame('Meet the team', $mediaText->data['primary']['label']);
        $this->assertStringNotContainsString('Meet the team', $mediaText->data['body'], 'the button is the section\'s, not its body');

        $this->assertSame([['value' => '340+', 'label' => 'Sites supported'], ['value' => '4h', 'label' => 'Response time'], ['value' => '99.9%', 'label' => 'Uptime']], $this->piece($pieces, 'figures')->items);

        $quote = $this->piece($pieces, 'testimonial')->items[0];
        $this->assertSame('Meera Nair', $quote['name']);
        $this->assertSame('Operations Head, Kalpana Foods', $quote['role']);

        $this->assertSame('Do you work outside Kolkata?', $this->piece($pieces, 'faq')->items[0]['question']);
        $this->assertSame('Talk to us', $this->piece($pieces, 'cta')->data['primary']['label']);
    }

    public function test_a_tailwind_page_with_no_class_names_to_go_on(): void
    {
        $pieces = $this->pieces('tailwind/index.html');

        $this->assertSame(['hero', 'features', 'gallery', 'faq', 'cta'], $this->kinds($pieces));

        $hero = $this->piece($pieces, 'hero');
        $this->assertSame('https://fixture.test/images/hero-bg.jpg', $hero->data['image']);
        $this->assertSame('Why us', $hero->data['secondary']['label'], 'a plain link beside the button is the second button');

        // Cards are text only: a features item has an icon and no photograph.
        $this->assertSame(['Fast by default', 'Backed up nightly', 'Humans on call'], array_column($this->piece($pieces, 'features')->items, 'title'));

        $strip = $this->piece($pieces, 'gallery');
        $this->assertCount(5, $strip->items);
        $this->assertSame('Alpha', $strip->items[0]['alt']);

        // Three headings that ask something, each with its answer.
        $this->assertCount(3, $this->piece($pieces, 'faq')->items);
    }

    public function test_a_webflow_export_gives_a_picture_with_words_a_map_and_a_form(): void
    {
        $pieces = $this->pieces('webflow/index.html');
        $kinds = $this->kinds($pieces);

        $this->assertSame(['hero', 'media_text', 'map', 'form'], array_slice($kinds, 0, 4));

        $mediaText = $this->piece($pieces, 'media_text');
        $this->assertSame('right', $mediaText->data['side'], 'the picture is in the second column');
        $this->assertSame('Identity, web and packaging for founders.', $this->piece($pieces, 'hero')->data['lede'], 'a lede that is not a <p>');
        $this->assertStringStartsWith('https://www.google.com/maps/embed', $this->piece($pieces, 'map')->data['url']);
        $this->assertSame(['name', 'email', 'msg'], array_column($this->piece($pieces, 'form')->data['fields'], 'name'));
    }

    public function test_plain_paragraphs_are_not_mistaken_for_anything(): void
    {
        $pieces = $this->pieces('plain/index.html');

        $this->assertSame(['text'], array_unique($this->kinds($pieces)));
        // The words are all there, headings kept for the section split.
        $this->assertSame(['Welcome to Sunrise Accounting', 'What we do'], array_values(array_filter(array_map(fn (Piece $p) => $p->heading, $pieces))));
    }

    public function test_a_hero_that_would_lose_words_is_not_a_hero(): void
    {
        // An <h1> and two paragraphs: the second would have nowhere to go.
        $pieces = $this->walker()->pieces('<div><h1>Hello</h1><p>The first line says one thing about us.</p><p>The second line says another thing, and it must not vanish.</p></div>');

        $this->assertSame('text', $pieces[0]->kind);
        $this->assertStringContainsString('must not vanish', $pieces[0]->html);

        // A link that is not a button is words too.
        $pieces = $this->walker()->pieces('<div><h1>Hello</h1><p>Short line.</p><a href="https://x.test/a">Read the story</a></div>');
        $this->assertSame('text', $pieces[0]->kind);
    }

    public function test_cards_need_three_alike_and_a_heading_each(): void
    {
        $two = '<div><div><h3>One</h3><p>First card text.</p></div><div><h3>Two</h3><p>Second card text.</p></div></div>';
        $this->assertNotContains('features', $this->kinds($this->walker()->pieces($two)));

        $noHeadings = '<div><div><p>One one one.</p></div><div><p>Two two two.</p></div><div><p>Three three.</p></div></div>';
        $this->assertNotContains('features', $this->kinds($this->walker()->pieces($noHeadings)));

        $long = '<ul>'.str_repeat('<li><h3>Title</h3><p>'.str_repeat('words ', 80).'</p></li>', 3).'</ul>';
        $this->assertNotContains('features', $this->kinds($this->walker()->pieces($long)), 'an article is not a card');
    }

    public function test_a_row_of_logos_needs_four_pictures_and_next_to_no_words(): void
    {
        $img = fn (int $n) => '<img src="https://x.test/l'.$n.'.png" alt="L'.$n.'">';
        $this->assertSame(['gallery'], $this->kinds($this->walker()->pieces('<div>'.$img(1).$img(2).$img(3).$img(4).'</div>')));
        $this->assertNotContains('gallery', $this->kinds($this->walker()->pieces('<div>'.$img(1).$img(2).$img(3).'</div>')));
        $this->assertNotContains('gallery', $this->kinds($this->walker()->pieces('<div>'.$img(1).$img(2).$img(3).$img(4).'<p>'.str_repeat('Words about our clients. ', 5).'</p></div>')));
    }

    public function test_statistics_are_short_numbers_with_short_labels(): void
    {
        $stats = $this->walker()->pieces('<div><div><b>24/7</b><span>Support</span></div><div><b>₹2cr</b><span>Saved</span></div></div>');
        $this->assertSame('figures', $stats[0]->kind);
        $this->assertSame('24/7', $stats[0]->items[0]['value']);

        // A sentence about a number is not a figure.
        $prose = $this->walker()->pieces('<div><div><b>Three</b><span>things we do</span></div><div><b>Four</b><span>things we do</span></div></div>');
        $this->assertNotContains('figures', $this->kinds($prose));
    }

    public function test_a_definition_list_is_a_questions_section(): void
    {
        $pieces = $this->walker()->pieces('<dl><dt>Where are you?</dt><dd>Kolkata.</dd><dt>When are you open?</dt><dd>Ten to five.</dd></dl>');

        $this->assertSame('faq', $pieces[0]->kind);
        $this->assertSame('Ten to five.', $pieces[0]->items[1]['answer']);
    }

    public function test_a_map_must_be_googles_embed_and_a_video_an_mp4(): void
    {
        $this->assertSame('map', $this->walker()->pieces('<iframe src="https://www.google.com/maps/embed?pb=1"></iframe>')[0]->kind);
        $this->assertNotContains('map', $this->kinds($this->walker()->pieces('<iframe src="https://maps.example/embed"></iframe>')));

        $video = $this->walker()->pieces('<video controls><source src="https://x.test/clip.mp4" type="video/mp4"></video>');
        $this->assertSame('video', $video[0]->kind);
        $this->assertSame('https://x.test/clip.mp4', $video[0]->data['mp4']);
    }

    public function test_the_generic_recognisers_take_nothing_the_wordpress_ones_claim(): void
    {
        $snippets = [
            '<div class="elementor-widget elementor-widget-counter" data-widget_type="counter.default"><div class="elementor-counter"><div class="elementor-counter-number-wrapper"><span class="elementor-counter-number" data-to-value="340">0</span></div><div class="elementor-counter-title">Sites</div></div></div>'
                .'<div class="elementor-widget elementor-widget-counter" data-widget_type="counter.default"><div class="elementor-counter"><div class="elementor-counter-number-wrapper"><span class="elementor-counter-number" data-to-value="12">0</span></div><div class="elementor-counter-title">Cities</div></div></div>',
            '<details><summary>Is it free?</summary><p>Yes, entirely.</p></details><details><summary>Is it fast?</summary><p>Very much so.</p></details>',
            '<div class="et_pb_blurb"><h4 class="et_pb_module_header">Speed</h4><div class="et_pb_blurb_description">Fast.</div></div><div class="et_pb_blurb"><h4 class="et_pb_module_header">Care</h4><div class="et_pb_blurb_description">Careful.</div></div>',
            '<blockquote class="testimonial"><p>A great team to work with, always.</p><cite>Jo Bloggs</cite></blockquote>',
        ];

        foreach ($snippets as $i => $html) {
            $wordpress = $this->walker(RenderedSections::recognisers())->pieces($html);
            $site = $this->walker()->pieces($html);

            $this->assertSame(
                array_map(fn (Piece $p) => [$p->kind, $p->items, $p->data], $wordpress),
                array_map(fn (Piece $p) => [$p->kind, $p->items, $p->data], $site),
                "snippet {$i} reads the same with the generic recognisers added",
            );
            $this->assertNotSame('text', $site[0]->kind, "snippet {$i} was recognised at all");
        }
    }
}
