<?php

namespace App\Support\Store\Invoice;

use App\Models\Order;
use App\Models\OrderItem;
use App\Support\IndianStates;
use App\Support\Money;

/**
 * One order, read as a tax invoice (0.176.0, `docs/store.md` "The GST
 * invoice").
 *
 * A document model and nothing else: it holds no HTML, writes no file and
 * touches no setting it does not read through `InvoiceSettings`. The print
 * view and the PDF are two renderings of this one array, which is what stops
 * the page and the attachment ever saying different things — the lesson
 * three screens disagreeing about the word "paid" taught this module.
 *
 * **Every figure comes off the order; none is recomputed.** The columns were
 * written at checkout under the rates in force that day, so an invoice
 * issued a year later still says what was charged, and a change to the
 * store's rate or to a product's cannot reach backwards. The one thing
 * derived here is the CGST/SGST/IGST *split*, which is arithmetic over
 * figures already stored and introduces no new number:
 *
 *     intra-state   cgst = ⌊gst ÷ 2⌋,  sgst = gst − cgst
 *     inter-state   igst = gst
 *
 * The floor-and-difference is deliberate, the same shape `Money` uses for
 * the taxable value: halving an odd number of paise twice and rounding each
 * half gives two halves that do not add back to the whole, and the one thing
 * an invoice may not do is fail to add up.
 *
 * **Delivery is its own line.** Its tax is the order's total less the sum of
 * the lines' — a definition rather than an apportionment, so it is exact
 * whatever the lines did.
 *
 * **An order placed before 0.176.0 has no per-line figures**, and this does
 * not invent them: it reads the one rate the order was charged at from its
 * two stored columns (`Money::rateOf`) and apportions the order's taxable
 * value and tax across the lines in paise by the largest-remainder rule, so
 * the printed lines sum exactly to the printed total. That is an
 * apportionment, and it is the honest one — the alternative is an invoice
 * for a real order that cannot be printed at all.
 */
final class GstInvoice
{
    private function __construct(
        public readonly Order $order,
        /** @var array<string, mixed> */
        public readonly array $seller,
        /** @var array<string, mixed> */
        public readonly array $buyer,
        /** @var list<array<string, mixed>> */
        public readonly array $lines,
        /** @var list<array<string, mixed>> */
        public readonly array $summary,
        /** @var array<string, mixed> */
        public readonly array $totals,
        public readonly bool $interState,
        public readonly ?string $placeOfSupply,
    ) {}

    public static function for(Order $order): self
    {
        $order->loadMissing(['items.product']);

        $sellerState = InvoiceSettings::stateCode();
        $supplyState = self::placeOfSupply($order);

        // Inter-state only when both are known and they differ. Unknown is
        // treated as intra-state, which is the conservative reading: CGST
        // and SGST are what a shop charges a customer in its own state, and
        // an address with no state on it is almost always a local one that
        // somebody typed carelessly.
        $interState = $sellerState !== null && $supplyState !== null && $sellerState !== $supplyState;

        $lines = self::lines($order, $interState);

        return new self(
            order: $order,
            seller: [
                'name' => InvoiceSettings::legalName(),
                'gstin' => InvoiceSettings::gstin(),
                'state' => IndianStates::name($sellerState),
                'state_code' => $sellerState,
                'address' => InvoiceSettings::address(),
                'email' => InvoiceSettings::email(),
                'phone' => InvoiceSettings::phone(),
            ],
            buyer: [
                'name' => $order->customer_name,
                'company' => $order->company_name,
                'gstin' => $order->gstin,
                'email' => $order->customer_email,
                'phone' => $order->customer_phone,
                'billing' => $order->billing_address,
                'shipping' => $order->shipping_address,
            ],
            lines: $lines,
            summary: self::summary($lines, $interState),
            totals: self::totals($order, $lines, $interState),
            interState: $interState,
            placeOfSupply: $supplyState,
        );
    }

    /**
     * Where the sale is taxed.
     *
     * For goods it is where they are delivered, so the delivery address
     * comes first; a digital order has none and is taxed at the buyer's
     * billing address. Both are what the order stored at checkout, never
     * what is on the customer's account today.
     */
    private static function placeOfSupply(Order $order): ?string
    {
        foreach ([$order->shipping_address, $order->billing_address] as $address) {
            $state = is_array($address) ? ($address['state'] ?? null) : null;

            if (filled($state)) {
                $code = IndianStates::isCode(strtoupper((string) $state))
                    ? strtoupper((string) $state)
                    : IndianStates::code((string) $state);

                if ($code !== null) {
                    return $code;
                }
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    private static function lines(Order $order, bool $interState): array
    {
        $items = $order->items->values();

        // An order from before the per-line columns existed. One rate for
        // the whole of it, and the order's own two figures spread across the
        // lines so they still add up to what was charged.
        $legacy = $items->isNotEmpty() && $items->every(fn (OrderItem $i) => $i->taxable_paise === null);

        if ($legacy) {
            $weights = $items->map(fn (OrderItem $i) => max(0, (int) $i->line_total_paise))->all();
            $taxables = self::spread((int) $order->taxable_paise, $weights);
            $taxes = self::spread((int) $order->gst_paise, $weights);
            $rate = Money::rateOf((int) $order->taxable_paise, (int) $order->gst_paise);
        }

        $lines = [];
        $itemTaxable = 0;
        $itemGst = 0;

        foreach ($items as $i => $item) {
            $taxable = $legacy ? $taxables[$i] : (int) $item->taxable_paise;
            $gst = $legacy ? $taxes[$i] : (int) $item->gst_paise;
            $basisPoints = $legacy ? $rate : $item->gst_basis_points;

            $itemTaxable += $taxable;
            $itemGst += $gst;

            $lines[] = self::line(
                description: $item->name.(filled($item->variation_name) ? ' — '.$item->variation_name : ''),
                hsn: self::hsn($item),
                quantity: (int) $item->quantity,
                taxable: $taxable,
                gst: $gst,
                basisPoints: $basisPoints,
                interState: $interState,
            );
        }

        /*
         * Delivery, as the difference rather than as a stored figure.
         *
         * The order's `taxable_paise` and `gst_paise` are the whole of what
         * was charged; the lines are the goods. What is left is the
         * delivery, exactly, with no rounding anywhere — and it comes out
         * right for a legacy order too, where the spread above consumed the
         * order's figures entirely and this is therefore zero, which is the
         * truth: before 0.176.0 the delivery's tax was never separated.
         */
        $deliveryTaxable = (int) $order->taxable_paise - $itemTaxable;
        $deliveryGst = (int) $order->gst_paise - $itemGst;

        if ($deliveryTaxable > 0 || $deliveryGst > 0) {
            $lines[] = self::line(
                description: 'Delivery'.(filled($order->shipping_zone) ? ' — '.$order->shipping_zone : ''),
                hsn: null,
                quantity: 1,
                taxable: $deliveryTaxable,
                gst: $deliveryGst,
                basisPoints: Money::rateOf($deliveryTaxable, $deliveryGst),
                interState: $interState,
            );
        }

        return $lines;
    }

    /** @return array<string, mixed> */
    private static function line(
        string $description,
        ?string $hsn,
        int $quantity,
        int $taxable,
        int $gst,
        ?int $basisPoints,
        bool $interState,
    ): array {
        $cgst = $interState ? 0 : intdiv($gst, 2);

        return [
            'description' => $description,
            'hsn' => $hsn,
            'quantity' => $quantity,
            'taxable_paise' => $taxable,
            'rate' => $basisPoints === null ? null : Money::ratePercent($basisPoints),
            'basis_points' => $basisPoints,
            'cgst_paise' => $cgst,
            'sgst_paise' => $interState ? 0 : $gst - $cgst,
            'igst_paise' => $interState ? $gst : 0,
            'gst_paise' => $gst,
            'total_paise' => $taxable + $gst,
        ];
    }

    /**
     * The HS code for a line: the product's, else the shop's default.
     *
     * Read through the relation, which `nullOnDelete` may have emptied — a
     * product deleted since the sale leaves a line that still has to print,
     * and it prints without a code rather than not at all.
     */
    private static function hsn(OrderItem $item): ?string
    {
        $own = $item->product?->hsn;

        return filled($own) ? (string) $own : InvoiceSettings::defaultHsn();
    }

    /**
     * The rate-wise summary every tax invoice carries.
     *
     * Grouped by HS code **and** rate, because that is the grouping a return
     * is filed in — two products at 18% under different codes are two rows,
     * and one code sold at two rates (a rate changed between orders) is two
     * rows as well.
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array<string, mixed>>
     */
    private static function summary(array $lines, bool $interState): array
    {
        $rows = [];

        foreach ($lines as $line) {
            $key = ($line['hsn'] ?? '-').'|'.($line['basis_points'] ?? '-');

            $rows[$key] ??= [
                'hsn' => $line['hsn'],
                'rate' => $line['rate'],
                'basis_points' => $line['basis_points'],
                'taxable_paise' => 0,
                'cgst_paise' => 0,
                'sgst_paise' => 0,
                'igst_paise' => 0,
                'gst_paise' => 0,
            ];

            foreach (['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'gst_paise'] as $field) {
                $rows[$key][$field] += $line[$field];
            }
        }

        return array_values($rows);
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @return array<string, mixed>
     */
    private static function totals(Order $order, array $lines, bool $interState): array
    {
        $gst = (int) $order->gst_paise;
        $cgst = $interState ? 0 : intdiv($gst, 2);

        return [
            'taxable_paise' => (int) $order->taxable_paise,
            'cgst_paise' => $cgst,
            'sgst_paise' => $interState ? 0 : $gst - $cgst,
            'igst_paise' => $interState ? $gst : 0,
            'gst_paise' => $gst,
            // What was charged, to the paisa. There is deliberately no
            // round-off line: the total on an invoice must be the amount
            // taken, and rounding it to the rupee would make the document
            // disagree with the payment beside it.
            'total_paise' => (int) $order->total_paise,
            'in_words' => AmountInWords::rupees((int) $order->total_paise),
            'discount_paise' => (int) $order->discount_paise,
        ];
    }

    /**
     * Split an amount across weights so the parts sum exactly to it.
     *
     * The same largest-remainder rule `Tax::apportion()` uses, and here for
     * the one case that class cannot cover: an order whose lines were never
     * taxed individually, where the only way to print a line is to divide
     * the order's own figures.
     *
     * @param  list<int>  $weights
     * @return list<int>
     */
    private static function spread(int $amount, array $weights): array
    {
        $count = count($weights);

        if ($count === 0) {
            return [];
        }

        $total = array_sum($weights);

        if ($total <= 0) {
            $weights = array_fill(0, $count, 1);
            $total = $count;
        }

        $parts = [];
        $remainders = [];

        foreach ($weights as $i => $weight) {
            $exact = $amount * $weight;
            $parts[$i] = intdiv($exact, $total);
            $remainders[$i] = $exact % $total;
        }

        $left = $amount - array_sum($parts);
        arsort($remainders, SORT_NUMERIC);

        foreach (array_keys($remainders) as $i) {
            if ($left <= 0) {
                break;
            }

            $parts[$i]++;
            $left--;
        }

        ksort($parts);

        return array_values($parts);
    }
}
