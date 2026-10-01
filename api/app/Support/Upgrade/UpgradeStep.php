<?php

namespace App\Support\Upgrade;

/**
 * Something one release needs done once on every install it reaches.
 *
 * Before the updater existed these were lines in the README — "after
 * deploying, run `db:seed --class=SettingsSeeder`", "run
 * `technoware:rebuild-store-specs` once" — which is an instruction every
 * customer's installer has to read and nobody's does. A step is a class in
 * `Steps/`, listed in `UpgradeSteps::STEPS`, run by the updater after the
 * migrations and recorded in `system_upgrade_steps` so it never runs twice.
 *
 * **It must be safe to run twice anyway**: a step that fails part-way is
 * retried from the start, and an install restored from an older backup may
 * run it again.
 */
interface UpgradeStep
{
    /** A stable id, recorded once the step has run. Never change it. */
    public function id(): string;

    /** The release that introduced it. */
    public function version(): string;

    /** One line for the update's log: what it does, in plain words. */
    public function description(): string;

    public function run(): void;
}
