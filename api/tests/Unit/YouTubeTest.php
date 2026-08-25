<?php

namespace Tests\Unit;

use App\Support\YouTube;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The parser's output becomes an iframe src, so what it refuses matters more
 * than what it accepts.
 */
class YouTubeTest extends TestCase
{
    #[DataProvider('accepted')]
    public function test_it_extracts_the_video_id(string $input): void
    {
        $this->assertSame('dQw4w9WgXcQ', YouTube::id($input));
    }

    public static function accepted(): array
    {
        return [
            'watch link' => ['https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
            'short link' => ['https://youtu.be/dQw4w9WgXcQ'],
            'embed link' => ['https://www.youtube.com/embed/dQw4w9WgXcQ'],
            'shorts link' => ['https://www.youtube.com/shorts/dQw4w9WgXcQ'],
            'mobile with a timestamp' => ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'],
            'nocookie host' => ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'],
            'a bare id, so a round trip is idempotent' => ['dQw4w9WgXcQ'],
            'surrounding whitespace' => ['  https://youtu.be/dQw4w9WgXcQ  '],
        ];
    }

    #[DataProvider('refused')]
    public function test_it_refuses_anything_else(string $input): void
    {
        $this->assertNull(YouTube::id($input));
    }

    public static function refused(): array
    {
        return [
            // The one that matters: a host ending in the right string but
            // belonging to somebody else.
            'lookalike host' => ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'],
            'subdomain of an attacker domain' => ['https://www.youtube.com.attacker.test/embed/dQw4w9WgXcQ'],
            'another video site' => ['https://vimeo.com/123456789'],
            'a javascript url' => ['javascript:alert(1)'],
            'a data url' => ['data:text/html,<script>alert(1)</script>'],
            'youtube, but not a video' => ['https://www.youtube.com/'],
            'a channel' => ['https://www.youtube.com/@someone'],
            'an id of the wrong length' => ['https://youtu.be/tooshort'],
            'empty' => [''],
            'whitespace' => ['   '],
        ];
    }
}
