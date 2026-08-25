<?php

namespace App\Enums;

/**
 * Where a portal account sits between "somebody filled in the form" and "this
 * person can open a ticket".
 *
 * An enum rather than a lookup table, for the same reason `TicketStatus` is
 * one: these are four fixed states that application code branches on, and a
 * new row in a table could not introduce a fifth without code to handle it.
 *
 * It replaces the `is_active` boolean, which could not tell "waiting for a
 * human" from "turned off by a human" — and those want opposite words in front
 * of the person trying to sign in. Two columns answering the same question is
 * how they drift.
 */
enum CustomerStatus: string
{
    /** Registered themselves; nobody has looked at it yet. */
    case Pending = 'pending';

    /** Approved by staff. The only state that can sign in. */
    case Active = 'active';

    /** Looked at and turned down — not a real customer, or a duplicate. */
    case Rejected = 'rejected';

    /** Was active, and has been switched off. */
    case Suspended = 'suspended';

    public function label(): string
    {
        return match ($this) {
            self::Pending => 'Pending approval',
            self::Active => 'Active',
            self::Rejected => 'Rejected',
            self::Suspended => 'Suspended',
        };
    }

    /**
     * The one place that decides whether a login proceeds.
     *
     * Deliberately not `$status !== Pending`: a state added later is refused
     * until somebody writes it into this match, which is the safe direction to
     * fail in.
     */
    public function canSignIn(): bool
    {
        return $this === self::Active;
    }

    /**
     * What the person at the sign-in form is told.
     *
     * Rejected and suspended share a sentence on purpose. "We turned you down"
     * is a conversation for a human to have, not a login form, and the
     * difference is of no use to whoever is typing.
     */
    public function signInMessage(): string
    {
        return match ($this) {
            self::Pending => 'Your account is waiting to be approved. We will email you as soon as it is.',
            self::Active => '',
            self::Rejected, self::Suspended => 'This portal account is not active. Contact your account engineer.',
        };
    }

    /** A machine-readable reason the frontend can branch on. */
    public function reasonCode(): string
    {
        return match ($this) {
            self::Pending => 'pending_approval',
            self::Active => 'active',
            self::Rejected => 'rejected',
            self::Suspended => 'suspended',
        };
    }

    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
