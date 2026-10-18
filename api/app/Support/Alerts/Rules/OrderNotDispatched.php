<?php

namespace App\Support\Alerts\Rules;

use App\Enums\OrderStatus;
use App\Enums\Role;
use App\Models\Order;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use Illuminate\Support\Collection;

final class OrderNotDispatched implements AlertRule
{
    public function key(): string
    {
        return 'order_not_dispatched';
    }

    public function role(): Role
    {
        return Role::StoreManager;
    }

    public function label(): string
    {
        return 'A paid order not yet sent';
    }

    public function thresholdLabel(): string
    {
        return 'after '.AlertSettings::threshold('alert_order_dispatch_days').' days';
    }

    /** The store's own "paid", less what has nothing to put in a box. */
    public function current(): Collection
    {
        return Order::query()->paid()->whereNull('dispatched_at')
            ->whereNotIn('status', [OrderStatus::Cancelled, OrderStatus::Refunded, OrderStatus::RefundRequested])
            ->where('paid_at', '<=', now()->subDays(AlertSettings::threshold('alert_order_dispatch_days')))
            ->with('items')->oldest('paid_at')->limit(50)->get()
            ->filter(fn (Order $o) => $o->needsShipping())
            ->map(fn (Order $o) => new AlertHit(
                'order:'.$o->id,
                "Order {$o->order_number} was paid ".(int) $o->paid_at->diffInDays(now(), true).' days ago and has not been sent.',
                '/admin/store/orders/'.$o->order_number,
            ))->values();
    }
}
