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

    public function label(): string
    {
        return match ($this) {
            self::Generate => 'Generate SEO',
            self::Analyze => 'Analyse SEO',
            self::Improve => 'Improve content',
            self::Faq => 'Generate FAQs',
            self::InternalLinks => 'Suggest internal links',
            self::Schema => 'Suggest schema',
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
        };
    }

    /**
     * Whether this action needs the record's body text.
     *
     * The body is by far the largest thing in the prompt, so the actions that
     * do not read it should not pay for it. Schema is decided by what kind of
     * record this is and internal links by the candidate list, and neither is
     * improved by three hundred words of copy.
     */
    public function needsBody(): bool
    {
        return match ($this) {
            self::Schema, self::InternalLinks => false,
            default => true,
        };
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
