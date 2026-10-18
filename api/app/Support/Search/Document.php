<?php

namespace App\Support\Search;

use App\Support\HtmlSanitiser;
use App\Support\PageSections\RecordSections;
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
    /** The keys a builder section keeps prose under; a whitelist, so nothing else is ever sent. */
    private const TEXT_KEYS = ['heading', 'kicker', 'lede', 'title', 'subtitle', 'body', 'html', 'text', 'caption', 'question', 'answer', 'quote', 'note', 'summary', 'description', 'label', 'name', 'role'];

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

        // The page draws its sections or its written body, never both.
        if (self::usesSections($model)) {
            foreach (self::blockTexts((array) $model->getAttribute('blocks')) as $text) {
                $out[] = ['heading' => null, 'text' => $text];
            }
        } else {
            foreach (Indexable::bodyColumns($alias) as $column) {
                array_push($out, ...self::richSections((string) ($model->getAttribute($column) ?? '')));
            }
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

    private static function usesSections(Model $model): bool
    {
        if ($model->getMorphClass() === 'page') {
            $blocks = $model->getAttribute('blocks');

            return $model->getAttribute('template') === 'builder' && is_array($blocks) && $blocks !== [];
        }

        return RecordSections::inUse($model);
    }

    /**
     * @param  array<mixed>  $blocks
     * @return list<string> the words of each visible builder section
     */
    private static function blockTexts(array $blocks): array
    {
        $texts = [];
        foreach ($blocks as $block) {
            if (! is_array($block) || ! empty($block['hidden']) || ($block['type'] ?? '') === 'custom_code' || ! is_array($block['data'] ?? null)) {
                continue;
            }
            $words = [];
            self::collect($block['data'], false, $words);
            $text = trim(implode(' ', array_filter($words)));
            if ($text !== '') {
                $texts[] = $text;
            }
        }

        return $texts;
    }

    /**
     * Walks a section's data for prose only: a string counts when its key is a
     * known text key, or it is a bare entry of a list called `items` (a
     * checklist). Dates, ids, enum values and addresses are never in the list.
     *
     * @param  array<mixed>  $data
     * @param  list<string>  $words
     */
    private static function collect(array $data, bool $inItems, array &$words): void
    {
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                self::collect($value, $key === 'items', $words);
            } elseif (is_string($value) && (in_array($key, self::TEXT_KEYS, true) || ($inItems && is_int($key)))) {
                $words[] = HtmlSanitiser::toText($value);
            }
        }
    }
}
