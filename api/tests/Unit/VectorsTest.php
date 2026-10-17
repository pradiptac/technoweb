<?php

namespace Tests\Unit;

use App\Support\Search\Vectors;
use PHPUnit\Framework\TestCase;

class VectorsTest extends TestCase
{
    public function test_pack_round_trips_and_normalise_makes_a_unit_vector(): void
    {
        $v = Vectors::normalise([3.0, 4.0]);

        $this->assertEqualsWithDelta([0.6, 0.8], $v, 1e-6);
        $this->assertEqualsWithDelta($v, Vectors::unpack(Vectors::pack($v)), 1e-6);
        $this->assertEqualsWithDelta(1.0, Vectors::dot($v, $v), 1e-6);
    }

    public function test_a_zero_vector_stays_zero_and_dimensions_must_match(): void
    {
        $this->assertSame([0.0, 0.0], Vectors::normalise([0.0, 0.0]));
        $this->assertSame(0.0, Vectors::dot([1.0, 0.0], [1.0]));
    }
}
