<?php

namespace App\Enums;

/**
 * Where a return is (docs/store.md "Returns").
 *
 * A PHP enum with the permitted moves written down, the `OrderStatus` rule:
 * a return in the wrong state is stock put back twice or money sent back for
 * goods nobody received.
 *
 *   requested → approved | rejected | closed
 *   approved  → received | closed
 *   received  → refunded | closed
 *   rejected  → approved          (a refusal made in error is reversible)
 *   refunded, closed              (the end)
 *
 * `closed` is "finished without a refund recorded here": a replacement was
 * sent, the customer changed their mind, the order was never paid for.
 */
enum ReturnStatus: string
{
    case Requested = 'requested';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Received = 'received';
    case Refunded = 'refunded';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Requested => 'Requested',
            self::Approved => 'Approved',
            self::Rejected => 'Not accepted',
            self::Received => 'Items received',
            self::Refunded => 'Refunded',
            self::Closed => 'Closed',
        };
    }

    /** @return list<self> */
    public function next(): array
    {
        return match ($this) {
            self::Requested => [self::Approved, self::Rejected, self::Closed],
            self::Approved => [self::Received, self::Closed],
            self::Received => [self::Refunded, self::Closed],
            self::Rejected => [self::Approved],
            self::Refunded, self::Closed => [],
        };
    }

    public function canTransitionTo(self $to): bool
    {
        return in_array($to, $this->next(), true);
    }

    /** Whether the desk still has something to do. */
    public function isOpen(): bool
    {
        return in_array($this, [self::Requested, self::Approved, self::Received], true);
    }

    /**
     * Whether the quantities on this return still count against what may be
     * returned. A refusal gives them back; so does a return closed before
     * anything arrived — `OrderReturn::holdsQuantity()` asks about that half.
     */
    public function claimsQuantity(): bool
    {
        return $this !== self::Rejected;
    }

    /** @return array<int, array{value: string, label: string}> */
    public static function options(): array
    {
        return array_map(fn (self $s) => ['value' => $s->value, 'label' => $s->label()], self::cases());
    }
}
