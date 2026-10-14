<?php

namespace App\Support\Store;

/**
 * What `Tax::breakdown()` worked out: the figures for each line, and the two
 * sums that go on the order.
 *
 * A value object rather than an array because three of its four fields are
 * money and the fourth decides how to read them, and a caller that picks the
 * wrong key out of an array finds out at the checkout.
 *
 * `taxablePaise + gstPaise` is the money the goods and the delivery come to
 * after the discount, and since 0.178.0 it is the same figure whichever way
 * the website shows prices — stored prices always include GST. `basis` is
 * only that choice of presentation, so `Checkout` does not branch on it.
 */
final readonly class TaxBreakdown
{
    /**
     * @param  list<array{gst_basis_points:int,taxable_paise:int,gst_paise:int,gross_paise:int}>  $lines
     * @param  array{gst_basis_points:int,taxable_paise:int,gst_paise:int,gross_paise:int}|null  $delivery
     */
    public function __construct(
        public string $basis,
        public array $lines,
        public ?array $delivery,
        public int $taxablePaise,
        public int $gstPaise,
    ) {}

    /** What is charged for the goods and the delivery, after the discount. */
    public function totalPaise(): int
    {
        return $this->taxablePaise + $this->gstPaise;
    }

    /**
     * The tax a checkout prints as a row of its own: all of it when the
     * website shows prices before GST, zero when it shows them with GST.
     *
     * This is the figure a checkout prints on its own line. On an inclusive
     * shop the tax is shown as a note under the total ("includes ₹18,000
     * GST"); on an exclusive one it is a row that adds up with the others,
     * and printing it as a note would make the column not add up.
     */
    public function addedPaise(): int
    {
        return $this->basis === Tax::BASIS_EXCLUSIVE ? $this->gstPaise : 0;
    }

    /**
     * The rates in play, lowest first, as basis points.
     *
     * One entry is the ordinary shop. More than one is what makes the
     * invoice print a rate-wise summary rather than a single line.
     *
     * @return list<int>
     */
    public function rates(): array
    {
        $all = array_column($this->lines, 'gst_basis_points');

        if ($this->delivery !== null) {
            $all[] = $this->delivery['gst_basis_points'];
        }

        $rates = array_values(array_unique($all));
        sort($rates);

        return $rates;
    }
}
