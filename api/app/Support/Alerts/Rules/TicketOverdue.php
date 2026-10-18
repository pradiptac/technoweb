<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Models\Ticket;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use Illuminate\Support\Collection;

final class TicketOverdue implements AlertRule
{
    public function key(): string
    {
        return 'ticket_overdue';
    }

    public function role(): Role
    {
        return Role::SupportEngineer;
    }

    public function label(): string
    {
        return 'A ticket past its due time';
    }

    public function thresholdLabel(): ?string
    {
        return null;
    }

    public function current(): Collection
    {
        return Ticket::query()->overdue()->orderBy('due_at')->limit(50)->get(['id', 'reference', 'due_at'])
            ->map(fn (Ticket $t) => new AlertHit('ticket:'.$t->id, "{$t->reference} is past its due time.", '/admin/tickets/'.$t->reference))
            ->values();
    }
}
