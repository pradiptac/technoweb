<?php

namespace App\Enums;

/**
 * Where a comment sits in moderation.
 *
 * An enum rather than a lookup table, the call `TicketStatus` made: this is a
 * fixed lifecycle that application code branches on, and a new row in a table
 * could not introduce a new state without code changes anyway.
 *
 * **Everything arrives `Pending`, including from a signed-in customer.** A real
 * account is not evidence about a particular comment, and the moment there is
 * one exception the queue stops being trustworthy — somebody has to remember
 * which comments were auto-approved and go and look at them anyway.
 */
enum CommentStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Spam = 'spam';
    case Trash = 'trash';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Waiting',
            self::Approved => 'Published',
            self::Spam => 'Spam',
            self::Trash => 'Binned',
        };
    }

    /** The only status the public site renders. */
    public function isPublic(): bool
    {
        return $this === self::Approved;
    }

    /**
     * Every move is allowed, and that is deliberate.
     *
     * Unlike a ticket or an order there is no sequence here to protect — the
     * only thing a status change does is decide whether some text appears on a
     * page, and every one of those decisions is reversible. A misfiled real
     * comment is a reader who was silenced, which is exactly the mistake that
     * must be undoable; the same reasoning that makes `spam` and `won`
     * reversible on a lead.
     *
     * This method exists so the rule is stated rather than merely absent.
     */
    public function canTransitionTo(self $next): bool
    {
        return $this !== $next;
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(
            fn (self $c) => ['value' => $c->value, 'label' => $c->label()],
            self::cases(),
        );
    }
}
