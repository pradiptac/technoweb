<?php

namespace App\Console\Commands;

use App\Models\AnalyticsDaily;
use App\Models\AnalyticsHit;
use Illuminate\Console\Command;

/** Raw hits older than 90 days, only once their day is rolled: the totals stay, the rows go. */
class PruneAnalyticsHits extends Command
{
    protected $signature = 'technoware:prune-analytics-hits';

    protected $description = 'Delete raw native-analytics hits older than 90 days that have been rolled up';

    public function handle(): int
    {
        $cutoff = now()->setTimezone((string) config('app.timezone'))->subDays(90)->toDateString();
        AnalyticsHit::query()->where('day', '<', $cutoff)
            ->whereIn('day', AnalyticsDaily::query()->select('day'))->delete();

        return self::SUCCESS;
    }
}
