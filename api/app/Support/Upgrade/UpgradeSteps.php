<?php

namespace App\Support\Upgrade;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The registry of one-off upgrade steps, and which of them this install has run.
 *
 * Listed by hand, in the order they must run — a class nobody names here
 * never runs, which is the same rule `routes/api.php` follows for route
 * files. The two seeders every update runs (`SettingsSeeder`, `RoleSeeder`)
 * are not steps: they are safe on every update and the updater runs them
 * always.
 */
final class UpgradeSteps
{
    /** @var list<class-string<UpgradeStep>> */
    public const STEPS = [
        Steps\RebuildStoreSpecs::class,
        Steps\DeriveMeetingPrefix::class,
        Steps\MoveAiToOpenRouter::class,
        Steps\RetireDownloadsPage::class,
    ];

    /** @return list<UpgradeStep> */
    public static function pending(): array
    {
        $done = Schema::hasTable('system_upgrade_steps')
            ? DB::table('system_upgrade_steps')->pluck('step')->all()
            : [];

        $pending = [];

        foreach (self::STEPS as $class) {
            $step = app($class);

            if (! in_array($step->id(), $done, true)) {
                $pending[] = $step;
            }
        }

        return $pending;
    }

    /** Run one step and record it. */
    public static function run(UpgradeStep $step): void
    {
        $step->run();

        DB::table('system_upgrade_steps')->updateOrInsert(
            ['step' => $step->id()],
            ['version' => $step->version(), 'ran_at' => now()],
        );
    }

    /**
     * On a fresh install there is nothing to upgrade: the wizard marks every
     * step as already run, so the first update does not replay them all.
     */
    public static function markAllDone(string $version): void
    {
        foreach (self::STEPS as $class) {
            DB::table('system_upgrade_steps')->updateOrInsert(
                ['step' => app($class)->id()],
                ['version' => $version, 'ran_at' => now()],
            );
        }
    }
}
