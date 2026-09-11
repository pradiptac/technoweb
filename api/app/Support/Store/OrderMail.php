<?php

namespace App\Support\Store;

use App\Enums\PaymentMethod;
use App\Models\Order;
use App\Support\Money;

/**
 * What an email about an order says, in one place.
 *
 * Two emails list the same lines — the confirmation at checkout and the
 * receipt when the money lands — and until this existed each built its own
 * list, in its own punctuation, one of them in HTML and the other in
 * `->line()` calls. Two lists of one order is the newsletter's two
 * definitions of "delivered" again: fine until somebody edits one.
 *
 * The payment block is read from `PaymentOptions::forOrder()`, which is what
 * the order page renders. A customer who opens the email and then the page
 * must find the same account number, the same UPI ID and the same sentence
 * about quoting the order number — and the way to guarantee that is for
 * neither to have its own copy.
 *
 * Every method comes in two shapes: an HTML fragment for the editable
 * template (marked `html` in the catalogue, so `Placeholders::fill()` leaves
 * it alone) and plain lines for the built-in `MailMessage`, which renders
 * Markdown and escapes for itself.
 */
class OrderMail
{
    /** One `<li>` per line, escaped, the receipt's own format. */
    public static function itemsHtml(Order $order): string
    {
        $order->loadMissing('items');

        $items = $order->items->map(fn ($item) => '<li>'
            .e($item->quantity.' × '.$item->name.($item->variation_name ? " ({$item->variation_name})" : ''))
            .' — '.e(Money::format($item->line_total_paise)).'</li>')->implode('');

        return $items ? "<ul>{$items}</ul>" : '';
    }

    /**
     * The same lines for a `MailMessage`, which is Markdown and escapes for
     * itself.
     *
     * @return array<int, string>
     */
    public static function itemLines(Order $order): array
    {
        $order->loadMissing('items');

        return $order->items->map(fn ($item) => "{$item->quantity} x {$item->name}"
            .($item->variation_name ? " ({$item->variation_name})" : '')
            .' - '.Money::format($item->line_total_paise))->all();
    }

    /**
     * The subject's tail, and the one line that tells the four methods apart
     * from the inbox list.
     */
    public static function paymentStatus(Order $order): string
    {
        return match (self::method($order)) {
            PaymentMethod::Cod => 'confirmed, pay on delivery',
            PaymentMethod::BankTransfer => 'awaiting your transfer',
            PaymentMethod::Upi => 'awaiting your UPI payment',
            PaymentMethod::Gateway => 'payment not yet made',
        };
    }

    /** Whether the email's button should say "pay" rather than "view". */
    public static function asksForPayment(Order $order): bool
    {
        return self::method($order)->settlesOnline();
    }

    /**
     * How to pay, as the order page says it, for the editable template.
     *
     * The gateway is the one case `forOrder()` answers null for — there is
     * nothing to type into a page, only a button — so it gets the order page's
     * own sentence about nothing having been charged.
     */
    public static function paymentHtml(Order $order): string
    {
        $options = PaymentOptions::forOrder(self::method($order)->value, false);

        if ($options === null) {
            return '<p>Nothing has been charged yet. <a href="'.e($order->url()).'">Pay for this order</a>'
                .' — the items are held for you until then, but not reserved indefinitely.</p>';
        }

        $html = '<p><strong>'.e($options['heading']).'</strong></p>'
            .'<p>'.e($options['body']).'</p>'
            .'<p>Amount due: <strong>'.e(Money::format($order->total_paise)).'</strong></p>';

        if (filled($options['bank_details'])) {
            // Typed as lines in Settings; the page renders it pre-line, and a
            // <pre> is what keeps an account number on its own line here.
            $html .= '<pre>'.e($options['bank_details']).'</pre>';
        }

        if (filled($options['upi_id'])) {
            $html .= '<p>UPI ID: <strong>'.e($options['upi_id']).'</strong></p>';
        }

        if (filled($options['qr_url'])) {
            // A link, not an inline image: mail clients block remote images
            // by default, and the file can be replaced in the library.
            $html .= '<p><a href="'.e($options['qr_url']).'">Open the UPI QR code</a></p>';
        }

        if ($options['wants_reference']) {
            $html .= '<p>Quote <strong>'.e($order->order_number).'</strong> as the reference'
                .' — it is how the payment is matched to this order.</p>';
        }

        return $html;
    }

    /**
     * The same block as `->line()` calls for the built-in message.
     *
     * @return array<int, string>
     */
    public static function paymentLines(Order $order): array
    {
        $options = PaymentOptions::forOrder(self::method($order)->value, false);

        if ($options === null) {
            return ['**Nothing has been charged yet.** The items are held for you until you pay, but not reserved indefinitely.'];
        }

        $lines = [
            "**{$options['heading']}**",
            $options['body'],
            'Amount due: **'.Money::format($order->total_paise).'**',
        ];

        if (filled($options['bank_details'])) {
            // One line per row of the setting, so Markdown does not run the
            // account number into the IFSC.
            foreach (preg_split('/\R/', trim($options['bank_details'])) as $row) {
                if (trim($row) !== '') {
                    $lines[] = $row;
                }
            }
        }

        if (filled($options['upi_id'])) {
            $lines[] = "UPI ID: **{$options['upi_id']}**";
        }

        if (filled($options['qr_url'])) {
            $lines[] = "Open the UPI QR code: {$options['qr_url']}";
        }

        if ($options['wants_reference']) {
            $lines[] = "Quote **{$order->order_number}** as the reference — it is how the payment is matched to this order.";
        }

        return $lines;
    }

    /**
     * `payment_method` is an uncast string on the row, and a value nothing
     * recognises means the gateway — the fallback `forOrder()` already makes.
     */
    private static function method(Order $order): PaymentMethod
    {
        return PaymentMethod::tryFrom((string) $order->payment_method) ?? PaymentMethod::Gateway;
    }
}
