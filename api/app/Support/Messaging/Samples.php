<?php

namespace App\Support\Messaging;

use App\Models\Setting;

/**
 * One believable value per placeholder — the console's live preview, a
 * template test send, and the example a provider insists on when it
 * reviews a template all read the same list.
 */
final class Samples
{
    public static function value(string $name): string
    {
        return match ($name) {
            'customer_name' => 'Neil Basu',
            'first_name' => 'Neil',
            'site_name' => (string) Setting::get('company_name', 'Technoware'),
            'order_number' => 'TW-10042',
            'order_total', 'basket_total' => '₹12,400',
            'old_price' => '₹14,999',
            'new_price' => '₹12,999',
            'courier' => 'Blue Dart',
            'tracking_number' => 'BD1234567890',
            'reference' => 'TW-2026-00042',
            'subject' => 'Switch keeps rebooting',
            'item_count' => '2',
            'coupon_code' => 'COMEBACK10',
            'product_name' => 'Aruba 6100 48G switch',
            'service_name' => 'Network installation',
            'visit_date' => 'Tue 6 Oct',
            'visit_time' => '10:30',
            default => str_ends_with($name, '_url') ? rtrim((string) config('app.frontend_url'), '/').'/store' : 'example',
        };
    }
}
