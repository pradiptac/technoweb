<?php

namespace App\Support;

/**
 * How alike two pieces of writing are, for the purpose of refusing to publish
 * the second one.
 *
 * This exists for a single job: catching the page that is another page with
 * the city name changed. That is the doorway pattern in its most common form,
 * it is what a template plus a loop produces by default, and it is invisible to
 * every other check in this codebase — both pages have a title, a description,
 * a word count and an intro, and both score perfectly well on their own.
 *
 * **Shingles, not `similar_text`.** PHP's `similar_text` is a longest-common-
 * substring measure: it is O(n^3) in the worst case, it has no notion of word
 * order, and on two 300-word paragraphs it happily reports 80% for texts that
 * share nothing but the English language. Comparing overlapping runs of words
 * asks the question actually being asked — "are these the same sentences?" —
 * and answers it in linear time.
 *
 * **Five-word runs.** Shorter and ordinary phrasing collides: "we design deploy
 * and support" is three shingles of three words that any two pages on this site
 * might legitimately share. Longer and a single substituted word stops hiding
 * the sentence around it, which is precisely the case being caught. Five is
 * long enough that an accidental match is a quotation and short enough that
 * swapping "Kolkata" for "Howrah" still leaves four matching shingles either
 * side of it.
 *
 * The numbers this produces are not subtle. Two intros differing only in a
 * place name score around 0.7; two genuinely different intros about the same
 * subject score under 0.1. `LandingPageQuality` refuses at 0.4, which sits in
 * the empty middle of that gap rather than at the edge of either side — see
 * `tests/Unit/TextSimilarityTest.php`, which pins both ends.
 */
class TextSimilarity
{
    /** Words per shingle. See the class docblock before changing it. */
    public const SHINGLE = 5;

    /**
     * Jaccard similarity of two texts, from 0 (nothing shared) to 1 (identical).
     *
     * HTML is reduced to text first, through `HtmlSanitiser::toText` rather
     * than `strip_tags` — the same rule the meta descriptions follow. Without
     * it the end of one paragraph runs into the start of the next and invents
     * a shingle that spans the join, so two documents could be scored on
     * phrases neither of them contains.
     */
    public static function score(?string $a, ?string $b): float
    {
        $left = self::shingles($a);
        $right = self::shingles($b);

        // Two texts too short to shingle are not evidence of anything. Saying
        // "identical" here would block every page whose intro is still a
        // sentence long, which the length check already handles and reports
        // far more usefully.
        if ($left === [] || $right === []) {
            return 0.0;
        }

        $shared = count(array_intersect_key($left, $right));
        $total = count($left + $right);

        return $total === 0 ? 0.0 : $shared / $total;
    }

    /**
     * Overlapping runs of `SHINGLE` words, keyed by hash so intersecting two
     * sets is a key comparison rather than a value scan.
     *
     * @return array<string, true>
     */
    public static function shingles(?string $text): array
    {
        $words = self::words($text);

        if (count($words) < self::SHINGLE) {
            return [];
        }

        $out = [];
        for ($i = 0; $i + self::SHINGLE <= count($words); $i++) {
            $out[md5(implode(' ', array_slice($words, $i, self::SHINGLE)))] = true;
        }

        return $out;
    }

    /**
     * Words, lowercased, with punctuation and runs of whitespace gone.
     *
     * Deliberately *not* stripping stop words. They are most of what makes one
     * sentence structurally identical to another, and a template with a noun
     * swapped is exactly two sentences with the same stop words in the same
     * order. Removing them would delete the signal this class is looking for.
     *
     * @return array<int, string>
     */
    private static function words(?string $text): array
    {
        $plain = HtmlSanitiser::toText($text);
        $plain = mb_strtolower($plain);

        // Keep digits and inner hyphens: "cbs350-24t" and "24" are content in a
        // hardware catalogue, and two spec paragraphs differing only in part
        // numbers are still two different paragraphs.
        $plain = preg_replace('/[^\p{L}\p{N}\s-]+/u', ' ', $plain) ?? '';

        return array_values(array_filter(preg_split('/\s+/u', trim($plain)) ?: []));
    }

    /** Words in a piece of rich text, for a length floor that means something. */
    public static function wordCount(?string $html): int
    {
        return count(self::words($html));
    }
}
