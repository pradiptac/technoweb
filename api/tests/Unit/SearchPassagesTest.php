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

    public function test_words_are_counted_in_any_script(): void
    {
        $sentence = implode(' ', array_fill(0, 40, 'नेटवर्क')).'।'; // 40 Devanagari words, ended with a danda
        $out = Passages::split('T', [['heading' => null, 'text' => implode(' ', array_fill(0, 15, $sentence))]]); // 600 words

        $this->assertGreaterThan(1, count($out));
        foreach ($out as $p) {
            $this->assertStringEndsWith('।', $p['text']);
        }
    }

    public function test_a_sentence_longer_than_a_passage_is_cut_at_a_space(): void
    {
        $out = Passages::split('T', [['heading' => null, 'text' => implode(' ', array_fill(0, 900, 'longword'))]]); // no full stop at all

        $this->assertGreaterThan(1, count($out));
        foreach ($out as $p) {
            $this->assertLessThanOrEqual(Passages::MAX_CHARS, mb_strlen($p['text']));
            $this->assertStringEndsWith('longword', $p['text']);
        }
    }

    public function test_a_long_title_cannot_push_a_passage_past_the_cap(): void
    {
        $title = str_repeat('Title ', 100); // 600 characters of prefix
        $out = Passages::split($title, [['heading' => null, 'text' => $this->words(190, 'abcdefgh')]]); // 1,800 characters of text

        $this->assertCount(1, $out);
        $this->assertLessThanOrEqual(Passages::MAX_CHARS, mb_strlen($out[0]['text']));
        $this->assertStringEndsWith('abcdefgh', $out[0]['text']); // cut back to a word, not mid-word
    }

    public function test_empty_sections_give_nothing(): void
    {
        $this->assertSame([], Passages::split('T', [['heading' => 'Empty', 'text' => '   ']]));
    }
}
