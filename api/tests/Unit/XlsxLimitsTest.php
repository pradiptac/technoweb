<?php

namespace Tests\Unit;

use App\Support\Newsletter\Xlsx;
use PHPUnit\Framework\TestCase;

/**
 * An uploaded workbook cannot make the reader do unbounded work.
 *
 * Two ways a few kilobytes became gigabytes: a part that inflates without a
 * ceiling (the zip bomb), and a cell reference past the last column, which
 * the row builder pads out to with empty strings.
 */
class XlsxLimitsTest extends TestCase
{
    /** One entry, stored as the reader expects: a local header, then the deflated bytes. */
    private function extract(string $deflated): ?string
    {
        $name = 'xl/worksheets/sheet1.xml';
        $zip = Xlsx::SIGNATURE.str_repeat("\0", 22).pack('v', strlen($name)).pack('v', 0).$name.$deflated;

        $method = new \ReflectionMethod(Xlsx::class, 'extract');

        return $method->invoke(null, $zip, [$name => [8, strlen($deflated), 0]], $name);
    }

    public function test_a_part_that_inflates_past_the_ceiling_is_refused(): void
    {
        $bomb = gzdeflate(str_repeat('A', Xlsx::MAX_INFLATED_BYTES + 1024), 9);

        $this->assertLessThan(1024 * 1024, strlen($bomb), 'The fixture is a bomb: small in, large out.');
        $this->assertNull($this->extract($bomb));
    }

    public function test_a_part_under_the_ceiling_still_reads(): void
    {
        $this->assertSame('<sheetData/>', $this->extract(gzdeflate('<sheetData/>')));
    }

    public function test_a_reference_past_the_last_column_is_not_a_cell(): void
    {
        $method = new \ReflectionMethod(Xlsx::class, 'columnIndex');

        $this->assertSame(0, $method->invoke(null, 'A1'));
        $this->assertSame(27, $method->invoke(null, 'AB12'));
        $this->assertSame(16383, $method->invoke(null, 'XFD1'));
        $this->assertSame(-1, $method->invoke(null, 'XFE1'));
        $this->assertSame(-1, $method->invoke(null, 'ZZZZZZZZZZ1'));
    }
}
