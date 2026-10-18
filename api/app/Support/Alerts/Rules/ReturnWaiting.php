<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Models\OrderReturn;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use Illuminate\Support\Collection;

final class ReturnWaiting implements AlertRule
{
    public function key(): string
    {
        return 'return_waiting';
    }

    public function role(): Role
    {
        return Role::StoreManager;
    }

    public function label(): string
    {
        return 'A return nobody has answered';
    }

    public function thresholdLabel(): string
    {
        return 'after '.AlertSettings::threshold('alert_return_days').' days';
    }

    public function current(): Collection
    {
        return OrderReturn::query()->waiting()
            ->where('created_at', '<=', now()->subDays(AlertSettings::threshold('alert_return_days')))
            ->oldest()->limit(50)->get(['id', 'reference', 'created_at'])
            ->map(fn (OrderReturn $r) => new AlertHit(
                'return:'.$r->id,
                "Return {$r->reference} has waited ".(int) $r->created_at->diffInDays(now(), true).' days for an answer.',
                '/admin/store/returns/'.$r->reference,
            ))->values();
    }
}
