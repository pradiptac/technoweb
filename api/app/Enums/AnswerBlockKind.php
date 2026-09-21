<?php

namespace App\Enums;

/**
 * What an answer block is, which decides where the public page draws it.
 *
 * A block of kind `definition` is the page's "What is it?" paragraph, a
 * `step` is one item of its "How it works" list, a `question` is an entry in
 * the accordion beside the FAQs. The kind is the whole of the layout
 * decision: the editor picks one and the page's sections are the blocks of
 * that kind, in order. Nothing is hidden and nothing is generated — a block
 * exists because somebody wrote it.
 *
 * `asksQuestion()` says which kinds need a `question` column filled: a
 * comparison is "X or Y?" with an answer, and a free question is exactly
 * that. A definition has no question — its heading is the heading.
 */
enum AnswerBlockKind: string
{
    case Definition = 'definition';
    case WhoFor = 'who_for';
    case Why = 'why';
    case KeyFact = 'key_fact';
    case Feature = 'feature';
    case UseCase = 'use_case';
    case Comparison = 'comparison';
    case Step = 'step';
    case Question = 'question';

    /** What the console's kind select shows. */
    public function label(): string
    {
        return match ($this) {
            self::Definition => 'Definition — what is it?',
            self::WhoFor => 'Who is it for?',
            self::Why => 'Why is it needed?',
            self::KeyFact => 'Key fact',
            self::Feature => 'Feature',
            self::UseCase => 'Use case',
            self::Comparison => 'Comparison',
            self::Step => 'Step',
            self::Question => 'Question and answer',
        };
    }

    /** The section heading the public page draws blocks of this kind under. */
    public function heading(): string
    {
        return match ($this) {
            self::Definition => 'What is it?',
            self::WhoFor => 'Who is it for?',
            self::Why => 'Why is it needed?',
            self::KeyFact => 'Key facts',
            self::Feature => 'Key features',
            self::UseCase => 'Use cases',
            self::Comparison => 'Comparisons',
            self::Step => 'How it works',
            self::Question => 'Questions people ask',
        };
    }

    /** Whether a block of this kind must carry a `question`. */
    public function asksQuestion(): bool
    {
        return $this === self::Question || $this === self::Comparison;
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    /**
     * What the console's select is built from — sent by the API, never listed
     * in TypeScript, the rule `meta.transitions` and `schema_type_options`
     * follow.
     *
     * @return array<int, array{value: string, label: string, heading: string, asks_question: bool}>
     */
    public static function options(): array
    {
        return array_map(fn (self $kind) => [
            'value' => $kind->value,
            'label' => $kind->label(),
            'heading' => $kind->heading(),
            'asks_question' => $kind->asksQuestion(),
        ], self::cases());
    }
}
