<?php

namespace App\Support\Alerts\Rules;

use App\Enums\LeadStatus;
use App\Enums\Role;
use App\Models\Lead;
use App\Support\Alerts\AlertHit;
use App\Support\Alerts\AlertRule;
use App\Support\Alerts\AlertSettings;
use App\Support\Alerts\Rules;
use Illuminate\Support\Collection;

final class LeadHotUntouched implements AlertRule
{
    public function key(): string
    {
        return 'lead_hot_untouched';
    }

    public function role(): Role
    {
        return Role::SalesManager;
    }

    public function label(): string
    {
        return 'A hot lead nobody has answered';
    }

    public function thresholdLabel(): string
    {
        return 'after '.AlertSettings::threshold('alert_lead_hot_hours').' hours';
    }

    /** By number only: a lead's name and address are a prospect's, and an email or a push is not where they go. */
    public function current(): Collection
    {
        return Lead::query()->where('score_band', 'hot')->where('status', LeadStatus::New)
            ->where('created_at', '<=', now()->subHours(AlertSettings::threshold('alert_lead_hot_hours')))
            ->oldest()->limit(Rules::CAP)->get(['id', 'created_at'])
            ->map(fn (Lead $l) => new AlertHit(
                'lead:'.$l->id,
                "Hot lead #{$l->id} has had no reply for ".(int) $l->created_at->diffInHours(now(), true).' hours.',
                '/admin/leads/'.$l->id,
            ))->values();
    }
}
