<?php

namespace Tests\Unit;

use App\Support\SvgSanitiser;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * One test per vector, asserted individually.
 *
 * Same shape and same reasoning as `HtmlSanitiserTest`: a single test feeding
 * a bundle of payloads through and asserting "no script anywhere" passes the
 * day one of them stops being covered, because the other nine still fail it.
 * The point of a security test is to name the thing it is protecting against.
 */
class SvgSanitiserTest extends TestCase
{
    private function wrap(string $inner, string $attrs = ''): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"'.$attrs.'>'.$inner.'</svg>';
    }

    /* --------------------------------------------------------- what goes */

    public function test_a_script_element_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap('<script>alert(1)</script><rect x="1" y="1" width="8" height="8"/>'));

        $this->assertStringNotContainsString('script', $out);
        $this->assertStringNotContainsString('alert', $out);
        $this->assertStringContainsString('<rect', $out);
    }

    public function test_an_event_handler_attribute_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap('<rect width="8" height="8" onload="alert(1)" onclick="alert(2)"/>'));

        $this->assertStringNotContainsString('onload', $out);
        $this->assertStringNotContainsString('onclick', $out);
        $this->assertStringNotContainsString('alert', $out);
        $this->assertStringContainsString('width="8"', $out);
    }

    /**
     * The attribute a denylist forgets.
     *
     * `onload` on the root element is the payload that needs no interaction at
     * all — the file executes the moment its URL is opened.
     */
    public function test_a_handler_on_the_root_element_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap('<rect width="8" height="8"/>', ' onload="alert(1)"'));

        $this->assertStringNotContainsString('onload', $out);
        $this->assertStringNotContainsString('alert', $out);
    }

    /** Arbitrary HTML inside an SVG, which is how a form or an iframe gets in. */
    public function test_foreign_object_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap(
            '<foreignObject width="10" height="10"><iframe src="https://attacker.test"></iframe></foreignObject>',
        ));

        $this->assertStringNotContainsString('foreignObject', $out);
        $this->assertStringNotContainsString('iframe', $out);
        $this->assertStringNotContainsString('attacker.test', $out);
    }

    /**
     * A link that is harmless until it is animated into one that is not.
     *
     * `<animate attributeName="href" values="javascript:…">` passes any check
     * that reads the `href` as written, because the dangerous value is not in
     * the attribute at parse time.
     */
    public function test_an_animated_href_cannot_survive(): void
    {
        $out = SvgSanitiser::clean($this->wrap(
            '<a href="#safe"><animate attributeName="href" values="javascript:alert(1)"/><rect width="8" height="8"/></a>',
        ));

        $this->assertStringNotContainsString('animate', $out);
        $this->assertStringNotContainsString('javascript:', $out);
    }

    public function test_a_javascript_url_is_removed_with_the_element_that_carried_it(): void
    {
        $out = SvgSanitiser::clean($this->wrap('<a href="javascript:alert(1)"><rect width="8" height="8"/></a>'));

        $this->assertStringNotContainsString('javascript:', $out);
    }

    /**
     * `xlink:href` is not the string `href`.
     *
     * Both reach the same handler in a browser, so a check comparing the
     * attribute name verbatim lets the namespaced spelling straight through.
     */
    public function test_a_namespaced_href_is_removed(): void
    {
        $out = SvgSanitiser::clean(
            '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10">'
            .'<use xlink:href="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"/>'
            .'</svg>',
        );

        $this->assertStringNotContainsString('xlink:href', $out);
        $this->assertStringNotContainsString('base64', $out);
        $this->assertStringNotContainsString('<use', $out);
    }

    public function test_an_inline_stylesheet_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap(
            '<style>@import url("https://attacker.test/x.css");</style><rect width="8" height="8" style="behavior:url(#x)"/>',
        ));

        $this->assertStringNotContainsString('@import', $out);
        $this->assertStringNotContainsString('attacker.test', $out);
        $this->assertStringNotContainsString('style=', $out);
    }

    /**
     * The read primitive rather than the script one, and just as bad.
     *
     * An external entity turns an image upload into "print me any file this
     * process can open".
     */
    public function test_an_external_entity_reads_nothing(): void
    {
        $out = SvgSanitiser::clean(
            '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            .'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&xxe;</text></svg>',
        );

        $this->assertNotNull($out);
        $this->assertStringNotContainsString('root:', (string) $out);
        $this->assertStringNotContainsString('/etc/passwd', (string) $out);
        $this->assertStringNotContainsString('DOCTYPE', (string) $out);
    }

    /**
     * A live NodeList renumbers as you delete from it.
     *
     * Two adjacent scripts is the minimum case that catches a `foreach` over
     * `childNodes`: the first is removed, everything shifts down, and the
     * second is never visited.
     */
    public function test_adjacent_dangerous_siblings_are_all_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap(
            '<script>a()</script><script>b()</script><script>c()</script><rect width="8" height="8"/>',
        ));

        $this->assertStringNotContainsString('script', $out);
        $this->assertStringNotContainsString('a()', $out);
        $this->assertStringNotContainsString('b()', $out);
        $this->assertStringNotContainsString('c()', $out);
        $this->assertStringContainsString('<rect', $out);
    }

    public function test_a_nested_script_deep_in_a_group_is_removed(): void
    {
        $out = SvgSanitiser::clean($this->wrap('<g><g><g><script>alert(1)</script></g></g></g>'));

        $this->assertStringNotContainsString('script', $out);
    }

    /* --------------------------------------------------------- what stays */

    /**
     * The other half, and the reason this is a sanitiser rather than a refusal.
     *
     * A sanitiser that strips a real logo down to an empty frame gets turned
     * off, so what survives matters as much as what does not.
     */
    public function test_a_real_drawing_survives_intact(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" role="img" aria-label="Technoware">'
            .'<title>Technoware</title>'
            .'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            .'<stop offset="0" stop-color="#4A5A2A"/><stop offset="1" stop-color="#6f8641"/>'
            .'</linearGradient></defs>'
            .'<rect width="120" height="40" rx="4" fill="url(#g)"/>'
            .'<path d="M10 20 L30 20" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
            .'<text x="40" y="25" font-family="sans-serif" font-size="14" fill="#fff">Technoware</text>'
            .'</svg>';

        $out = (string) SvgSanitiser::clean($svg);

        foreach ([
            '<title>Technoware</title>', 'linearGradient', 'stop-color="#4A5A2A"',
            'rx="4"', 'fill="url(#g)"', 'stroke-linecap="round"',
            'font-size="14"', 'aria-label="Technoware"', 'viewBox="0 0 120 40"',
        ] as $kept) {
            $this->assertStringContainsString($kept, $out, "Stripped something legitimate: {$kept}");
        }
    }

    public function test_filters_and_clip_paths_survive(): void
    {
        $out = (string) SvgSanitiser::clean($this->wrap(
            '<defs><filter id="b"><feGaussianBlur stdDeviation="2"/></filter>'
            .'<clipPath id="c"><circle cx="5" cy="5" r="4"/></clipPath></defs>'
            .'<rect width="8" height="8" filter="url(#b)" clip-path="url(#c)"/>',
        ));

        $this->assertStringContainsString('feGaussianBlur', $out);
        $this->assertStringContainsString('stdDeviation="2"', $out);
        $this->assertStringContainsString('clipPath', $out);
        $this->assertStringContainsString('clip-path="url(#c)"', $out);
    }

    /* ------------------------------------------------------- what is refused */

    #[DataProvider('unreadable')]
    public function test_something_that_is_not_an_svg_is_refused(string $input, string $why): void
    {
        $this->assertNull(SvgSanitiser::clean($input), $why);
    }

    /** @return array<string, array{string, string}> */
    public static function unreadable(): array
    {
        return [
            'empty' => ['', 'An empty file has no drawing in it'],
            'whitespace' => ["   \n\t ", 'Nor has a whitespace one'],
            'html' => ['<html><body><script>alert(1)</script></body></html>', 'An HTML document is not an SVG whatever it is named'],
            'malformed' => ['<svg xmlns="http://www.w3.org/2000/svg"><rect></svg>', 'Markup no parser agrees on cannot be checked'],
            'not markup' => ['GIF89a…', 'A raster file renamed .svg'],
        ];
    }
}
