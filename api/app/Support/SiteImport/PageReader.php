<?php

namespace App\Support\SiteImport;

use App\Support\WordPress\Rendered\Dom;

/**
 * A harvested page, read for the importer: its title and metadata, and the
 * markup of its own content — the body with the site's chrome taken away and
 * every address made absolute. Held for the page just read, because a commit
 * plans a page and then writes it.
 */
final class PageReader
{
    /** @var array{key: string, page: array<string, mixed>}|null */
    private static ?array $last = null;

    /**
     * @param  array<string, mixed>  $record  a line of `pages.jsonl`
     * @param  list<string>  $chrome  the signatures the scan found repeated
     * @return array{title: string, h1: string, description: string, og_image: ?string, noindex: bool, html: string, text: int, url: string}
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
        ];

        self::$last = ['key' => $key, 'page' => $page];

        return $page;
    }
}
