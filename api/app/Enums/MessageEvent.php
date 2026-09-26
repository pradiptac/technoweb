<?php

namespace App\Enums;

/**
 * Something that happened which a customer may be told about on a channel
 * other than email — WhatsApp, RCS or a browser push.
 *
 * Email stays where it was: every one of these already has (or gains) an
 * email template sent through `Notifier`. This list is what the messaging
 * module's Automations screen maps to a channel template, and what
 * `App\Support\Messaging\Messenger::notify()` is called with beside the
 * email.
 *
 * `promotional()` is the line between "anytime" and "inside the quiet-hours
 * window" (`App\Support\Messaging\QuietHours`): an order update is expected
 * and wanted at 11pm, a basket reminder is not.
 */
enum MessageEvent: string
{
    case OrderPlaced = 'order_placed';
    case OrderPaid = 'order_paid';
    case OrderDispatched = 'order_dispatched';
    case TicketReplied = 'ticket_replied';
    case CartReminder1 = 'cart_reminder_1';
    case CartReminder2 = 'cart_reminder_2';
    case WishlistBackInStock = 'wishlist_back_in_stock';
    case WishlistPriceDrop = 'wishlist_price_drop';
    // Engineer visits (2026-09-26, docs/visits.md) — all three transactional.
    case VisitRequested = 'visit_requested';
    case VisitConfirmed = 'visit_confirmed';
    case VisitReminder = 'visit_reminder';

    public function label(): string
    {
        return match ($this) {
            self::OrderPlaced => 'Order placed',
            self::OrderPaid => 'Order paid',
            self::OrderDispatched => 'Order dispatched',
            self::TicketReplied => 'Reply on a ticket',
            self::CartReminder1 => 'Basket reminder — first',
            self::CartReminder2 => 'Basket reminder — second',
            self::WishlistBackInStock => 'Wishlist item back in stock',
            self::WishlistPriceDrop => 'Wishlist item price drop',
            self::VisitRequested => 'Visit requested',
            self::VisitConfirmed => 'Visit confirmed or moved',
            self::VisitReminder => 'Visit tomorrow — reminder',
        };
    }

    public function promotional(): bool
    {
        return match ($this) {
            self::CartReminder1, self::CartReminder2,
            self::WishlistBackInStock, self::WishlistPriceDrop => true,
            default => false,
        };
    }

    /**
     * The placeholders a template for this event may use, beside the
     * always-present `customer_name`, `first_name` and `site_name`.
     *
     * @return list<string>
     */
    public function placeholders(): array
    {
        return match ($this) {
            self::OrderPlaced, self::OrderPaid => ['order_number', 'order_total', 'order_url'],
            self::OrderDispatched => ['order_number', 'order_url', 'courier', 'tracking_number', 'tracking_url'],
            self::TicketReplied => ['reference', 'subject', 'ticket_url'],
            self::CartReminder1, self::CartReminder2 => ['basket_url', 'item_count', 'basket_total', 'coupon_code'],
            self::WishlistBackInStock => ['product_name', 'product_url'],
            self::WishlistPriceDrop => ['product_name', 'product_url', 'old_price', 'new_price'],
            self::VisitRequested => ['reference', 'service_name', 'visit_url'],
            self::VisitConfirmed, self::VisitReminder => ['reference', 'service_name', 'visit_date', 'visit_time', 'visit_url'],
        };
    }
}
