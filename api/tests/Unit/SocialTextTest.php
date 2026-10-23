<?php

namespace Tests\Unit;

use App\Enums\SocialNetwork;
use App\Support\Social\SocialText;
use PHPUnit\Framework\TestCase;

class SocialTextTest extends TestCase
{
    public function test_a_url_counts_as_23(): void
    {
        $url = 'https://example.com/'.str_repeat('a', 80);

        $this->assertSame(10 + 23, SocialText::xLength('See this: '.$url));
        $this->assertSame(23, SocialText::xLength($url));
    }

    public function test_x_fits_counts_the_appended_link(): void
    {
        $url = 'https://example.com/'.str_repeat('a', 70); // 90 characters, counted as 23

        // 256 + a space + 23 = 280, the limit.
        $this->assertTrue(SocialText::xFits(str_repeat('a', 256), $url));
        $this->assertFalse(SocialText::xFits(str_repeat('a', 257), $url));
    }

    public function test_x_fallback_is_trimmed_to_fit_at_a_word(): void
    {
        $url = 'https://example.com/post';
        $summary = trim(str_repeat('alpha beta gamma ', 40));

        $text = SocialText::fallback(SocialNetwork::X, 'A title', $summary, $url);

        $this->assertTrue(SocialText::xFits($text, $url));
        $this->assertStringEndsWith('…', $text);
        $this->assertStringStartsWith('A title — alpha beta', $text);
        $this->assertDoesNotMatchRegularExpression('/\bgam…$/u', $text);
        $this->assertStringNotContainsString($url, $text);
        $this->assertSame('Short — and sweet', SocialText::fallback(SocialNetwork::X, 'Short', 'and sweet', $url));
    }

    public function test_linkedin_fallback_carries_title_summary_and_link(): void
    {
        $text = SocialText::fallback(SocialNetwork::LinkedIn, 'Title', 'A summary.', 'https://example.com/p');

        $this->assertSame("Title\n\nA summary.\n\nhttps://example.com/p", $text);
    }
}
