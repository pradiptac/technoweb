<?php

namespace App\Enums;

/**
 * What happened to a suggestion after somebody read it.
 *
 * Three states and no more. `pending` is what every suggestion is born as, and
 * the two decisions are both reversible — an editor who rejects a title and
 * changes their mind an hour later should not have to run the call again and
 * pay for it twice.
 *
 * There is deliberately no `applied_automatically`. Nothing in this module
 * writes an SEO field without a person pressing Save on the record's own form,
 * so a state describing that would be a state nothing can ever be in.
 */
enum SeoSuggestionStatus: string
{
    case Pending = 'pending';
    case Applied = 'applied';
    case Rejected = 'rejected';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Not decided',
            self::Applied => 'Applied',
            self::Rejected => 'Rejected',
        };
    }

    /** @return array<int, string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }

    /** The two a person can move a suggestion to. */
    public static function decisions(): array
    {
        return [self::Applied->value, self::Rejected->value];
    }
}
