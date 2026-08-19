<?php

namespace App\Enums;

enum TicketStatus: string
{
    case Open = 'open';
    case Assigned = 'assigned';
    case InProgress = 'in_progress';
    case PendingCustomer = 'pending_customer';
    case Resolved = 'resolved';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Open => 'Open',
            self::Assigned => 'Assigned',
            self::InProgress => 'In progress',
            self::PendingCustomer => 'Pending customer',
            self::Resolved => 'Resolved',
            self::Closed => 'Closed',
        };
    }

    /** Statuses a ticket still counts as "live" in. */
    public static function openStates(): array
    {
        return [self::Open, self::Assigned, self::InProgress, self::PendingCustomer];
    }

    public function isOpen(): bool
    {
        return in_array($this, self::openStates(), true);
    }

    /**
     * Permitted transitions. Staff move a ticket forward; a customer may only
     * reply (which reopens a pending ticket) or close a resolved one.
     */
    public function canTransitionTo(self $next): bool
    {
        return in_array($next, match ($this) {
            self::Open => [self::Assigned, self::InProgress, self::Resolved, self::Closed],
            self::Assigned => [self::InProgress, self::PendingCustomer, self::Resolved, self::Closed],
            self::InProgress => [self::PendingCustomer, self::Resolved, self::Closed],
            self::PendingCustomer => [self::InProgress, self::Resolved, self::Closed],
            self::Resolved => [self::Closed, self::InProgress],   // reopen if it was not actually fixed
            self::Closed => [self::InProgress],                   // reopen
        }, true);
    }
}
