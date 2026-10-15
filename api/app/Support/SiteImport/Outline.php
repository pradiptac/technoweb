<?php

namespace App\Support\SiteImport;

use App\Support\LinkPattern;
use App\Support\WordPress\Rendered\Dom;
use DOMElement;
use DOMText;

/**
 * A block of a page as the words and shape a model may be shown: text, with
 * its headings, list items, links and pictures marked, **never markup**.
 *
 * It is what goes inside the fence of an AI request (`AiSections`,
 * `PageKind`): scripts, styles, attributes and class names do not leave the
 * server, and a hostile page cannot put an instruction into anything but
 * words it also shows. Links and pictures are numbered — `[L1]`, `[P1: alt]` —
 * because the model refers to them by number and never writes an address:
 * `links()` and `pictures()` are the lists those numbers index.
 *
 * `hash()` identifies the block for the ledger, from the words and the
 * addresses, so the dry run and the commit see the same key.
 */
final class Outline
{
    private const BLOCKS = ['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'table', 'dl', 'dt', 'dd', 'blockquote', 'figure', 'figcaption', 'br', 'hr'];

    private const MAX_LINKS = 30;

    private const MAX_PICTURES = 20;

    /** @var list<array{title: string, path: string}> */
    private array $links = [];

    /** @var list<array{src: string, alt: string}> */
    private array $pictures = [];

    private string $text = '';

    private function __construct() {}

    public static function of(string $html, ?string $heading = null): self
    {
        $outline = new self;

        if ($heading !== null && $heading !== '') {
            $outline->text .= '# '.$heading."\n";
        }

        $outline->walk(Dom::load($html));
        $outline->text = trim((string) preg_replace("/[ \t]+\n|\n{3,}/", "\n\n", (string) preg_replace('/[ \t]+/', ' ', $outline->text)));

        return $outline;
    }

    public function text(int $max = 6000): string
    {
        return mb_strlen($this->text) <= $max ? $this->text : rtrim(mb_substr($this->text, 0, $max)).' …';
    }

    /** @return list<array{title: string, path: string}> the links `[L n]` mark, in `PageDraft`'s shape */
    public function links(): array
    {
        return $this->links;
    }

    /** @return list<array{src: string, alt: string}> */
    public function pictures(): array
    {
        return $this->pictures;
    }

    public function hash(): string
    {
        return sha1($this->text.'|'.implode('|', array_column($this->links, 'path')).'|'.implode('|', array_column($this->pictures, 'src')));
    }

    /** The words in a block — lower-case, three letters or more — for the coverage check. */
    public static function words(string $text): array
    {
        preg_match_all('/[\p{L}\p{N}][\p{L}\p{N}\'’-]{2,}/u', mb_strtolower($text), $m);

        return array_values(array_unique($m[0]));
    }

    /**
     * How much shape a block has, as a number: sub-headings, list items,
     * pictures and links. Prose is 0; a grid of cards is high.
     *
     * @return array{words: int, structure: int}
     */
    public static function measure(string $html): array
    {
        $root = Dom::load($html);
        $count = fn (string ...$tags) => count(Dom::tags($root, ...$tags));
        $links = count(array_filter(Dom::tags($root, 'a'), fn (DOMElement $a) => trim($a->getAttribute('href')) !== ''));

        return [
            'words' => count(preg_split('/\s+/u', Dom::text($root), -1, PREG_SPLIT_NO_EMPTY) ?: []),
            'structure' => min($count('h3', 'h4', 'h5', 'h6'), 3)
                + ($count('li') >= 3 ? 2 : 0)
                + min($count('img'), 3)
                + min($links, 3)
                + ($count('table', 'dl') > 0 ? 2 : 0),
        ];
    }

    private function walk(DOMElement $node): void
    {
        foreach ($node->childNodes as $child) {
            if ($child instanceof DOMText) {
                $this->text .= $child->data;

                continue;
            }

            if (! $child instanceof DOMElement || Dom::hidden($child)) {
                continue;
            }

            $tag = strtolower($child->tagName);

            if ($tag === 'img') {
                $src = Dom::src($child);

                if ($src !== null && count($this->pictures) < self::MAX_PICTURES) {
                    $this->pictures[] = ['src' => $src, 'alt' => trim($child->getAttribute('alt'))];
                    $alt = trim($child->getAttribute('alt'));
                    $this->text .= ' [P'.count($this->pictures).($alt !== '' ? ': '.mb_substr($alt, 0, 120) : '').'] ';
                }

                continue;
            }

            $block = in_array($tag, self::BLOCKS, true);
            $this->text .= $block ? "\n" : '';

            if (preg_match('/^h([1-6])$/', $tag, $m)) {
                $this->text .= str_repeat('#', min(4, (int) $m[1])).' ';
            } elseif ($tag === 'li') {
                $this->text .= '- ';
            }

            $this->walk($child);

            if ($tag === 'a') {
                $href = html_entity_decode(trim($child->getAttribute('href')), ENT_QUOTES);

                if ($href !== '' && ! str_starts_with($href, '#') && LinkPattern::allows($href) && count($this->links) < self::MAX_LINKS) {
                    $this->links[] = ['title' => mb_substr(Dom::text($child) ?: $href, 0, 80), 'path' => $href];
                    $this->text .= ' [L'.count($this->links).'] ';
                }
            }

            $this->text .= $block ? "\n" : ($tag === 'td' || $tag === 'th' ? ' | ' : '');
        }
    }
}
