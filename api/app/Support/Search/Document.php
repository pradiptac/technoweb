<?php

namespace App\Support\Search;

use App\Support\HtmlSanitiser;
use Illuminate\Database\Eloquent\Model;

/**
 * One record's indexable text, as sections (docs/semantic-search.md): the
 * summary, the written body split at its h2/h3, the visible builder sections,
 * published answer blocks, the FAQs, and for a product its brand, category and
 * spec sheet. Never a price, stock, a date or a reference — they change too
 * often to be meaning, and are the shop's live data.
 */
final class Document
{
    private const SKIP_KEYS = ['type', 'id', 'href', 'url', 'style', 'reveal', 'background', 'icon', 'layout', 'source', 'ratio', 'align', 'size', 'variant', 'mode', 'height'];

    /** @return list<array{heading: ?string, text: string}> */
    public static function sections(Model $model): array
    {
        $alias = $model->getMorphClass();
        $out = [];

        if (($summary = Indexable::summaryColumn($alias)) !== null && filled($model->getAttribute($summary))) {
            $out[] = ['heading' => null, 'text' => HtmlSanitiser::toText((string) $model->getAttribute($summary))];
        }

        if (in_array($alias, ['product', 'store_product'], true)) {
            $model->loadMissing(['brand', 'category']); // preventLazyLoading is on outside production
            $facts = array_filter([$model->getRelation('brand')?->name, $model->getRelation('category')?->name]);
            foreach ((array) ($model->getAttribute('specifications') ?? []) as $label => $value) {
                if (is_scalar($value)) {
                    $facts[] = is_string($label) ? "{$label}: {$value}" : (string) $value;
                }
            }
            if ($facts !== []) {
                $out[] = ['heading' => null, 'text' => implode('. ', $facts)];
            }
        }

        foreach (Indexable::bodyColumns($alias) as $column) {
            array_push($out, ...self::richSections((string) ($model->getAttribute($column) ?? '')));
        }

        foreach (self::blockTexts($model) as $text) {
            $out[] = ['heading' => null, 'text' => $text];
        }

        if (method_exists($model, 'answerBlocks')) {
            foreach ($model->answerBlocks()->published()->get() as $block) {
                $out[] = ['heading' => null, 'text' => trim(($block->question ? $block->question.' ' : '').$block->answer.' '.HtmlSanitiser::toText($block->detail))];
            }
        }

        if (method_exists($model, 'faqs')) {
            $faqs = $model->faqs()->get()->map(fn ($f) => trim($f->question.' '.HtmlSanitiser::toText($f->answer)))->filter()->all();
            if ($faqs !== []) {
                $out[] = ['heading' => 'Questions', 'text' => implode(' ', $faqs)];
            }
        }

        return array_values(array_filter($out, fn ($s) => trim($s['text']) !== ''));
    }

    /** @return list<array{heading: ?string, text: string}> the body split before each h2/h3 */
    private static function richSections(string $html): array
    {
        if (trim($html) === '') {
            return [];
        }

        $parts = preg_split('/(<h[23][^>]*>.*?<\/h[23]>)/is', $html, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY) ?: [$html];
        $sections = [];
        $heading = null;
        foreach ($parts as $part) {
            if (preg_match('/^<h[23]/i', $part)) {
                $heading = mb_substr(HtmlSanitiser::toText($part), 0, 160);

                continue;
            }
            $sections[] = ['heading' => $heading, 'text' => HtmlSanitiser::toText($part)];
        }

        return $sections;
    }

    /** @return list<string> the words of each visible builder section */
    private static function blockTexts(Model $model): array
    {
        $blocks = $model->getAttribute('blocks');
        $uses = $model->getMorphClass() === 'page'
            ? $model->getAttribute('template') === 'builder'
            : $model->getAttribute('body_layout') === 'sections';

        if (! $uses || ! is_array($blocks)) {
            return [];
        }

        $texts = [];
        foreach ($blocks as $block) {
            if (! is_array($block) || ! empty($block['hidden']) || ($block['type'] ?? '') === 'custom_code' || ! is_array($block['data'] ?? null)) {
                continue;
            }
            $words = [];
            array_walk_recursive($block['data'], function ($value, $key) use (&$words) {
                if (is_string($value) && ! in_array($key, self::SKIP_KEYS, true) && ! str_ends_with((string) $key, '_path') && ! str_ends_with((string) $key, '_id')) {
                    $words[] = HtmlSanitiser::toText($value);
                }
            });
            $text = trim(implode(' ', array_filter($words)));
            if ($text !== '') {
                $texts[] = $text;
            }
        }

        return $texts;
    }
}
