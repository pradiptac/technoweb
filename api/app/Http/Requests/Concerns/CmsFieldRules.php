<?php

namespace App\Http\Requests\Concerns;

use App\Enums\AnswerBlockKind;
use Illuminate\Validation\Rule;

/**
 * Rules for the repeating fields several CMS entities share.
 */
class CmsFieldRules
{
    /** A repeating list of plain strings — benefits, technologies, features. */
    public static function stringList(string $field, int $max = 20, int $length = 160): array
    {
        return [
            $field => ['sometimes', 'nullable', 'array', "max:{$max}"],
            "{$field}.*" => ['string', "max:{$length}"],
        ];
    }

    /** Polymorphic FAQs, replaced wholesale on save. */
    public static function faqs(): array
    {
        return [
            'faqs' => ['sometimes', 'nullable', 'array', 'max:20'],
            'faqs.*.question' => ['required', 'string', 'max:255'],
            'faqs.*.answer' => ['required', 'string', 'max:2000'],
        ];
    }

    /**
     * Polymorphic answer blocks, replaced wholesale on save — the `faqs`
     * rule, with a `kind`.
     *
     * `question` is required only for the kinds that ask one
     * (`AnswerBlockKind::asksQuestion()`): a comparison or a free question
     * without its question is a heading with nothing to head, while a
     * definition has no question at all. `answer` is capped at 600 because it
     * is the *direct* answer — the sentence an assistant quotes — and the
     * explanation belongs in `detail`, which is rich text and unbounded. The
     * request declares `answer_blocks.*.detail` in `richTextFields()` so it
     * goes through the sanitiser with the body.
     */
    public static function answerBlocks(): array
    {
        $asking = array_map(
            fn (AnswerBlockKind $k) => $k->value,
            array_filter(AnswerBlockKind::cases(), fn (AnswerBlockKind $k) => $k->asksQuestion()),
        );

        return [
            'answer_blocks' => ['sometimes', 'nullable', 'array', 'max:40'],
            'answer_blocks.*.kind' => ['required', Rule::enum(AnswerBlockKind::class)],
            // The `*` in the parameter is resolved to the row being validated,
            // so each block is judged on its own kind.
            'answer_blocks.*.question' => [
                'nullable', 'string', 'max:255',
                'required_if:answer_blocks.*.kind,'.implode(',', $asking),
            ],
            'answer_blocks.*.answer' => ['required', 'string', 'max:600'],
            'answer_blocks.*.detail' => ['nullable', 'string'],
            'answer_blocks.*.status' => ['nullable', Rule::in(['draft', 'published'])],
        ];
    }

    /** A many-to-many selection of ids. */
    public static function ids(string $field, string $table): array
    {
        return [
            $field => ['sometimes', 'nullable', 'array'],
            "{$field}.*" => ['integer', "exists:{$table},id"],
        ];
    }
}
