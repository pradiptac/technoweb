<?php

namespace App\Support\Writing;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMText;

/**
 * A rich-text body as numbered lines the model can reword without touching
 * markup (0.183.0, docs/ai-writing.md). Links and pictures become [Ln]/[Pn]
 * tokens whose real HTML stays here; tables, embeds, code and shortcode
 * paragraphs become locked [Kn] lines returned byte-identical. The answer is
 * rebuilt from escaped words, so nothing the model writes is ever HTML.
 * Alignment, underline, strike, sub/superscript, colours and h5/h6 are not
 * carried through a rewrite.
 */
final class Outline
{
    private const LOCK_TAGS = ['table', 'iframe', 'figure', 'pre', 'video', 'audio', 'object', 'embed', 'hr', 'div', 'section'];

    private const SHORTCODE = '/^\s*\[[a-z_]+(\s[^\]]*)?\]\s*$/i';

    // A capturing group, so preg_split hands the shortcode back at the odd indexes.
    private const INLINE_SHORTCODE = '/(\[(?:icon|slider|form|gallery|block)\b[^\]]*\])/i';

    private const OPEN = "\u{E000}";

    private const CLOSE = "\u{E001}";

    private const KINDS = ['h2', 'h3', 'h4', 'p', 'quote', 'ul', 'ol', 'ul2', 'ol2'];

    /** @var list<array{n:int, kind:string, text:string}> */
    private array $lines = [];

    /** @var array<int, string> */
    public array $links = [];

    /** @var array<int, string> */
    public array $pictures = [];

    /** @var array<int, string> */
    public array $locked = [];

    /** @var list<string> */
    public array $placeholders = [];

    private function __construct(private bool $countPlaceholders) {}

    /** @param bool $placeholders require every {{name}} of the input to come back (an email template) */
    public static function fromHtml(string $html, bool $placeholders = false): self
    {
        $self = new self($placeholders);
        $doc = new DOMDocument;
        $doc->loadHTML('<?xml encoding="utf-8"?><div id="root">'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING);
        // A stray close tag ends the wrapper early, so whatever follows is a sibling: read it too.
        foreach ($doc->childNodes as $top) {
            if ($top instanceof DOMElement && $top->getAttribute('id') === 'root') {
                foreach ($top->childNodes as $node) {
                    $self->block($node, $doc);
                }
            } else {
                $self->block($top, $doc);
            }
        }
        $self->placeholders = self::placeholdersIn($html);

        return $self;
    }

    /** @return list<string> the {{names}} in a piece of text, once each */
    public static function placeholdersIn(string $text): array
    {
        preg_match_all('/\{\{\s*([a-z_]+)\s*\}\}/', $text, $m);

        return array_values(array_unique($m[1]));
    }

    /** @return list<array{n:int, kind:string, text:string}> */
    public function lines(): array
    {
        return $this->lines;
    }

    public function toPrompt(): string
    {
        return implode("\n", array_map(fn ($l) => "{$l['n']}. [{$l['kind']}] {$l['text']}", $this->lines));
    }

    private function add(string $kind, string $text): void
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? '');
        if ($text !== '') {
            $this->lines[] = ['n' => count($this->lines) + 1, 'kind' => $kind, 'text' => $text];
        }
    }

    private function lock(DOMNode $node, DOMDocument $doc): void
    {
        $k = count($this->locked) + 1;
        $this->locked[$k] = (string) $doc->saveHTML($node);
        $this->lines[] = ['n' => count($this->lines) + 1, 'kind' => 'locked', 'text' => "[K{$k}]"];
    }

    private function block(DOMNode $node, DOMDocument $doc, int $depth = 1): void
    {
        if ($node instanceof DOMText) {
            $this->add('p', $this->words($node->textContent));

            return;
        }
        if (! $node instanceof DOMElement) {
            return;
        }
        $tag = strtolower($node->tagName);

        if (in_array($tag, self::LOCK_TAGS, true) || ($tag === 'p' && preg_match(self::SHORTCODE, $node->textContent) === 1)) {
            $this->lock($node, $doc);

            return;
        }

        match (true) {
            in_array($tag, ['h1', 'h2'], true) => $this->add('h2', $this->inline($node, $doc)),
            in_array($tag, ['h3', 'h4'], true) => $this->add($tag, $this->inline($node, $doc)),
            $tag === 'blockquote' => $this->add('quote', $this->inline($node, $doc)),
            in_array($tag, ['ul', 'ol'], true) => $this->list($node, $doc, $tag, $depth),
            default => $this->add('p', $this->inline($node, $doc)),
        };
    }

    private function list(DOMElement $list, DOMDocument $doc, string $tag, int $depth): void
    {
        foreach ($list->childNodes as $li) {
            if (! $li instanceof DOMElement || strtolower($li->tagName) !== 'li') {
                continue;
            }
            $kind = $depth >= 2 ? $tag.'2' : $tag;
            $own = '';
            foreach ($li->childNodes as $child) {
                if ($child instanceof DOMElement && in_array(strtolower($child->tagName), ['ul', 'ol'], true)) {
                    $this->add($kind, $own);
                    $own = '';
                    $this->list($child, $doc, strtolower($child->tagName), min(2, $depth + 1));
                } else {
                    $own .= $this->inlineNode($child, $doc);
                }
            }
            $this->add($kind, $own); // words after a nested list come next, as an item of their own
        }
    }

    private function inline(DOMElement $el, DOMDocument $doc): string
    {
        $out = '';
        foreach ($el->childNodes as $child) {
            $out .= $this->inlineNode($child, $doc);
        }

        return $out;
    }

    private function inlineNode(DOMNode $node, DOMDocument $doc): string
    {
        if ($node instanceof DOMText) {
            return $this->words($node->textContent);
        }
        if (! $node instanceof DOMElement) {
            return '';
        }
        $tag = strtolower($node->tagName);

        return match (true) {
            in_array($tag, ['strong', 'b'], true) => '**'.$this->inline($node, $doc).'**',
            in_array($tag, ['em', 'i'], true) => '*'.$this->inline($node, $doc).'*',
            $tag === 'br' => ' ',
            // An embed inside a paragraph (Summernote's Video button) has no words, so it travels like a picture.
            $tag === 'img', in_array($tag, self::LOCK_TAGS, true) => $this->picture($node, $doc),
            $tag === 'a' => $this->link($node, $doc),
            default => $this->inline($node, $doc),
        };
    }

    /** Text with its shortcodes held back as [Pn] tokens, so the model never sees one as words. */
    private function words(string $text): string
    {
        $out = '';
        foreach (preg_split(self::INLINE_SHORTCODE, $text, -1, PREG_SPLIT_DELIM_CAPTURE) ?: [] as $i => $piece) {
            if ($i % 2 === 1) {
                $n = count($this->pictures) + 1;
                $this->pictures[$n] = htmlspecialchars($piece, ENT_NOQUOTES | ENT_HTML5, 'UTF-8');
                $out .= "[P{$n}]";
            } else {
                $out .= $this->escapeTokens($piece);
            }
        }

        return $out;
    }

    private function link(DOMElement $a, DOMDocument $doc): string
    {
        $n = count($this->links) + 1;
        $this->links[$n] = $a->getAttribute('href');

        return "[L{$n}]".$this->inline($a, $doc)."[/L{$n}]";
    }

    private function picture(DOMElement $img, DOMDocument $doc): string
    {
        $n = count($this->pictures) + 1;
        $this->pictures[$n] = (string) $doc->saveHTML($img);

        return "[P{$n}]";
    }

    /** Text that already looks like one of our tokens is neutralised, so it cannot be mistaken for one. */
    private function escapeTokens(string $text): string
    {
        return preg_replace('/\[(\/?)([LPKS])(\d+)\]/', '[$1$2 $3]', $text) ?? $text;
    }

    /**
     * @param  list<mixed>  $lines
     *
     * @throws WritingRefused
     */
    public static function rebuild(array $lines, self $source): string
    {
        $html = '';
        $usedLocks = [];
        $used = ['L' => [], 'P' => []];
        $open = ['list' => '', 'sub' => '', 'li' => false];

        foreach ($lines as $line) {
            if (! is_array($line)) {
                throw new WritingRefused('The assistant answered in a form we could not use. Try again.');
            }
            $kind = $line['kind'] ?? 'p';
            $text = $line['text'] ?? '';
            if (! is_string($kind) || ! is_string($text)) {
                throw new WritingRefused('The assistant answered in a form we could not use. Try again.');
            }
            $text = trim($text);
            if ($text === '') {
                continue;
            }

            $isLock = preg_match('/^\[K(\d+)\]$/', $text, $km) === 1;
            if ($kind === 'locked' || $isLock) {
                $k = $isLock ? (int) $km[1] : 0;
                if (! isset($source->locked[$k]) || isset($usedLocks[$k])) {
                    throw new WritingRefused('The assistant changed part of the content it was asked to keep. Try again.');
                }
                $usedLocks[$k] = true;
                self::closeLists($html, $open);
                $html .= $source->locked[$k];

                continue;
            }
            // A real lock token inside a sentence would print as text; an invented one is stripped below.
            if (preg_match_all('/\[K(\d+)\]/', $text, $all) > 0) {
                foreach ($all[1] as $n) {
                    if (isset($source->locked[(int) $n])) {
                        throw new WritingRefused('The assistant changed part of the content it was asked to keep. Try again.');
                    }
                }
            }

            $inner = self::inlineHtml($text, $source, $used);
            $kind = in_array($kind, self::KINDS, true) ? $kind : 'p';
            $base = rtrim($kind, '2');

            if (in_array($base, ['ul', 'ol'], true)) {
                if ($kind !== $base && $open['li']) { // a nested item goes inside the previous item
                    if ($open['sub'] !== $base) {
                        self::closeSub($html, $open);
                        $html .= "<{$base}>";
                        $open['sub'] = $base;
                    }
                    $html .= "<li>{$inner}</li>";

                    continue;
                }
                self::closeSub($html, $open);
                if ($open['li']) {
                    $html .= '</li>';
                    $open['li'] = false;
                }
                if ($open['list'] !== $base) {
                    $html .= ($open['list'] !== '' ? "</{$open['list']}>" : '')."<{$base}>";
                    $open['list'] = $base;
                }
                $html .= "<li>{$inner}";
                $open['li'] = true;

                continue;
            }
            self::closeLists($html, $open);
            $html .= match ($kind) {
                'h2', 'h3', 'h4' => "<{$kind}>{$inner}</{$kind}>",
                'quote' => "<blockquote><p>{$inner}</p></blockquote>",
                default => "<p>{$inner}</p>",
            };
        }
        self::closeLists($html, $open);

        if (count($usedLocks) !== count($source->locked)) {
            throw new WritingRefused('The assistant left out part of the content it was asked to keep. Try again.');
        }
        if (count($used['L']) < count($source->links) || count($used['P']) < count($source->pictures)) {
            throw new WritingRefused('The assistant left out a link or a picture. Try again.');
        }
        if ($source->countPlaceholders) {
            $found = self::placeholdersIn($html);
            foreach ($source->placeholders as $p) {
                if (! in_array($p, $found, true)) {
                    throw new WritingRefused('The assistant dropped the {{'.$p.'}} placeholder. Try again.');
                }
            }
        }

        return $html;
    }

    /** @param array{list: string, sub: string, li: bool} $open */
    private static function closeSub(string &$html, array &$open): void
    {
        if ($open['sub'] !== '') {
            $html .= "</{$open['sub']}>";
            $open['sub'] = '';
        }
    }

    /** @param array{list: string, sub: string, li: bool} $open */
    private static function closeLists(string &$html, array &$open): void
    {
        self::closeSub($html, $open);
        if ($open['li']) {
            $html .= '</li>';
            $open['li'] = false;
        }
        if ($open['list'] !== '') {
            $html .= "</{$open['list']}>";
            $open['list'] = '';
        }
    }

    /**
     * Words in, HTML out. Links and pictures travel as opaque sentinels while the
     * marks run, and the source's own HTML goes in last, so nothing the model wrote
     * can reach it and no mark can reach into it.
     *
     * @param  array{L: array<int, true>, P: array<int, true>}  $used
     */
    private static function inlineHtml(string $text, self $source, array &$used): string
    {
        $text = str_replace([self::OPEN, self::CLOSE], '', $text);
        $e = htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // An unknown number keeps its words and loses the link.
        $e = preg_replace_callback('/\[L(\d+)\](.*?)\[\/L\1\]/u', function ($m) use ($source, &$used) {
            $n = (int) $m[1];
            if (! isset($source->links[$n])) {
                return $m[2];
            }
            $used['L'][$n] = true;

            return self::OPEN.'L'.$n.self::CLOSE.$m[2].self::OPEN.'/L'.$n.self::CLOSE;
        }, $e) ?? $e;
        $e = preg_replace_callback('/\[P(\d+)\]/', function ($m) use ($source, &$used) {
            $n = (int) $m[1];
            if (! isset($source->pictures[$n])) {
                return '';
            }
            $used['P'][$n] = true;

            return self::OPEN.'P'.$n.self::CLOSE;
        }, $e) ?? $e;
        // Whatever token is left was never ours to hand out.
        $e = preg_replace('/\[\/?L\d+\]|\[[SK]\d+\]/', '', $e) ?? $e;
        $e = preg_replace_callback('/\{\{\s*([a-z_]+)\s*\}\}/', fn ($m) => in_array($m[1], $source->placeholders, true) ? $m[0] : '', $e) ?? $e;

        $e = preg_replace('/\*\*((?:(?!\*\*)[^\n]){1,1000}?)\*\*/u', '<strong>$1</strong>', $e) ?? $e;
        $e = preg_replace('/(?<![\w*])\*(?!\s)([^*\n]{1,1000}?)(?<!\s)\*(?![\w*])/u', '<em>$1</em>', $e) ?? $e;

        return preg_replace_callback('/\x{E000}(\/?)([LP])(\d+)\x{E001}/u', function ($m) use ($source) {
            $n = (int) $m[3];
            if ($m[2] === 'P') {
                return $source->pictures[$n] ?? '';
            }

            return $m[1] === '/' ? '</a>' : '<a href="'.htmlspecialchars($source->links[$n] ?? '', ENT_QUOTES | ENT_HTML5, 'UTF-8').'">';
        }, $e) ?? $e;
    }
}
