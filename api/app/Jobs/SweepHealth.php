<?php

namespace App\Jobs;

use App\Models\HealthLink;
use App\Models\HealthSnapshot;
use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use App\Support\Health\Score;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * The nightly re-check of every record (docs/health.md "Nightly sweep").
 * Sliced like the mailbox scan: a slice works for `$budgetSeconds` and
 * dispatches the next with its cursor, so no job outlives the scheduler's
 * `--max-time=50` drain. The last slice writes the day's snapshot and prunes.
 */
class SweepHealth implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 80;

    /** Mutable for the slicing test only. */
    public static int $budgetSeconds = 40;

    public function __construct(public readonly int $kindIndex = 0, public readonly int $afterId = 0) {}

    public function handle(): void
    {
        $started = microtime(true);
        $aliases = Kinds::aliases();

        for ($k = $this->kindIndex; $k < count($aliases); $k++) {
            $class = Kinds::classFor($aliases[$k]);
            $after = $k === $this->kindIndex ? $this->afterId : 0;

            foreach ($class::query()->where('id', '>', $after)->orderBy('id')->lazyById(100) as $model) {
                try {
                    Findings::replace($model, Checker::run($model));
                } catch (Throwable $e) {
                    Log::warning('Site health: a record could not be checked', ['type' => $aliases[$k], 'id' => $model->getKey(), 'error' => $e->getMessage()]);
                }

                if (microtime(true) - $started >= self::$budgetSeconds) {
                    self::dispatch($k, (int) $model->getKey());

                    return;
                }
            }
        }

        Score::snapshot();
        HealthSnapshot::query()->where('date', '<', now()->subDays(400)->toDateString())->delete();
        HealthLink::query()->whereDoesntHave('refs')->where('created_at', '<', now()->subDay())->delete();
        Cache::forever(Score::LAST_SWEEP_KEY, now()->toIso8601String());
    }
}
