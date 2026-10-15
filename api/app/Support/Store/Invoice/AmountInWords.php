<?php

namespace App\Support\Store\Invoice;

/**
 * Rupees and paise written out, the Indian way: lakh and crore, not million.
 *
 * Not required by law and expected by every accountant who reads one — the
 * line exists so a figure cannot be altered after the fact without the words
 * disagreeing with it, which is the whole of why invoices have carried it
 * since long before they were printed by machines.
 *
 * Digits in groups of two above the thousand (`12,34,567`), so the words are
 * built from the same grouping rather than from the Western one: the number
 * `1234567` is "Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven",
 * and reading it in threes would make it "one million two hundred…", which
 * is not what the figure beside it says.
 */
final class AmountInWords
{
    private const ONES = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen',
    ];

    private const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    /**
     * "Rupees One Lakh Eighteen Thousand Only", or "… and Fifty Paise Only".
     *
     * Paise are named only when there are any: "and Zero Paise" on a round
     * figure reads as a machine filling a template.
     */
    public static function rupees(int $paise): string
    {
        $rupees = intdiv(abs($paise), 100);
        $fraction = abs($paise) % 100;

        $words = 'Rupees '.self::words($rupees);

        if ($fraction > 0) {
            $words .= ' and '.self::words($fraction).' Paise';
        }

        return ($paise < 0 ? 'Minus ' : '').$words.' Only';
    }

    /** A whole number in words, up to a crore of crores. */
    public static function words(int $n): string
    {
        if ($n === 0) {
            return 'Zero';
        }

        $parts = [];

        // Indian grouping: crore, lakh, thousand, then the last three digits.
        foreach ([10000000 => 'Crore', 100000 => 'Lakh', 1000 => 'Thousand'] as $unit => $name) {
            if ($n >= $unit) {
                $parts[] = self::words(intdiv($n, $unit)).' '.$name;
                $n %= $unit;
            }
        }

        if ($n >= 100) {
            $parts[] = self::ONES[intdiv($n, 100)].' Hundred';
            $n %= 100;
        }

        if ($n >= 20) {
            $parts[] = rtrim(self::TENS[intdiv($n, 10)].' '.self::ONES[$n % 10]);
        } elseif ($n > 0) {
            $parts[] = self::ONES[$n];
        }

        return implode(' ', $parts);
    }
}
