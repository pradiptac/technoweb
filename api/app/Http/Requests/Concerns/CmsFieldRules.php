<?php

namespace App\Http\Requests\Concerns;

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

    /** A many-to-many selection of ids. */
    public static function ids(string $field, string $table): array
    {
        return [
            $field => ['sometimes', 'nullable', 'array'],
            "{$field}.*" => ['integer', "exists:{$table},id"],
        ];
    }
}
