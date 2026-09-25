<?php

namespace App\Enums;

/**
 * Where a product review sits in moderation.
 *
 * The blog comment's lifecycle, with the shop's words: `CommentStatus` bins
 * a comment, a review is **rejected** — a review that is honest and unkind
 * is still published, so what a rejection means here is "this is not a
 * review" (an order query, a delivery complaint that belongs with the desk),
 * and the word says so. `spam` is the other reversible choice.
 *
 * **Everything arrives `Pending`, including from a verified buyer.** The
 * client's decision (2026-09-26): staff approve every review before it
 * appears. A verified purchase is evidence about the buyer, not about what
 * they wrote.
 */
enum ReviewStatus: string
{
    case Pending = 'pending';
    case Published = 'published';
    case Rejected = 'rejected';
    case Spam = 'spam';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Waiting',
            self::Published => 'Published',
            self::Rejected => 'Rejected',
            self::Spam => 'Spam',
        };
    }

    /** The only status the shop renders, and the only one the summary counts. */
    public function isPublic(): bool
    {
        return $this === self::Published;
    }

    /**
     * Every move is allowed, as on a blog comment: the only thing a status
     * change does is decide whether some text appears on a page, and every
     * one of those decisions is reversible.
     */
    public function canTransitionTo(self $next): bool
    {
        return $this !== $next;
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $s) => ['value' => $s->value, 'label' => $s->label()],
            self::cases(),
        );
    }
}
