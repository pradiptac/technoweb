<?php

namespace App\Support\Search;

/**
 * A record's sections into passages of about 250 words (docs/semantic-search.md).
 * Small neighbouring sections join (a two-line intro is not worth a vector of its
 * own); a section over 400 words is cut at sentence ends; every passage starts
 * with the record's title, and its heading when it has one, so "Step 3 …" still
 * knows what it is a step of. Plain text in, plain text out.
 */
final class Passages
{
    public const TARGET_WORDS = 250;

    public const MAX_WORDS = 400;

    public const MAX_CHARS = 2000;

    /** A piece's own budget; the rest of MAX_CHARS is for the title and heading prefix. */
    private const PIECE_CHARS = 1800;

    /**
     * @param  list<array{heading: ?string, text: string}>  $sections
     * @return list<array{heading: ?string, text: string}>
     */
    public static function split(string $title, array $sections): array
    {
        $chunks = [];

        foreach ($sections as $section) {
            $text = trim(preg_replace('/\s+/u', ' ', $section['text']) ?? '');
            if ($text === '') {
                continue;
            }
            foreach (self::cut($text) as $piece) {
                $chunks[] = ['heading' => $section['heading'], 'text' => $piece];
            }
        }

        // A chunk smaller than half the target joins the one before it.
        $merged = [];
        foreach ($chunks as $chunk) {
            $last = array_key_last($merged);
            if ($last !== null && self::count($chunk['text']) < self::TARGET_WORDS / 2
                && self::count($merged[$last]['text']) + self::count($chunk['text']) <= self::MAX_WORDS) {
                $merged[$last]['text'] .= ' '.($chunk['heading'] !== null && $chunk['heading'] !== $merged[$last]['heading'] ? $chunk['heading'].'. ' : '').$chunk['text'];

                continue;
            }
            $merged[] = $chunk;
        }

        return array_map(function (array $p) use ($title) {
            $prefix = trim($title).($p['heading'] !== null && $p['heading'] !== '' ? ' — '.$p['heading'] : '').'.';
            $text = $prefix.' '.$p['text'];

            if (mb_strlen($text) > self::MAX_CHARS) {
                // Cut back to a sentence end inside the cap (past the prefix), else to a word: never mid-word.
                $head = mb_substr($text, 0, self::MAX_CHARS);
                $end = mb_strrpos($head, '.');
                if ($end === false || $end < mb_strlen($prefix)) {
                    $end = mb_strrpos($head, ' ');
                    $text = $end === false ? $head : mb_substr($head, 0, $end);
                } else {
                    $text = mb_substr($head, 0, $end + 1);
                }
            }

            return ['heading' => $p['heading'], 'text' => $text];
        }, $merged);
    }

    /** @return list<string> pieces of at most MAX_WORDS, cut after a sentence */
    private static function cut(string $text): array
    {
        if (self::count($text) <= self::MAX_WORDS && mb_strlen($text) <= self::PIECE_CHARS) {
            return [$text];
        }

        // । is the Devanagari full stop.
        $sentences = [];
        foreach (preg_split('/(?<=[.!?।])\s+/u', $text) ?: [$text] as $sentence) {
            array_push($sentences, ...self::words($sentence));
        }

        $pieces = [];
        $current = '';
        foreach ($sentences as $sentence) {
            if ($current !== '' && (self::count($current) + self::count($sentence) > self::TARGET_WORDS
                || mb_strlen($current) + mb_strlen($sentence) + 1 > self::PIECE_CHARS)) {
                $pieces[] = $current;
                $current = '';
            }
            $current = trim($current.' '.$sentence);
        }
        if ($current !== '') {
            $pieces[] = $current;
        }

        return $pieces;
    }

    /** @return list<string> a sentence as is, or in word-boundary parts when it alone is too long */
    private static function words(string $sentence): array
    {
        if (self::count($sentence) <= self::TARGET_WORDS && mb_strlen($sentence) <= self::PIECE_CHARS) {
            return [$sentence];
        }

        $parts = [];
        $current = '';
        foreach (preg_split('/\s+/u', $sentence, -1, PREG_SPLIT_NO_EMPTY) ?: [] as $word) {
            if ($current !== '' && (self::count($current) >= self::TARGET_WORDS || mb_strlen($current) + mb_strlen($word) + 1 > self::PIECE_CHARS)) {
                $parts[] = $current;
                $current = '';
            }
            $current = trim($current.' '.$word);
        }
        if ($current !== '') {
            $parts[] = $current;
        }

        return $parts;
    }

    /** Words in any script: letters, combining marks (Devanagari vowel signs) and digits. */
    private static function count(string $text): int
    {
        return (int) preg_match_all('/[\p{L}\p{M}\p{N}]+/u', $text);
    }
}
