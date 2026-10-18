<?php

namespace Tests\Unit;

use App\Support\Writing\Outline;
use App\Support\Writing\WritingRefused;
use Tests\TestCase;

class WritingOutlineTest extends TestCase
{
    public function test_headings_paragraphs_lists_marks_and_links(): void
    {
        $o = Outline::fromHtml('<h2>Wi-Fi</h2><p>We <strong>survey</strong> every <em>floor</em>. See <a href="/kb/heat-maps">heat maps</a>.</p><ul><li>One</li><li>Two</li></ul>');
        $this->assertSame([
            ['n' => 1, 'kind' => 'h2', 'text' => 'Wi-Fi'],
            ['n' => 2, 'kind' => 'p', 'text' => 'We **survey** every *floor*. See [L1]heat maps[/L1].'],
            ['n' => 3, 'kind' => 'ul', 'text' => 'One'],
            ['n' => 4, 'kind' => 'ul', 'text' => 'Two'],
        ], $o->lines());
        $this->assertSame([1 => '/kb/heat-maps'], $o->links);
    }

    public function test_round_trip_rebuilds_escaped_html(): void
    {
        $o = Outline::fromHtml('<p>See <a href="/kb/x">this</a>.</p>');
        $html = Outline::rebuild([['kind' => 'p', 'text' => 'Read [L1]the guide[/L1] <script>alert(1)</script> & go.']], $o);
        $this->assertStringContainsString('<a href="/kb/x">the guide</a>', $html);
        $this->assertStringNotContainsString('<script>', $html);
        $this->assertStringContainsString('&amp; go', $html);
    }

    public function test_locked_items_survive_byte_identical(): void
    {
        $table = '<table><tbody><tr><td>A</td></tr></tbody></table>';
        $iframe = '<iframe src="https://www.youtube.com/embed/abc"></iframe>';
        $short = '<p>[slider slug="hero"]</p>';
        $o = Outline::fromHtml('<p>Intro.</p>'.$table.$iframe.$short.'<p>End.</p>');
        $this->assertCount(3, $o->locked);
        $lines = array_map(fn ($l) => ['kind' => $l['kind'], 'text' => $l['kind'] === 'locked' ? $l['text'] : strtoupper($l['text'])], $o->lines());
        $html = Outline::rebuild($lines, $o);
        $this->assertStringContainsString($table, $html);
        $this->assertStringContainsString($iframe, $html);
        $this->assertStringContainsString('[slider slug="hero"]', $html);
        $this->assertStringContainsString('<p>INTRO.</p>', $html);
    }

    public function test_a_missing_or_repeated_locked_item_refuses(): void
    {
        $o = Outline::fromHtml('<p>A</p><table><tr><td>x</td></tr></table>');
        $this->expectException(WritingRefused::class);
        Outline::rebuild([['kind' => 'p', 'text' => 'A changed']], $o);
    }

    public function test_an_invented_link_or_picture_number_is_dropped(): void
    {
        $o = Outline::fromHtml('<p>Hi <a href="/a">a</a></p>');
        $html = Outline::rebuild([['kind' => 'p', 'text' => 'Hi [L1]a[/L1] and [L9]evil[/L9] [P4]']], $o);
        $this->assertStringContainsString('<a href="/a">a</a>', $html);
        $this->assertStringContainsString('evil', $html);
        $this->assertStringNotContainsString('L9', $html);
        $this->assertStringNotContainsString('P4', $html);
    }

    public function test_pictures_come_back_by_number(): void
    {
        $o = Outline::fromHtml('<p>Look <img src="/storage/a.jpg" alt="A rack"> here</p>');
        $this->assertSame('Look [P1] here', $o->lines()[0]['text']);
        $html = Outline::rebuild([['kind' => 'p', 'text' => '[P1] Look here']], $o);
        $this->assertStringContainsString('src="/storage/a.jpg"', $html);
    }

    public function test_placeholders_are_kept_and_counted(): void
    {
        $o = Outline::fromHtml('<p>Hello {{first_name}}, your order {{order_number}}.</p>', true);
        $this->assertSame(['first_name', 'order_number'], $o->placeholders);
        $this->expectException(WritingRefused::class);
        Outline::rebuild([['kind' => 'p', 'text' => 'Hello there.']], $o);
    }

    public function test_check_markers_pass_and_lookalike_tokens_are_neutralised(): void
    {
        $o = Outline::fromHtml('<p>Source says [K1] and [L2].</p>');
        $this->assertSame('Source says [K 1] and [L 2].', $o->lines()[0]['text']);
        $html = Outline::rebuild([['kind' => 'p', 'text' => 'Ready in [CHECK: how many days].']], $o);
        $this->assertStringContainsString('[CHECK: how many days]', $html);
    }
}
