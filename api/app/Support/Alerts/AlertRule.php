<?php

namespace App\Support\Alerts;

use App\Enums\Role;
use Illuminate\Support\Collection;

/**
 * One fixed alert (docs/digest-alerts.md). `current()` names what is in
 * trouble right now; the check decides who is told and whether they were
 * already told. Each rule reads the scope the screen it links to uses.
 */
interface AlertRule
{
    public function key(): string;

    public function role(): Role;

    /** What the switch on the profile says, e.g. "A critical ticket nobody has taken". */
    public function label(): string;

    /** The threshold in words, e.g. "after 30 minutes", or null for a rule without one. */
    public function thresholdLabel(): ?string;

    /** @return Collection<int, AlertHit> */
    public function current(): Collection;
}
