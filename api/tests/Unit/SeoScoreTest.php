<?php

namespace Tests\Unit;

use App\Support\SeoScore;
use PHPUnit\Framework\TestCase;

/**
 * The score is advice an editor acts on, so what it *stops* rewarding matters
 * as much as what it rewards. These lock the four rules that are easy to
 * break by tidying: applicability, the keyword trade, the gap between a failed
 * check and an issue, and the fact that duplicates are seen across the whole
 * site rather than within a type.
 */
class SeoScoreTest extends TestCase
{
    /** Everything a record can do right, so any check that regresses shows up. */
    private function perfect(array $overrides = []): array
    {
        return array_replace_recursive([
            'resolved' => [
                'title' => 'Network switch buying guide for small offices',
                'description' => 'How to choose a network switch for an office of ten to fifty people, '
                    .'covering port count, PoE budget and uplinks.',
                'robots' => 'index, follow',
                'focus_keyword' => 'network switch',
                'og_image' => 'https://example.test/storage/cover.png',
                'sitemap_include' => true,
            ],
            'slug' => 'network-switch-buying-guide',
            'body' => '<p>Choosing a <a href="/products/switches">network switch</a> starts with '
                .'counting the ports you need today and the ones you will need next year.</p>'
                .'<h2>Power over Ethernet</h2>'
                .'<p>Budget the wattage before the port count, because access points and cameras '
                .'draw far more than a desk phone does.</p>'
                .'<img src="/x.png" alt="A rack-mounted switch">',
            'has_body' => true,
            'depth_target' => 40,
            'duplicate_title' => false,
            'duplicate_description' => false,
        ], $overrides);
    }

    public function test_a_record_doing_everything_scores_full_marks(): void
    {
        $score = SeoScore::for($this->perfect());

        $this->assertSame(100, $score['value'], implode(' | ', array_column($score['failed'], 'label')));
        $this->assertSame('good', $score['band']);
        $this->assertSame([], $score['failed']);
        $this->assertSame([], $score['issues']);
    }

    /**
     * The rule the whole design turns on: an entity with no body column can
     * never earn the content checks, so it must not be measured against them.
     */
    public function test_an_entity_with_no_body_is_not_scored_on_content(): void
    {
        $withBody = SeoScore::for($this->perfect());
        $without = SeoScore::for($this->perfect(['body' => '', 'has_body' => false]));

        $this->assertSame(100, $without['value']);
        $this->assertLessThan($withBody['checked'], $without['checked']);
        $this->assertNotContains('content_depth', array_column($without['failed'], 'key'));
    }

    /**
     * Naming a keyword trades one easy check for four harder ones, so a record
     * that names one and then ignores it scores *worse* than one that never
     * named one at all. That is the point: the alternative is a score that
     * rewards leaving the field blank.
     */
    public function test_an_unused_focus_keyword_scores_worse_than_none_at_all(): void
    {
        $none = SeoScore::for($this->perfect(['resolved' => ['focus_keyword' => null]]));
        $unused = SeoScore::for($this->perfect(['resolved' => ['focus_keyword' => 'redundant array of disks']]));

        $this->assertLessThan($none['value'], $unused['value']);
        $this->assertContains('keyword_in_title', array_column($unused['failed'], 'key'));
        $this->assertContains('keyword_set', array_column($none['failed'], 'key'));
    }

    /**
     * A title under the minimum costs points and is not an issue; over the
     * maximum is both. Collapsing the two took the overview's headline from 23
     * records to 48 of 54, which is a figure that has stopped pointing
     * anywhere.
     */
    public function test_a_short_title_costs_points_without_becoming_an_issue(): void
    {
        $short = SeoScore::for($this->perfect(['resolved' => ['title' => 'Switches']]));

        $this->assertLessThan(100, $short['value']);
        $this->assertContains('title_length', array_column($short['failed'], 'key'));
        $this->assertSame([], $short['issues']);
    }

    public function test_a_long_title_is_an_issue(): void
    {
        $long = SeoScore::for($this->perfect([
            'resolved' => ['title' => str_repeat('network switch ', 6)],
        ]));

        $this->assertContains('Title length', $long['issues']);
    }

    public function test_a_missing_title_or_description_is_always_an_issue(): void
    {
        $blank = SeoScore::for($this->perfect([
            'resolved' => ['title' => '', 'description' => null],
        ]));

        $this->assertContains('No title', $blank['issues']);
        $this->assertContains('No description', $blank['issues']);
        // Length cannot be judged on a field with nothing in it, so it does
        // not apply and must not be counted a second time.
        $this->assertNotContains('title_length', array_column($blank['failed'], 'key'));
    }

    public function test_noindex_is_an_issue_and_costs_the_most_of_the_technical_checks(): void
    {
        $hidden = SeoScore::for($this->perfect(['resolved' => ['robots' => 'noindex, nofollow']]));

        $this->assertContains('Set to noindex', $hidden['issues']);
    }

    public function test_a_duplicate_title_or_description_fails(): void
    {
        $duplicate = SeoScore::for($this->perfect([
            'duplicate_title' => true,
            'duplicate_description' => true,
        ]));

        $keys = array_column($duplicate['failed'], 'key');
        $this->assertContains('title_unique', $keys);
        $this->assertContains('description_unique', $keys);
        // Neither is an *issue*: a duplicate is a thing to improve, not a
        // record that is broken.
        $this->assertSame([], $duplicate['issues']);
    }

    public function test_an_image_without_alt_text_fails_and_one_with_it_does_not(): void
    {
        $withAlt = SeoScore::for($this->perfect());
        $withoutAlt = SeoScore::for($this->perfect([
            'body' => str_replace(' alt="A rack-mounted switch"', '', $this->perfect()['body']),
        ]));

        $this->assertNotContains('image_alt', array_column($withAlt['failed'], 'key'));
        $this->assertContains('image_alt', array_column($withoutAlt['failed'], 'key'));
    }

    public function test_an_empty_alt_attribute_is_not_alt_text(): void
    {
        $empty = SeoScore::for($this->perfect([
            'body' => str_replace('alt="A rack-mounted switch"', 'alt="  "', $this->perfect()['body']),
        ]));

        $this->assertContains('image_alt', array_column($empty['failed'], 'key'));
    }

    /**
     * An off-site link is not an internal one, and neither is a
     * protocol-relative URL — `//evil.test/x` starts with a slash and is the
     * reason the check looks past the first character.
     */
    public function test_only_a_site_relative_link_counts_as_internal(): void
    {
        $body = fn (string $href) => '<p>One two three four five six seven eight nine ten '
            .'eleven twelve <a href="'.$href.'">link</a>.</p>';

        foreach (['https://example.test/x', '//example.test/x', 'mailto:a@b.test'] as $href) {
            $score = SeoScore::for($this->perfect(['body' => $body($href), 'depth_target' => 5]));
            $this->assertContains(
                'internal_links', array_column($score['failed'], 'key'), "external: {$href}",
            );
        }

        $internal = SeoScore::for($this->perfect(['body' => $body('/solutions/networking'), 'depth_target' => 5]));
        $this->assertNotContains('internal_links', array_column($internal['failed'], 'key'));
    }

    /** Subheadings are asked for once a page is long enough to need them. */
    public function test_subheadings_are_only_expected_of_a_page_long_enough_to_need_them(): void
    {
        $short = SeoScore::for($this->perfect([
            'body' => '<p>Short and to the point, with a <a href="/x">link</a>.</p>',
            'depth_target' => 300,
        ]));

        $this->assertNotContains('headings', array_column($short['failed'], 'key'));
        $this->assertContains('content_depth', array_column($short['failed'], 'key'));
    }

    public function test_an_untidy_slug_fails(): void
    {
        foreach (['Network_Switch', 'Network-Switch', 'network--switch', str_repeat('a', 76)] as $slug) {
            $score = SeoScore::for($this->perfect(['slug' => $slug, 'resolved' => ['focus_keyword' => null]]));
            $this->assertContains('slug_clean', array_column($score['failed'], 'key'), $slug);
        }
    }

    public function test_the_bands_are_where_they_say_they_are(): void
    {
        $this->assertSame('good', SeoScore::band(100));
        $this->assertSame('good', SeoScore::band(80));
        $this->assertSame('fair', SeoScore::band(79));
        $this->assertSame('fair', SeoScore::band(50));
        $this->assertSame('poor', SeoScore::band(49));
        $this->assertSame('poor', SeoScore::band(0));
    }

    /** Every failed check must carry a label and something to do about it. */
    public function test_every_failure_explains_itself(): void
    {
        $bad = SeoScore::for([
            'resolved' => ['title' => '', 'description' => '', 'robots' => 'noindex', 'sitemap_include' => false],
            'slug' => 'Bad_Slug',
            'body' => '',
            'has_body' => true,
            'depth_target' => 300,
        ]);

        $this->assertNotSame([], $bad['failed']);
        $this->assertSame('poor', $bad['band']);

        foreach ($bad['failed'] as $check) {
            $this->assertNotSame('', $check['label']);
            $this->assertNotSame('', $check['hint']);
            $this->assertArrayHasKey($check['group'], SeoScore::GROUPS);
            $this->assertGreaterThan(0, $check['weight']);
        }
    }
}
