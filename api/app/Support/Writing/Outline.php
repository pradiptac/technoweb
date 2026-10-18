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
 */
final class Outline
{
    private const LOCK_TAGS = ['table', 'iframe', 'figure', 'pre', 'video', 'audio', 'object', 'embed', 'hr', 'div', 'section'];

    private const SHORTCODE = '/^\s*\[[a-z_]+(\s[^\]]*)?\]\s*$/i';

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

    public static function fromHtml(string $html, bool $placeholders = false): self
    {
        $self = new self($placeholders);
        $doc = new DOMDocument;
        $doc->loadHTML('<?xml encoding="utf-8"?><div id="root">'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NOERROR | LIBXML_NOWARNING);
        $root = $doc->getElementById('root') ?? $doc->documentElement;
        foreach ($root->childNodes as $node) {
            $self->block($node, $doc);
        }
        if ($placeholders) {
            preg_match_all('/\{\{\s*([a-z_]+)\s*\}\}/', $html, $m);
            $self->placeholders = array_values(array_unique($m[1]));
        }

        return $self;
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
            $this->add('p', $this->escapeTokens($node->textContent));

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
            $nested = [];
            $own = '';
            foreach ($li->childNodes as $child) {
                if ($child instanceof DOMElement && in_array(strtolower($child->tagName), ['ul', 'ol'], true)) {
                    $nested[] = $child;
                } else {
                    $own .= $this->inlineNode($child, $doc);
                }
            }
            $this->add($depth >= 2 ? $tag.'2' : $tag, $own);
            foreach ($nested as $n) {
                $this->list($n, $doc, strtolower($n->tagName), min(2, $depth + 1));
            }
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
            return $this->escapeTokens($node->textContent);
        }
        if (! $node instanceof DOMElement) {
            return '';
        }

        return match (strtolower($node->tagName)) {
            'strong', 'b' => '**'.$this->inline($node, $doc).'**',
            'em', 'i' => '*'.$this->inline($node, $doc).'*',
            'br' => ' ',
            'img' => $this->picture($node, $doc),
            'a' => $this->link($node, $doc),
            default => $this->inline($node, $doc),
        };
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
     * @param  list<array<string, mixed>>  $lines
     *
     * @throws WritingRefused
     */
    public static function rebuild(array $lines, self $source): string
    {
        $html = '';
        $usedLocks = [];
        $openList = '';

        foreach ($lines as $line) {
            $kind = (string) ($line['kind'] ?? 'p');
            $text = trim((string) ($line['text'] ?? ''));
            if ($text === '') {
                continue;
            }

            if ($kind === 'locked' || preg_match('/^\[K(\d+)\]$/', $text) === 1) {
                $k = preg_match('/^\[K(\d+)\]$/', $text, $km) === 1 ? (int) $km[1] : 0;
                if (! isset($source->locked[$k]) || isset($usedLocks[$k])) {
                    throw new WritingRefused('The assistant changed part of the content it was asked to keep. Try again.');
                }
                $usedLocks[$k] = true;
                self::closeList($html, $openList);
                $html .= $source->locked[$k];

                continue;
            }

            $inner = self::inlineHtml($text, $source);
            $base = rtrim($kind, '2');
            if (in_array($base, ['ul', 'ol'], true)) {
                if ($openList !== $base) {
                    self::closeList($html, $openList);
                    $html .= "<{$base}>";
                    $openList = $base;
                }
                $html .= "<li>{$inner}</li>";

                continue;
            }
            self::closeList($html, $openList);
            $html .= match ($kind) {
                'h2', 'h3', 'h4' => "<{$kind}>{$inner}</{$kind}>",
                'quote' => "<blockquote><p>{$inner}</p></blockquote>",
                default => "<p>{$inner}</p>",
            };
        }
        self::closeList($html, $openList);

        if (count($usedLocks) !== count($source->locked)) {
            throw new WritingRefused('The assistant left out part of the content it was asked to keep. Try again.');
        }
        if ($source->countPlaceholders) {
            preg_match_all('/\{\{\s*([a-z_]+)\s*\}\}/', $html, $m);
            foreach ($source->placeholders as $p) {
                if (! in_array($p, $m[1], true)) {
                    throw new WritingRefused('The assistant dropped the {{'.$p.'}} placeholder. Try again.');
                }
            }
        }

        return $html;
    }

    private static function closeList(string &$html, string &$open): void
    {
        if ($open !== '') {
            $html .= "</{$open}>";
            $open = '';
        }
    }

    private static function inlineHtml(string $text, self $source): string
    {
        $e = htmlspecialchars($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');

        // Links by number; an unknown number keeps its words and loses the link.
        $e = preg_replace_callback('/\[L(\d+)\](.*?)\[\/L\1\]/u', function ($m) use ($source) {
            $href = $source->links[(int) $m[1]] ?? null;

            return $href === null ? $m[2] : '<a href="'.htmlspecialchars($href, ENT_QUOTES | ENT_HTML5, 'UTF-8').'">'.$m[2].'</a>';
        }, $e) ?? $e;
        $e = preg_replace('/\[\/?L\d+\]/', '', $e) ?? $e;

        $e = preg_replace_callback('/\[P(\d+)\]/', fn ($m) => $source->pictures[(int) $m[1]] ?? '', $e) ?? $e;
        $e = preg_replace('/\*\*(.+?)\*\*/u', '<strong>$1</strong>', $e) ?? $e;
        $e = preg_replace('/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])/u', '<em>$1</em>', $e) ?? $e;

        return $e;
    }
}
