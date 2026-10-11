<?php

namespace App\Support\SiteImport;

use App\Support\Newsletter\EmailExtractor;
use DOMDocument;
use DOMElement;
use DOMXPath;

/**
 * A harvested page as a document: its metadata, its body with every address
 * made absolute, and the markup the recognisers read.
 *
 * Made absolute so that what follows — the recognisers, the media step, the
 * links step — never has to know where the page lived: `src="img/a.png"` on
 * `/about/index.html` is a full address by the time anything looks at it. A
 * lazy-loaded picture's real address (`data-src`) is moved into `src`, a
 * `srcset` is cut to its largest candidate, and a `data-bg` becomes the inline
 * `background-image` the hero recogniser reads.
 */
final class PageDocument
{
    private const URL_ATTRS = ['href', 'src', 'poster', 'data-src', 'data-lazy-src', 'data-bg', 'data-background', 'data-image'];

    private DOMXPath $xpath;

    private function __construct(public readonly DOMDocument $doc, public readonly string $url)
    {
        $this->xpath = new DOMXPath($doc);
    }

    public static function load(string $html, string $url): self
    {
        $doc = new DOMDocument('1.0', 'UTF-8');
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"?>'.$html, LIBXML_NONET | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return new self($doc, $url);
    }

    public function body(): DOMElement
    {
        $body = $this->doc->getElementsByTagName('body')->item(0);

        if (! $body instanceof DOMElement) {
            $body = $this->doc->createElement('body');
            $this->doc->appendChild($body);
        }

        return $body;
    }

    public function title(): string
    {
        $title = $this->doc->getElementsByTagName('title')->item(0);

        return trim((string) preg_replace('/\s+/', ' ', (string) $title?->textContent));
    }

    /** A `<meta name|property="…">` content, or ''. */
    public function meta(string $name): string
    {
        foreach ($this->doc->getElementsByTagName('meta') as $meta) {
            if (strcasecmp($meta->getAttribute('name'), $name) === 0 || strcasecmp($meta->getAttribute('property'), $name) === 0) {
                return trim(html_entity_decode($meta->getAttribute('content'), ENT_QUOTES));
            }
        }

        return '';
    }

    public function ogImage(): ?string
    {
        $src = $this->meta('og:image');

        return $src === '' ? null : EmailExtractor::resolve($this->url, $src);
    }

    public function noindex(): bool
    {
        return (bool) preg_match('/\bnoindex\b/i', $this->meta('robots'));
    }

    /** The first `<h1>`'s words. */
    public function h1(): string
    {
        $h1 = $this->body()->getElementsByTagName('h1')->item(0);

        return trim((string) preg_replace('/\s+/', ' ', (string) $h1?->textContent));
    }

    /** Resolve every address in the body against the page's own. */
    public function absolutise(): self
    {
        $base = $this->url;
        $declared = $this->doc->getElementsByTagName('base')->item(0);

        if ($declared instanceof DOMElement && ($resolved = EmailExtractor::resolve($base, $declared->getAttribute('href'))) !== null) {
            $base = $resolved;
        }

        foreach ($this->body()->getElementsByTagName('*') as $el) {
            $tag = strtolower($el->tagName);

            foreach (self::URL_ATTRS as $attr) {
                $value = trim($el->getAttribute($attr));

                if ($value === '' || str_starts_with($value, '#') || preg_match('/^(data|javascript|mailto|tel|sms|whatsapp):/i', $value)) {
                    continue;
                }

                $resolved = self::resolve($base, $value);

                if ($resolved !== null) {
                    $el->setAttribute($attr, $resolved);
                }
            }

            if ($tag === 'img' || $tag === 'source') {
                $this->largest($el, $base);
            }

            if (($bg = $el->getAttribute('data-bg') ?: $el->getAttribute('data-background')) !== '' && ! preg_match('/background-image/i', $el->getAttribute('style'))) {
                $el->setAttribute('style', rtrim($el->getAttribute('style'), '; ').';background-image:url('.$bg.')');
            }

            $style = $el->getAttribute('style');

            if ($style !== '' && stripos($style, 'url(') !== false) {
                $el->setAttribute('style', (string) preg_replace_callback('/url\(\s*([\'"]?)([^\'")]+)\1\s*\)/i', function (array $m) use ($base) {
                    $resolved = str_starts_with($m[2], 'data:') ? null : self::resolve($base, html_entity_decode($m[2], ENT_QUOTES));

                    return 'url('.($resolved ?? $m[2]).')';
                }, $style));
            }
        }

        return $this;
    }

    /** The markup inside an element, for the recognisers. */
    public static function inner(DOMElement $el): string
    {
        $html = '';

        foreach ($el->childNodes as $child) {
            $html .= (string) $el->ownerDocument?->saveHTML($child);
        }

        return $html;
    }

    /**
     * The page's own content: `<main>` (or `role=main`) when it holds
     * anything, otherwise the whole body.
     */
    public function content(): DOMElement
    {
        foreach ($this->xpath->query('//main | //*[@role="main"]') ?: [] as $main) {
            if ($main instanceof DOMElement && trim((string) $main->textContent) !== '') {
                return $main;
            }
        }

        return $this->body();
    }

    /** `src`, from the largest candidate in a `srcset` when the `src` is a placeholder. */
    private function largest(DOMElement $el, string $base): void
    {
        $set = $el->getAttribute('srcset') ?: $el->getAttribute('data-srcset');

        if ($set === '') {
            return;
        }

        $best = null;
        $width = -1;

        foreach (explode(',', $set) as $candidate) {
            $parts = preg_split('/\s+/', trim($candidate));
            $url = $parts[0] ?? '';
            $w = isset($parts[1]) ? (int) $parts[1] : 0;

            if ($url !== '' && ! str_starts_with($url, 'data:') && $w >= $width) {
                $best = $url;
                $width = $w;
            }
        }

        if ($best !== null && strtolower($el->tagName) === 'img' && ($resolved = self::resolve($base, $best)) !== null) {
            $el->setAttribute('src', $resolved);
        }

        $el->removeAttribute('srcset');
        $el->removeAttribute('data-srcset');
    }

    /** An absolute address, or null for one that is not a page address at all. */
    public static function resolve(string $base, string $href): ?string
    {
        $resolved = EmailExtractor::resolve($base, $href);

        if ($resolved === null) {
            return null;
        }

        // `resolve()` drops the fragment; a link to a place on a page keeps it.
        $fragment = parse_url($href, PHP_URL_FRAGMENT);

        return $fragment ? $resolved.'#'.$fragment : $resolved;
    }
}
