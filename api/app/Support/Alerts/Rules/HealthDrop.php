<?php

namespace App\Support\Alerts\Rules;

use App\Enums\Role;
use App\Models\HealthSnapshot;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use Illuminate\Support\Collection;

final class HealthDrop implements AlertRule
{
    public function key(): string
    {
        return 'health_drop';
    }

    public function role(): Role
    {
        return Role::Admin;
    }

    public function label(): string
    {
        return 'The site health score fell';
    }

    public function thresholdLabel(): string
    {
        return 'by '.AlertSettings::threshold('alert_health_points').' points';
    }

    /** The newest snapshot against the best of the seven days before it. `system`, so it fires once until it recovers. */
    public function current(): Collection
    {
        $today = HealthSnapshot::query()->latest('date')->first();
        if ($today === null || $today->score === null) {
            return collect();
        }
        $best = HealthSnapshot::query()->where('date', '<', $today->date)->where('date', '>=', $today->date->copy()->subDays(7))
            ->whereNotNull('score')->max('score');
        $drop = $best === null ? 0 : (int) $best - (int) $today->score;

        return collect($drop >= AlertSettings::threshold('alert_health_points')
            ? [new AlertHit('system', "Site health fell from {$best} to {$today->score} this week.", '/admin/health')]
            : []);
    }
}
