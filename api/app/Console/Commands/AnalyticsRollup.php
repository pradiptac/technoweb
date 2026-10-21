<?php

namespace App\Console\Commands;

use App\Models\AnalyticsDaily;
use App\Models\AnalyticsHit;
use App\Support\Analytics\Rollup;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/** Every closed day with raw hits and no daily rows, oldest first, plus yesterday always (a late hit). */
class AnalyticsRollup extends Command
{
    protected $signature = 'technoware:analytics-rollup';

    protected $description = 'Roll closed days of native analytics up into daily totals';

    public function handle(): int
    {
        $tz = (string) config('app.timezone');
        $today = now()->setTimezone($tz)->toDateString();
        $yesterday = now()->setTimezone($tz)->subDay()->toDateString();
        $rolled = AnalyticsDaily::query()->distinct()->pluck('day')->map(fn ($d) => Carbon::parse($d)->toDateString())->all();
        $days = AnalyticsHit::query()->where('day', '<', $today)->distinct()->pluck('day')->map(fn ($d) => Carbon::parse($d)->toDateString())
            ->filter(fn ($d) => ! in_array($d, $rolled, true) || $d === $yesterday)->sort()->values();
        foreach ($days as $day) {
            Rollup::day($day);
        }
        $this->info("Rolled {$days->count()} day(s).");

        return self::SUCCESS;
    }
}
