<?php

namespace App\Support\Upgrade\Steps;

use App\Jobs\SweepHealth;
use App\Support\Upgrade\UpgradeStep;

/**
 * The Site health centre (0.181.0, docs/health.md) fills from a nightly
 * sweep; without this an updated site would show "not checked yet" until
 * 02:50. A fresh install runs no steps (the wizard marks them done) and
 * waits for the 02:50 sweep instead — it has nothing to find yet.
 */
final class FirstHealthSweep implements UpgradeStep
{
    public function id(): string
    {
        return '2026-10-17-first-health-sweep';
    }

    public function version(): string
    {
        return '0.181.0';
    }

    public function description(): string
    {
        return 'Check every page for the Site health centre';
    }

    public function run(): void
    {
        SweepHealth::dispatch();
    }
}
