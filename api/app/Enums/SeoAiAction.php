<?php

namespace App\Enums;

/**
 * What the SEO assistant can be asked to do.
 *
 * One list, owned here and sent to the console on `meta` — the console never
 * retypes it, the rule `schema_type_options` and `meta.transitions` already
 * follow. Adding a seventh action is a case plus a prompt, not a change in four
 * files that then have to agree.
 *
 * Each case carries its own reply ceiling because the shapes differ by an order
 * of magnitude: a title and a description is a couple of dozen tokens, and a
 * rewritten page body is hundreds. A single ceiling would either truncate the
 * long one or pay for headroom the short ones never use.
 */
enum SeoAiAction: string
{
    case Generate = 'generate';
    case Analyze = 'analyze';
    case Improve = 'improve';
    case Faq = 'faq';
    case InternalLinks = 'internal_links';
    case Schema = 'schema';
    case Keywords = 'keywords';

    /*
     * The AEO and GEO actions (2026-09-21, `docs/aeo-geo-contract.md` §6).
     * The console's AEO tab draws exactly these eight and the SEO tab the
     * seven above — `AEO_ACTIONS` in `ai-seo-panel.tsx` is the one list on
     * that side, keyed by these values, so renaming a case blanks a button.
     */
    case AeoAnalyze = 'aeo_analyze';
    case Questions = 'questions';
    case AnswerBlocks = 'answer_blocks';
    case ImproveAnswer = 'improve_answer';
    case FaqSuggest = 'faq_suggest';
    case GeoAnalyze = 'geo_analyze';
    case EntityLinks = 'entity_links';
    case ProductQa = 'product_qa';

    public function label(): string
    {
        return match ($this) {
            self::Generate => 'Generate SEO',
            self::Analyze => 'Analyse SEO',
            self::Improve => 'Improve content',
            self::Faq => 'Generate FAQs',
            self::InternalLinks => 'Suggest internal links',
            self::Schema => 'Suggest schema',
            self::Keywords => 'Suggest keywords',
            self::AeoAnalyze => 'Analyse for answers',
            self::Questions => 'Suggest questions',
            self::AnswerBlocks => 'Draft answer blocks',
            self::ImproveAnswer => 'Improve an answer',
            self::FaqSuggest => 'Suggest FAQs',
            self::GeoAnalyze => 'Analyse for engines',
            self::EntityLinks => 'Suggest related records',
            self::ProductQa => 'Draft product answers',
        };
    }

    /** One line for the console, saying what pressing it will produce. */
    public function blurb(): string
    {
        return match ($this) {
            self::Generate => 'A title, a description and keywords for this record.',
            self::Analyze => 'Strengths, weaknesses and what the page does not cover.',
            self::Improve => 'Suggested edits to the copy, keeping what it says true.',
            self::Faq => 'Questions this page leaves unanswered, with answers.',
            self::InternalLinks => 'Existing pages worth linking to from this one.',
            self::Schema => 'Which structured-data type suits this page.',
            self::Keywords => 'The one phrase this page should win, the intent behind it, and the phrases around it.',
            self::AeoAnalyze => 'What an assistant could quote from this page as it stands, and what it cannot.',
            self::Questions => 'What people ask before choosing this, with the intent behind each question.',
            self::AnswerBlocks => 'A definition, key facts, use cases and steps written from the material, as draft blocks.',
            self::ImproveAnswer => 'A tighter direct answer and supporting detail for one block.',
            self::FaqSuggest => 'Questions the page leaves unanswered, with answers, as FAQ rows.',
            self::GeoAnalyze => 'Whether an engine can tell what it is quoting: the entity, its relationships, its authority.',
            self::EntityLinks => 'Solutions, services, industries, articles and products worth relating to this record.',
            self::ProductQa => "Answers written from the product's own facts — a missing one is marked, never invented.",
        };
    }

    /**
     * The reply ceiling.
     *
     * `Improve` is the outlier and has to be: it returns prose rather than
     * fields, and a rewrite cut off mid-sentence is worse than no rewrite —
     * an editor cannot tell a truncation from a suggestion to end there.
     */
    public function maxTokens(): int
    {
        return match ($this) {
            self::Generate => 400,
            self::Analyze => 700,
            self::Improve => 1200,
            self::Faq => 800,
            self::InternalLinks => 500,
            self::Schema => 300,
            self::Keywords => 500,
            self::AeoAnalyze, self::GeoAnalyze => 800,
            self::Questions => 600,
            // Up to eight blocks, each an answer and a paragraph of detail:
            // the second outlier after Improve, and for the same reason — a
            // block cut off mid-answer is a block an editor has to notice.
            self::AnswerBlocks, self::ProductQa => 1800,
            self::ImproveAnswer => 800,
            self::FaqSuggest => 800,
            self::EntityLinks => 500,
        };
    }

    /**
     * Whether this action needs the record's body text.
     *
     * The body is by far the largest thing in the prompt, so the actions that
     * do not read it should not pay for it. Schema is decided by what kind of
     * record this is and internal links by the candidate list, and neither is
     * improved by three hundred words of copy. `EntityLinks` does read it:
     * which industries and services a record *relates to* is decided by what
     * the copy says it is, where an internal link is decided by the target.
     */
    public function needsBody(): bool
    {
        return match ($this) {
            self::Schema, self::InternalLinks => false,
            default => true,
        };
    }

    /**
     * Whether the reply carries an answer somebody could publish.
     *
     * These are the actions the `[MISSING: what]` rule is stated on — a
     * block, a FAQ or a rewritten answer has a place to leave a hole where
     * a fact should be, and an analysis or a list of questions does not.
     */
    public function writesAnswers(): bool
    {
        return match ($this) {
            self::AnswerBlocks, self::ProductQa, self::ImproveAnswer, self::FaqSuggest => true,
            default => false,
        };
    }

    /**
     * Whether the action works on one block rather than on the record.
     *
     * `improve_answer` needs a `block_id` in the request and cannot run in
     * bulk: there is no "the block" of a record chosen from a list.
     */
    public function needsBlock(): bool
    {
        return $this === self::ImproveAnswer;
    }

    /** @return array<int, array{value: string, label: string, description: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label(), 'description' => $c->blurb()],
            self::cases(),
        );
    }
}
