<?php

namespace Tests\Feature;

use App\Support\Messaging\QuietHours;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QuietHoursTest extends TestCase
{
    use RefreshDatabase;

    private function at(string $time): CarbonImmutable
    {
        return CarbonImmutable::parse('2026-09-25 '.$time, 'Asia/Kolkata');
    }

    public function test_the_default_window_is_nine_to_nine_ist(): void
    {
        $this->assertFalse(QuietHours::allows($this->at('08:59')));
        $this->assertTrue(QuietHours::allows($this->at('09:00')));
        $this->assertTrue(QuietHours::allows($this->at('20:59')));
        $this->assertFalse(QuietHours::allows($this->at('21:00')));
    }

    public function test_a_utc_moment_is_judged_in_ist(): void
    {
        // 04:00 UTC is 09:30 IST.
        $this->assertTrue(QuietHours::allows(CarbonImmutable::parse('2026-09-25 04:00', 'UTC')));
    }

    public function test_next_opening_is_this_morning_or_tomorrow_morning(): void
    {
        $this->assertSame('2026-09-25 09:00', QuietHours::nextOpening($this->at('06:30'))->format('Y-m-d H:i'));
        $this->assertSame('2026-09-26 09:00', QuietHours::nextOpening($this->at('22:15'))->format('Y-m-d H:i'));
        $this->assertSame('2026-09-25 12:00', QuietHours::nextOpening($this->at('12:00'))->format('Y-m-d H:i'));
    }
}
