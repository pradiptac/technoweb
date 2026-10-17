<?php

namespace Tests\Unit;

use App\Support\Search\Passages;
use PHPUnit\Framework\TestCase;

class SearchPassagesTest extends TestCase
{
    private function words(int $n, string $word = 'word'): string
    {
        return implode(' ', array_fill(0, $n, $word)).'.';
    }

    public function test_a_short_record_is_one_passage_prefixed_with_its_title(): void
    {
        $out = Passages::split('Wi-Fi survey', [['heading' => null, 'text' => 'We walk the site.']]);

        $this->assertSame([['heading' => null, 'text' => 'Wi-Fi survey. We walk the site.']], $out);
    }

    public function test_sections_become_passages_with_their_heading_and_small_ones_merge(): void
    {
        $out = Passages::split('Guide', [
            ['heading' => 'Intro', 'text' => 'A few words.'],
            ['heading' => 'Steps', 'text' => $this->words(300)],
            ['heading' => 'Notes', 'text' => 'Short.'],
        ]);

        $this->assertCount(2, $out);
        $this->assertStringStartsWith('Guide — Steps.', $out[1]['text']);
        $this->assertSame('Steps', $out[1]['heading']);
        $this->assertStringContainsString('Notes', $out[1]['text']); // a small section joins the one before it
    }

    public function test_a_long_section_is_cut_at_sentence_ends_and_capped(): void
    {
        $sentence = $this->words(40);
        $out = Passages::split('T', [['heading' => 'Long', 'text' => str_repeat($sentence.' ', 25)]]); // 1,000 words

        $this->assertGreaterThan(2, count($out));
        foreach ($out as $p) {
            $this->assertLessThanOrEqual(Passages::MAX_CHARS, mb_strlen($p['text']));
            $this->assertStringEndsWith('.', $p['text']);
        }
    }

    public function test_empty_sections_give_nothing(): void
    {
        $this->assertSame([], Passages::split('T', [['heading' => 'Empty', 'text' => '   ']]));
    }
}
