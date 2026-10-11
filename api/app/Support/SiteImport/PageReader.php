<?php

namespace App\Support\SiteImport;

use App\Support\WordPress\Rendered\Dom;
use DOMElement;

/**
 * A harvested page, read for the importer: its title and metadata, and the
 * markup of its own content — the body with the site's chrome taken away and
 * every address made absolute. Held for the page just read, because a commit
 * plans a page and then writes it.
 *
 * `facts` is what the page says about itself, for `PageKind`: its structured
 * data's types, `og:type`, whether it is an `<article>` with a `<time>` and an
 * author, a SKU, a specification table — and the dates and pictures a post or
 * a product takes from it.
 */
final class PageReader
{
    /** @var array{key: string, page: array<string, mixed>}|null */
    private static ?array $last = null;

    /**
     * @param  array<string, mixed>  $record  a line of `pages.jsonl`
     * @param  list<string>  $chrome  the signatures the scan found repeated
     * @return array{title: string, h1: string, description: string, og_image: ?string, noindex: bool, html: string, text: int, url: string, facts: array<string, mixed>}
     */
    public static function read(array $record, array $chrome, ?string $siteName, ?Context $ctx = null): array
    {
        $key = md5((string) $record['url'].'|'.strlen((string) $record['html']).'|'.md5((string) $record['html']).'|'.md5(implode(',', $chrome)));

        if (self::$last !== null && self::$last['key'] === $key) {
            return self::$last['page'];
        }

        $doc = PageDocument::load((string) $record['html'], (string) $record['url'])->absolutise();
        $title = SiteName::strip($doc->title(), $siteName);
        $h1 = $doc->h1();
        $ogImage = $doc->ogImage();
        $description = $doc->meta('description');
        $noindex = $doc->noindex();
        $head = self::head($doc);

        Chrome::strip($doc->body(), $chrome);
        $content = $doc->content();

        if ($ctx !== null) {
            foreach (Dom::tags($content, 'img') as $img) {
                if (($src = Dom::src($img)) !== null) {
                    $ctx->noteAlt($src, trim($img->getAttribute('alt')));
                }
            }
        }

        $page = [
            'title' => $title,
            'h1' => $h1,
            'description' => $description,
            'og_image' => $ogImage,
            'noindex' => $noindex,
            'html' => PageDocument::inner($content),
            'text' => mb_strlen(Dom::text($content)),
            'url' => (string) $record['url'],
            'facts' => self::merged($head, self::facts($content)),
        ];

        self::$last = ['key' => $key, 'page' => $page];

        return $page;
    }

    /**
     * What the head and the structured data say, read before the chrome goes.
     *
     * @return array<string, mixed>
     */
    private static function head(PageDocument $doc): array
    {
        $types = [];
        $published = null;
        $author = null;
        $sku = null;

        foreach ($doc->doc->getElementsByTagName('script') as $script) {
            if (strtolower($script->getAttribute('type')) !== 'application/ld+json') {
                continue;
            }

            $data = json_decode(trim($script->textContent), true);

            foreach (is_array($data) ? self::nodes($data) : [] as $node) {
                foreach ((array) ($node['@type'] ?? []) as $type) {
                    if (is_string($type)) {
                        $types[] = $type;
                    }
                }

                $published ??= self::string($node['datePublished'] ?? null);
                $sku ??= self::string($node['sku'] ?? $node['mpn'] ?? null);
                $a = $node['author'] ?? null;
                $author ??= self::string(is_array($a) ? ($a['name'] ?? ($a[0]['name'] ?? null)) : $a);
            }
        }

        $metaPublished = $doc->meta('article:published_time');

        return [
            'jsonld' => array_values(array_unique($types)),
            'og_type' => $doc->meta('og:type'),
            'published_meta' => $metaPublished !== '',
            'published' => $published ?? ($metaPublished !== '' ? $metaPublished : null),
            'author' => $author ?? (($m = $doc->meta('author')) !== '' ? $m : null),
            'sku' => $sku,
        ];
    }

    /**
     * What the content says: an article with a date and a byline, a SKU in
     * its words, a specification sheet, the pictures it shows.
     *
     * @return array<string, mixed>
     */
    private static function facts(DOMElement $content): array
    {
        $article = strtolower($content->tagName) === 'article' || Dom::firstTag($content, 'article') !== null;
        $time = Dom::firstTag($content, 'time');
        $by = Dom::first($content, '/(^|[-_])(author|byline|posted-by)([-_]|$)/i');
        $rel = null;

        foreach (Dom::tags($content, 'a') as $a) {
            if (strtolower($a->getAttribute('rel')) === 'author') {
                $rel = $a;
                break;
            }
        }

        $byline = $rel ?? $by;
        $text = Dom::text($content);
        $sku = preg_match('/\b(?:SKU|Part\s*(?:No\.?|Number)|Model\s*(?:No\.?|Number)|MPN|Item\s*(?:No\.?|Code))\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9._\/-]{1,40})/i', $text, $m) ? $m[1] : null;

        $images = [];
        foreach (Dom::tags($content, 'img') as $img) {
            $src = Dom::src($img);

            if ($src !== null && ! in_array($src, $images, true) && count($images) < 8) {
                $images[] = $src;
            }
        }

        return [
            'article' => $article,
            'time' => $time !== null ? ($time->getAttribute('datetime') ?: Dom::text($time)) : null,
            'byline' => $byline !== null ? Dom::text($byline) : null,
            'content_sku' => $sku,
            'specs' => count(Specs::read($content)),
            'images' => $images,
        ];
    }

    /**
     * @param  array<string, mixed>  $head
     * @param  array<string, mixed>  $content
     * @return array<string, mixed>
     */
    private static function merged(array $head, array $content): array
    {
        $facts = $head + $content;
        $facts['author'] ??= $content['byline'];
        $facts['sku'] ??= $content['content_sku'];

        return $facts;
    }

    /** Every object in a JSON-LD document, `@graph` and nesting unfolded. */
    private static function nodes(array $data): array
    {
        $out = [];
        $stack = [$data];

        while ($stack !== [] && count($out) < 200) {
            $node = array_pop($stack);

            if (isset($node['@type'])) {
                $out[] = $node;
            }

            foreach ($node as $value) {
                if (is_array($value)) {
                    $stack[] = $value;
                }
            }
        }

        return $out;
    }

    private static function string(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? mb_substr(trim($value), 0, 255) : (is_numeric($value) ? (string) $value : null);
    }
}
