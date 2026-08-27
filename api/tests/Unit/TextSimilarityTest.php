<?php

namespace Tests\Unit;

use App\Support\LandingPageQuality;
use App\Support\TextSimilarity;
use PHPUnit\Framework\TestCase;

/**
 * The measurement the whole landing-page module rests on.
 *
 * `LandingPageQuality` refuses to publish two pages whose introductions read
 * the same, and everything about whether that is a useful rule or an obstacle
 * comes down to whether this class can tell a substituted noun from a second
 * piece of writing. So both ends are pinned here rather than the threshold
 * being asserted about in the abstract: the doorway cases must score above the
 * line and the honest ones must score well below it, with the gap wide enough
 * that nobody lands in it by accident.
 *
 * The copy below is deliberately the kind this site would actually carry. Two
 * paragraphs of lorem ipsum share no vocabulary and would make this pass for
 * the wrong reason.
 */
class TextSimilarityTest extends TestCase
{
    private const KOLKATA = '<p>Our engineers attend sites across Kolkata and the surrounding districts, usually the same working day. We hold spares for the switch and firewall lines we deploy most, so a failed unit is replaced rather than ordered. Most of our Kolkata work is manufacturing and healthcare, where the network cannot be taken down during the day.</p>';

    /* -------------------------------------------------- the thing being caught */

    public function test_a_page_with_the_place_name_swapped_is_caught(): void
    {
        $doorway = str_replace('Kolkata', 'Howrah', self::KOLKATA);

        $score = TextSimilarity::score(self::KOLKATA, $doorway);

        $this->assertGreaterThan(
            LandingPageQuality::MAX_SIMILARITY,
            $score,
            'the textbook doorway page must not be publishable',
        );
    }

    /**
     * The same trick with a little more effort put in.
     *
     * This is the case that decides whether the threshold is set usefully or
     * merely set. Somebody who changes the city *and* reworks a clause has done
     * more than a loop would, and has still produced the same page.
     */
    public function test_a_place_name_and_a_reworded_clause_is_still_caught(): void
    {
        $doorway = str_replace(
            ['Kolkata', 'manufacturing and healthcare'],
            ['Siliguri', 'hospitality and retail'],
            self::KOLKATA,
        );

        $this->assertGreaterThan(
            LandingPageQuality::MAX_SIMILARITY,
            TextSimilarity::score(self::KOLKATA, $doorway),
        );
    }

    public function test_identical_text_scores_one(): void
    {
        $this->assertSame(1.0, TextSimilarity::score(self::KOLKATA, self::KOLKATA));
    }

    /* ------------------------------------------- what must not be caught */

    /**
     * Two pages about the same subject, written separately.
     *
     * The expensive failure mode is not a doorway page slipping through — it is
     * this being refused, because then the gate is something people work around
     * rather than something that helps, and the module is worse than not having
     * been built.
     */
    public function test_two_location_pages_written_separately_are_not_flagged(): void
    {
        $siliguri = '<p>Siliguri is a four-hour drive from our Kolkata store, so we work there on a scheduled basis rather than on call — a standing visit each fortnight, plus remote support in between. Tea estates and the hotels along Hill Cart Road make up most of it. For anything that cannot wait for the next visit we ship a replacement overnight.</p>';

        $score = TextSimilarity::score(self::KOLKATA, $siliguri);

        $this->assertLessThan(LandingPageQuality::MAX_SIMILARITY, $score);
        // Not merely under the line — nowhere near it. If this ever creeps up,
        // the threshold is being squeezed from the wrong side.
        $this->assertLessThan(0.1, $score);
    }

    public function test_different_subjects_share_nothing(): void
    {
        $switches = '<p>Cisco Catalyst switching is what we fit in buildings that will be re-cabled once and then left alone for a decade. The CBS350 line covers most offices; anything with more than four floors of users usually wants the 9200 for stacking and redundant power.</p>';

        $this->assertLessThan(0.1, TextSimilarity::score(self::KOLKATA, $switches));
    }

    /**
     * The threshold has empty space on both sides of it.
     *
     * Stated as its own assertion because it is the property that makes the
     * number defensible. A gate set at the edge of the honest range is a gate
     * that will start refusing real work as soon as somebody writes in a house
     * style; this one has a gap of more than 0.4 beneath the nearest doorway
     * case and above the worst honest one.
     */
    public function test_the_threshold_sits_in_empty_space(): void
    {
        $worstHonest = TextSimilarity::score(
            self::KOLKATA,
            '<p>Siliguri is a four-hour drive from our Kolkata store, so we work there on a scheduled basis rather than on call — a standing visit each fortnight, plus remote support in between.</p>',
        );
        $bestDoorway = TextSimilarity::score(
            self::KOLKATA,
            str_replace(['Kolkata', 'manufacturing and healthcare'], ['Siliguri', 'hospitality and retail'], self::KOLKATA),
        );

        $this->assertGreaterThan(0.3, $bestDoorway - $worstHonest, 'the two populations must not be adjacent');
        $this->assertGreaterThan($worstHonest, LandingPageQuality::MAX_SIMILARITY);
        $this->assertLessThan($bestDoorway, LandingPageQuality::MAX_SIMILARITY);
    }

    /* ------------------------------------------------------------- edges */

    /**
     * Two texts too short to shingle are not evidence of anything.
     *
     * Returning 1.0 for a pair of empty strings would be defensible in the
     * abstract and wrong here: every freshly generated page has an empty
     * intro, so the first two of them would block each other with "this reads
     * as 100% the same" when the real problem is that neither has been written.
     * The length check says that far more usefully.
     */
    public function test_empty_and_very_short_text_scores_zero(): void
    {
        $this->assertSame(0.0, TextSimilarity::score(null, null));
        $this->assertSame(0.0, TextSimilarity::score('', ''));
        $this->assertSame(0.0, TextSimilarity::score('<p>Too short.</p>', '<p>Too short.</p>'));
    }

    /**
     * A block boundary is a word boundary, not a join.
     *
     * `strip_tags` deletes a tag without leaving anything in its place, so the
     * last word of one paragraph fuses to the first of the next — the defect
     * that once published "…asked for.Remote support…" as a meta description.
     * Fused tokens are worse here than they are in a description: they appear
     * in no other document, so every shingle containing one is unmatchable and
     * two identical texts would score as less alike than they are.
     *
     * A shingle *crossing* the boundary is correct and expected — the words do
     * follow one another when the page is read.
     */
    public function test_a_block_boundary_separates_words_rather_than_joining_them(): void
    {
        $this->assertSame(2, TextSimilarity::wordCount('<p>ten</p><p>ths</p>'));

        $shingles = TextSimilarity::shingles('<p>one two three four</p><p>five six seven eight</p>');

        // The real sequence of words is there...
        $this->assertArrayHasKey(md5('one two three four five'), $shingles);
        $this->assertArrayHasKey(md5('four five six seven eight'), $shingles);
        // ...and the fused version strip_tags would have produced is not.
        $this->assertArrayNotHasKey(md5('one two three fourfive six'), $shingles);
    }

    /**
     * Inline tags do *not* separate words.
     *
     * The other half of the same rule: spacing every tag would break
     * `<strong>ten</strong>ths` into two words, and a house style that bolds a
     * product name mid-sentence would then look like different prose from the
     * same sentence unbolded.
     */
    public function test_an_inline_tag_does_not_split_a_word(): void
    {
        $this->assertSame(1, TextSimilarity::wordCount('<p><strong>ten</strong>ths</p>'));
    }

    public function test_word_count_ignores_markup(): void
    {
        $this->assertSame(4, TextSimilarity::wordCount('<p><strong>one</strong> two</p><ul><li>three four</li></ul>'));
    }
}
