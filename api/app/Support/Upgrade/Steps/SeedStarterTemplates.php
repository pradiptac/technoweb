<?php

namespace App\Support\Upgrade\Steps;

use App\Support\Upgrade\UpgradeStep;
use Database\Seeders\StarterTemplateSeeder;

/**
 * The five starter page templates (0.162.0, docs/page-builder.md "The
 * library"). A fresh install gets them from `InstallSeeder`; an update runs
 * only the settings and role seeders, so an existing install receives them
 * here. The seeder is create-only by name, so running this twice — or on an
 * install that already has one — changes nothing it finds.
 */
final class SeedStarterTemplates implements UpgradeStep
{
    public function id(): string
    {
        return '2026-10-11-seed-starter-templates';
    }

    public function version(): string
    {
        return '0.162.0';
    }

    public function description(): string
    {
        return 'Add the starter page templates to the library';
    }

    public function run(): void
    {
        (new StarterTemplateSeeder)->run();
    }
}
