<?php

namespace App\Enums;

/**
 * Why an address may never be mailed again.
 *
 * The reason is kept because the answer to "can we ever mail them again"
 * differs by it: a hard bounce is a fact about a mailbox and could in
 * principle be reversed if the address starts working, while an unsubscribe is
 * a decision by a person and must never be reversed by anything except that
 * person. Storing only "suppressed" makes those indistinguishable, and the
 * first bulk tidy-up gets it wrong.
 */
enum SuppressionReason: string
{
    case Unsubscribed = 'unsubscribed';
    case HardBounce = 'hard_bounce';
    case Complaint = 'complaint';
    case Manual = 'manual';

    public function label(): string
    {
        return match ($this) {
            self::Unsubscribed => 'Unsubscribed',
            self::HardBounce => 'Hard bounce',
            self::Complaint => 'Marked as spam',
            self::Manual => 'Added by staff',
        };
    }

    /**
     * Whether a person's own action put them here.
     *
     * The console offers to lift a suppression, and this is what decides
     * whether that offer appears: staff may undo a mistake of their own or a
     * dead mailbox that has come back, and may **not** undo somebody's
     * decision to leave.
     */
    public function isTheirDecision(): bool
    {
        return $this === self::Unsubscribed || $this === self::Complaint;
    }

    public static function options(): array
    {
        return array_map(fn (self $c) => ['value' => $c->value, 'label' => $c->label()], self::cases());
    }
}
