<?php

namespace Tests\Unit;

use App\Support\Money;
use PHPUnit\Framework\TestCase;

/**
 * The GST arithmetic, pinned against the brief's own worked examples.
 *
 * The property that matters more than any single figure is the last test here:
 * the taxable value and the GST must add back up to what the customer paid, at
 * every amount. An invoice whose two halves do not sum to its total is not a
 * rounding nicety, it is a document nobody can file.
 */
class MoneyTest extends TestCase
{
    public function test_the_briefs_worked_example(): void
    {
        // ₹11,800 inclusive => ₹10,000 taxable + ₹1,800 GST.
        $this->assertSame(1000000, Money::taxable(1180000));
        $this->assertSame(180000, Money::gst(1180000));
    }

    public function test_the_briefs_discounted_example(): void
    {
        // ₹11,300 after a ₹500 coupon => ₹9,576.27 + ₹1,723.73.
        $this->assertSame(957627, Money::taxable(1130000));
        $this->assertSame(172373, Money::gst(1130000));
    }

    /**
     * GST is never added on top of a displayed price.
     *
     * Rule 3 of the brief, and the mistake that would double-charge every
     * customer 18%. Stated as a test because it is an arithmetic *direction*,
     * which a comment cannot hold.
     */
    public function test_gst_is_extracted_and_never_added(): void
    {
        $this->assertLessThan(1180000, Money::taxable(1180000));
        $this->assertSame(1180000, Money::taxable(1180000) + Money::gst(1180000));
    }

    /**
     * The halves add up, at every amount.
     *
     * `gst()` is defined as the difference rather than computed independently
     * for exactly this reason — two separately rounded figures disagree with
     * their own total roughly half the time.
     */
    public function test_the_split_always_sums_to_the_total(): void
    {
        for ($paise = 1; $paise <= 20000; $paise += 7) {
            $this->assertSame(
                $paise,
                Money::taxable($paise) + Money::gst($paise),
                "the split does not sum at {$paise} paise",
            );
        }
    }

    public function test_a_percentage_rounds_half_up_without_a_float(): void
    {
        $this->assertSame(118000, Money::percentage(1180000, 10));
        $this->assertSame(1, Money::percentage(14, 10));       // 1.4 paise -> 1
        $this->assertSame(2, Money::percentage(15, 10));       // 1.5 paise -> 2, half up
    }

    /** Indian digit grouping, because 118000 reads as a typo here. */
    public function test_amounts_are_grouped_in_lakhs(): void
    {
        $this->assertSame('₹11,800', Money::format(1180000));
        $this->assertSame('₹1,23,45,678.90', Money::format(1234567890));
        $this->assertSame('₹9,576.27', Money::format(957627));
        $this->assertSame('₹999', Money::format(99900));
    }
}
