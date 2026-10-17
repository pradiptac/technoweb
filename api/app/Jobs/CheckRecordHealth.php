<?php

namespace App\Jobs;

use App\Support\Health\Checker;
use App\Support\Health\Findings;
use App\Support\Health\Kinds;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** Re-runs one record's health checks (docs/health.md "On save"). A record gone since is a quiet no-op. */
class CheckRecordHealth implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public function __construct(public readonly string $alias, public readonly int $id) {}

    public function handle(): void
    {
        $class = Kinds::classFor($this->alias);
        $model = $class ? $class::find($this->id) : null;

        if ($model === null) {
            return;
        }

        Findings::replace($model, Checker::run($model));
    }
}
