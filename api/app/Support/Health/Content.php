<?php

namespace App\Support\Health;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Database\Eloquent\Model;

/**
 * One record's words, links and pictures, read the way the page draws them
 * (docs/health.md). Rich text is parsed with DOMDocument over the stored —
 * already sanitised — HTML; sections are walked generically, so a section
 * type added later is covered by its key names (`href`, `*_path`, `body`,
 * `html`) without this file changing. Hidden sections are skipped: they are
 * not on the page. A custom-code section's `html` is the developer's, not an
 * editor's, and is not read.
 */
final class Content
{
    private const COVER_COLUMNS = ['cover_image_path', 'hero_image_path', 'image_path'];

    private const PICTURE_KEYS = ['image_path', 'photo_path', 'before_path', 'after_path', 'poster_path'];

    private const RICH_KEYS = ['body', 'html'];

    /** @var list<array{field: string, html: string}> */
    public array $rich = [];

    /** @var list<array{field: string, href: string, text: string}> */
    public array $links = [];

    /** @var list<array{field: string, path: string}> */
    public array $pictures = [];

    /** @var list<array{field: string, alt: ?string}> */
    public array $bodyImages = [];

    /** @var list<array{field: string, titled: bool}> */
    public array $videos = [];

    /** @var list<string> */
    public array $anchors = [];

    /** @var list<array{field: string, levels: list<int>}> */
    public array $headings = [];

    /** @var list<string> */
    public array $tablesWithoutHeader = [];

    /** @var list<string> */
    public array $emptyLinks = [];

    public static function of(Model $model): self
    {
        $c = new self;

        foreach (Kinds::bodyColumns($model->getMorphClass()) as $column) {
            $c->readRich($column, $model->getAttribute($column));
        }

        foreach (self::COVER_COLUMNS as $column) {
            if (is_string($path = $model->getAttribute($column)) && $path !== '') {
                $c->pictures[] = ['field' => $column, 'path' => $path];
            }
        }

        foreach ((array) ($model->getAttribute('images') ?? []) as $i => $path) {
            if (is_string($path) && $path !== '') {
                $c->pictures[] = ['field' => "images.{$i}", 'path' => $path];
            }
        }

        $blocks = $model->getAttribute('blocks');
        $usesSections = $model->getMorphClass() === 'page'
            ? $model->getAttribute('template') === 'builder'
            : $model->getAttribute('body_layout') === 'sections';

        if ($usesSections && is_array($blocks)) {
            foreach ($blocks as $i => $block) {
                if (! is_array($block) || ! empty($block['hidden'])) {
                    continue;
                }
                if (is_string($block['style']['anchor'] ?? null)) {
                    $c->anchors[] = $block['style']['anchor'];
                }
                $c->walk((array) ($block['data'] ?? []), "blocks.{$i}.data", (string) ($block['type'] ?? ''));
            }
        }

        sort($c->anchors);

        return $c;
    }

    /** @param  array<mixed>  $node */
    private function walk(array $node, string $at, string $type): void
    {
        if ($type === 'video' || ($node['type'] ?? null) === 'video') {
            $this->videos[] = ['field' => $at, 'titled' => filled($node['heading'] ?? null) || filled($node['caption'] ?? null)];
        }

        foreach ($node as $key => $value) {
            $path = "{$at}.{$key}";

            if (is_array($value)) {
                $this->walk($value, $path, '');
            } elseif (! is_string($value) || $value === '') {
                continue;
            } elseif ($key === 'href') {
                $this->links[] = ['field' => $path, 'href' => $value, 'text' => (string) ($node['label'] ?? $node['link_label'] ?? '')];
            } elseif (in_array($key, self::PICTURE_KEYS, true)) {
                $this->pictures[] = ['field' => $path, 'path' => $value];
            } elseif (in_array($key, self::RICH_KEYS, true) && $type !== 'custom_code') {
                $this->readRich($path, $value);
            }
        }
    }

    private function readRich(string $field, mixed $html): void
    {
        if (! is_string($html) || trim($html) === '') {
            return;
        }

        $this->rich[] = ['field' => $field, 'html' => $html];

        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="utf-8"?><div>'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $xpath = new DOMXPath($doc);

        foreach ($xpath->query('//a[@href]') ?: [] as $a) {
            /** @var DOMElement $a */
            $text = trim(preg_replace('/\s+/u', ' ', $a->textContent) ?? '');
            $hasImageAlt = ($xpath->query('.//img[normalize-space(@alt) != ""]', $a)->length ?? 0) > 0;
            if ($text === '' && ! $hasImageAlt && trim($a->getAttribute('aria-label')) === '') {
                $this->emptyLinks[] = $field;
            }
            $this->links[] = ['field' => $field, 'href' => $a->getAttribute('href'), 'text' => $text];
        }

        foreach ($xpath->query('//img') ?: [] as $img) {
            /** @var DOMElement $img */
            // alt="" is deliberately decorative. HTMLPurifier fills a missing alt with the file's name, which says nothing either.
            $alt = $img->hasAttribute('alt') ? trim($img->getAttribute('alt')) : null;
            $file = basename((string) parse_url($img->getAttribute('src'), PHP_URL_PATH));
            if ($alt !== null && $alt !== '' && ($alt === $file || $alt === pathinfo($file, PATHINFO_FILENAME))) {
                $alt = null;
            }
            $this->bodyImages[] = ['field' => $field, 'alt' => $alt];
        }

        foreach ($xpath->query('//*[@id]') ?: [] as $el) {
            /** @var DOMElement $el */
            $this->anchors[] = $el->getAttribute('id');
        }

        $levels = [];
        foreach ($xpath->query('//h2|//h3|//h4|//h5|//h6') ?: [] as $h) {
            $levels[] = (int) substr($h->nodeName, 1);
        }
        if ($levels !== []) {
            $this->headings[] = ['field' => $field, 'levels' => $levels];
        }

        foreach ($xpath->query('//table') ?: [] as $table) {
            if (($xpath->query('.//th', $table)->length ?? 0) === 0) {
                $this->tablesWithoutHeader[] = $field;
            }
        }

        $this->emptyLinks = array_values(array_unique($this->emptyLinks));
        $this->tablesWithoutHeader = array_values(array_unique($this->tablesWithoutHeader));
    }
}
