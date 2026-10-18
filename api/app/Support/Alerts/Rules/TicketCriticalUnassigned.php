<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Enums\TicketPriority;
use App\Models\Ticket;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\Rules;
use Illuminate\Support\Collection;

final class TicketCriticalUnassigned implements AlertRule
{
    public function key(): string
    {
        return 'ticket_critical_unassigned';
    }

    public function role(): Role
    {
        return Role::SupportEngineer;
    }

    public function label(): string
    {
        return 'A critical ticket nobody has taken';
    }

    public function thresholdLabel(): string
    {
        return 'after '.AlertSettings::threshold('alert_ticket_critical_minutes').' minutes';
    }

    public function current(): Collection
    {
        $minutes = AlertSettings::threshold('alert_ticket_critical_minutes');

        return Ticket::query()->open()->where('priority', TicketPriority::Critical)->whereNull('assigned_to')
            ->where('created_at', '<=', now()->subMinutes($minutes))->oldest()->limit(Rules::CAP)->get(['id', 'reference', 'created_at'])
            ->map(fn (Ticket $t) => new AlertHit(
                'ticket:'.$t->id,
                "{$t->reference} is critical and nobody has taken it (".(int) $t->created_at->diffInMinutes(now(), true).' min).',
                '/admin/tickets/'.$t->reference,
            ))->values();
    }
}
