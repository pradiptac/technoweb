<?php

namespace Tests\Unit;

use App\Support\PageSections\BodySections;
use App\Support\PageSections\SectionRules;
use Tests\TestCase;

/**
 * A page body split into builder sections (0.109.0): at its `<h2>`s, or its
 * `<h3>`s when it has no `<h2>` and at least two `<h3>`s, with nothing lost.
 */
class BodySectionsTest extends TestCase
{
    public function test_a_body_is_split_at_its_h2s_with_the_preamble_first(): void
    {
        $sections = BodySections::fromHtml(
            '<p>Intro words.</p><h2>Cabling</h2><p>We cable offices.</p><ul><li>Cat6A</li></ul><h2>Wi-Fi</h2><p>Surveys.</p>'
        );

        $this->assertCount(3, $sections);
        $this->assertSame(['rich_text', 'rich_text', 'rich_text'], array_column($sections, 'type'));
        $data = array_map(fn ($s) => (array) $s['data'], $sections);
        $this->assertArrayNotHasKey('heading', $data[0]);
        $this->assertStringContainsString('Intro words.', $data[0]['body']);
        $this->assertSame('Cabling', $data[1]['heading']);
        $this->assertStringContainsString('<li>Cat6A</li>', $data[1]['body']);
        $this->assertStringNotContainsString('<h2>', $data[1]['body']);
        $this->assertSame('Wi-Fi', $data[2]['heading']);
        foreach ($sections as $section) {
            $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $section['id']);
        }
    }

    public function test_h3s_split_a_body_with_no_h2_and_a_lone_h3_does_not(): void
    {
        $this->assertCount(2, BodySections::fromHtml('<h3>One</h3><p>a</p><h3>Two</h3><p>b</p>'));
        $this->assertCount(1, BodySections::fromHtml('<p>a</p><h3>Only</h3><p>b</p>'));
    }

    public function test_a_heading_over_nothing_keeps_its_words_in_a_body(): void
    {
        $sections = BodySections::fromHtml('<h2>Empty</h2><h2>Full</h2><p>words</p>');

        $this->assertCount(2, $sections);
        $first = (array) $sections[0]['data'];
        $this->assertArrayNotHasKey('heading', $first);
        $this->assertSame('<h2>Empty</h2>', $first['body']);
    }

    public function test_an_empty_body_is_no_sections(): void
    {
        $this->assertSame([], BodySections::fromHtml(''));
        $this->assertSame([], BodySections::fromHtml("  \n "));
        $this->assertSame([], BodySections::fromHtml(null));
    }

    public function test_more_headings_than_a_page_holds_join_the_last_section(): void
    {
        $html = '';
        for ($i = 1; $i <= SectionRules::MAX_SECTIONS + 5; $i++) {
            $html .= "<h2>Part {$i}</h2><p>Words {$i}.</p>";
        }

        $sections = BodySections::fromHtml($html);

        $this->assertCount(SectionRules::MAX_SECTIONS, $sections);
        $last = (array) end($sections)['data'];
        $this->assertStringContainsString('Words '.(SectionRules::MAX_SECTIONS + 5).'.', $last['body']);
        $this->assertStringContainsString('<h2>Part '.(SectionRules::MAX_SECTIONS + 1).'</h2>', $last['body']);
    }

    public function test_a_huge_section_is_cut_between_elements(): void
    {
        $paragraph = '<p>'.str_repeat('word ', 10000).'</p>';
        $sections = BodySections::fromHtml('<h2>Long</h2>'.str_repeat($paragraph, 6));

        $this->assertGreaterThan(1, count($sections));
        foreach ($sections as $section) {
            $this->assertLessThanOrEqual(200000, strlen(((array) $section['data'])['body']));
        }
        $this->assertSame('Long', ((array) $sections[0]['data'])['heading']);
    }
}
