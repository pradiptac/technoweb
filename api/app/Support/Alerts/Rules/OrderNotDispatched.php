<?php

namespace App\Support\Alerts\Rules;

use App\Enums\OrderStatus;
use App\Enums\ProductType;
use App\Enums\Role;
use App\Models\Order;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\Rules;
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
        // Shipping is judged in SQL, before the cap: filtered afterwards, fifty old licence orders hid every parcel.
        return Order::query()->paid()->whereNull('dispatched_at')
            ->whereNotIn('status', [OrderStatus::Cancelled, OrderStatus::Refunded, OrderStatus::RefundRequested, OrderStatus::Completed])
            ->whereHas('items', fn ($q) => $q->where('type', ProductType::Physical))
            ->where('paid_at', '<=', now()->subDays(AlertSettings::threshold('alert_order_dispatch_days')))
            ->oldest('paid_at')->limit(Rules::CAP)->get()
            ->map(fn (Order $o) => new AlertHit(
                'order:'.$o->id,
                "Order {$o->order_number} was paid ".(int) $o->paid_at->diffInDays(now(), true).' days ago and has not been sent.',
                '/admin/store/orders/'.$o->order_number,
            ))->values();
    }
}
