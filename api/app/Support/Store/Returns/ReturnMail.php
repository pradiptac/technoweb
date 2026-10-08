<?php

namespace App\Support\Store\Returns;

use App\Models\OrderReturn;
use App\Models\Setting;

/**
 * What the return emails share: the lines coming back, as text for the
 * built-in message and as one HTML placeholder for an edited template (a
 * subject-and-body template cannot hold a loop — the `OrderMail` rule).
 */
final class ReturnMail
{
    /** @return list<string> */
    public static function itemLines(OrderReturn $return): array
    {
        $return->loadMissing('items.orderItem');

        return $return->items->map(function ($line) {
            $item = $line->orderItem;
            $name = $item ? $item->name.($item->variation_name ? " ({$item->variation_name})" : '') : 'An item';

            return "{$line->quantity} x {$name}";
        })->all();
    }

    public static function itemsHtml(OrderReturn $return): string
    {
        $lines = array_map(fn (string $line) => '<li>'.e($line).'</li>', self::itemLines($return));

        return $lines === [] ? '' : '<ul>'.implode('', $lines).'</ul>';
    }

    /** How to send the goods back — Store → Settings, plain text. */
    public static function instructions(): string
    {
        return trim((string) Setting::get('store_return_instructions', ''));
    }
}
