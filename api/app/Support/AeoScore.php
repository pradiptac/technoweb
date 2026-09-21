<?php

namespace App\Support;

use App\Support\Seo\ScoresChecks;

/**
 * How ready a record is to be *quoted* — the answer-engine score.
 *
 * `SeoScore` asks whether a page can be found; this asks whether an assistant
 * handed the page could answer a question from it without inventing. The
 * checks are the sections of the page the answer blocks draw — a definition,
 * the questions people ask, the facts, the steps — and each is measurable
 * from what is stored, the rule `SeoScore` set: nothing here fetches the
 * rendered page.
 *
 * The same shape and the same arithmetic (`ScoresChecks`): a check declares
 * whether it applies to this kind of record, and the score is out of what
 * applies. A comparison is asked of a product and not of a blog post; a
 * step-by-step is asked of a knowledge article and not of an industry. The
 * applicability rules live here, never in the caller — the overview and the
 * single-record endpoint must agree, and two copies would not.
 *
 * Never a word about ranking. What this measures is whether the page states
 * things plainly enough to be repeated.
 */
final class AeoScore
{
    use ScoresChecks;

    public const GROUPS = [
        'answer' => 'Answers',
        'structure' => 'Structure',
        'links' => 'Links',
    ];

    /** Short enough for a badge; the hint carries the explanation. */
    public const LABELS = [
        'definition' => 'No definition',
        'questions' => 'Too few questions',
        'faq_page' => 'No FAQ page',
        'key_facts' => 'No key facts',
        'use_cases' => 'No use cases',
        'comparison' => 'No comparison',
        'steps' => 'No steps',
        'direct_answers' => 'Answers run long',
        'internal_links' => 'No internal links',
        'structured' => 'No structured data',
    ];

    /** The direct answer's ceiling — what an assistant quotes whole. */
    public const ANSWER_MAX = 600;

    /** Which kinds of record are asked for a comparison. */
    private const COMPARES = ['product', 'store_product', 'solution', 'service'];

    /** Which kinds of record are asked for steps. */
    private const STEPPED = ['knowledge_article', 'service', 'solution'];

    /**
     * @param  array  $input  type: the SEO overview's record type key
     *                        title: the record's title
     *                        body: its content as text; '' when it has none
     *                        has_body: whether the entity has a content field at all
     *                        answer_blocks: the kinds present, as a list (a kind repeated is counted each time)
     *                        overlong_answers: how many question blocks' answers exceed ANSWER_MAX; 0 when none
     *                        faq_count: FAQs on the record
     *                        has_specs: a spec sheet with at least one row (products)
     *                        internal_links: whether the body links to another page on this site
     *                        structured: whether the page carries a graph
     */
    public static function for(array $input): array
    {
        $type = (string) ($input['type'] ?? '');
        $kinds = array_values(array_map('strval', (array) ($input['answer_blocks'] ?? [])));
        $count = fn (string $kind) => count(array_keys($kinds, $kind, true));
        $faqs = (int) ($input['faq_count'] ?? 0);
        $hasBody = (bool) ($input['has_body'] ?? false);
        $questions = $count('question');
        $isProduct = in_array($type, ['product', 'store_product'], true);

        $checks = [
            // ------------------------------------------------------ answers
            self::check('definition', 'answer', 10, true, $count('definition') > 0,
                'No "What is it?" block. The first thing an assistant looks for is a one-paragraph definition it can repeat, and without one it writes its own.'),

            self::check('questions', 'answer', 10, true, $questions + $faqs >= 3,
                'Fewer than three questions answered on the page, counting FAQs and question blocks. A page that answers the questions people actually ask is the page that gets quoted for them.'),

            self::check('key_facts', 'answer', 8, true, $count('key_fact') + $count('feature') > 0 || ($isProduct && ($input['has_specs'] ?? false)),
                $isProduct
                    ? 'No key facts, features or spec sheet. A product with no stated facts is one an assistant can only describe from its name.'
                    : 'No key fact or feature blocks. Short, concrete statements are what gets lifted into an answer; prose is what gets summarised badly.'),

            self::check('use_cases', 'answer', 8, true, $count('use_case') > 0,
                'No use-case blocks. "Is this right for X?" is answered from these, and without them the answer is a guess.'),

            self::check('comparison', 'answer', 6, in_array($type, self::COMPARES, true), $count('comparison') > 0,
                'No comparison block. "X or Y?" is the question this kind of page is asked most, and a page that never compares is never quoted for it.'),

            self::check('steps', 'answer', 6, in_array($type, self::STEPPED, true), $count('step') > 0,
                'No step blocks. "How do I…" wants an ordered list, and a page without one is paraphrased into the wrong order.'),

            self::check('direct_answers', 'answer', 8, $questions > 0, (int) ($input['overlong_answers'] ?? 0) === 0,
                'A question block\'s direct answer runs past '.self::ANSWER_MAX.' characters. The direct answer is the sentence that gets quoted; the rest belongs in the detail.'),

            // ---------------------------------------------------- structure
            self::check('faq_page', 'structure', 8, true, $questions + $faqs >= 2,
                'Under two questions, so no FAQPage markup is emitted — the gate refuses an FAQ page over one question. Add a second and the markup follows.'),

            self::check('structured', 'structure', 10, true, (bool) ($input['structured'] ?? true),
                'The page carries no structured data at all, so nothing states in a machine-readable way what it is.'),

            // -------------------------------------------------------- links
            self::check('internal_links', 'links', 6, $hasBody, (bool) ($input['internal_links'] ?? false),
                'Nothing in the body links to another page on the site. An answer with a next step is one an assistant can send somebody on to.'),
        ];

        return self::tally($checks);
    }

    /**
     * The shape the overview and the single-record endpoint publish:
     * `SeoScore`'s without `issues`, which is a question only that score
     * answers.
     *
     * @return array{value: int, band: string, passed: int, checked: int, failed: array<int, array{key: string, group: string, label: string, weight: int, hint: string}>}
     */
    public static function publish(array $score): array
    {
        unset($score['issues']);

        return $score;
    }
}
