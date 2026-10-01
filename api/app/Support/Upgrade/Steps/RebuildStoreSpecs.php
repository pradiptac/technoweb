<?php

namespace App\Support\Upgrade\Steps;

use App\Support\Upgrade\UpgradeStep;
use Illuminate\Support\Facades\Artisan;

/**
 * The shop's specification filter index, built from what is already there.
 *
 * `store_product_specs` is derived from each product's sheet (docs/store.md)
 * and was introduced with a note to run `technoware:rebuild-store-specs` once
 * after deploying. It is the first step in the registry because it is exactly
 * the kind of instruction the registry exists to replace; the command is
 * idempotent, so a server that already ran it by hand loses nothing.
 */
final class RebuildStoreSpecs implements UpgradeStep
{
    public function id(): string
    {
        return '2026-09-26-rebuild-store-specs';
    }

    public function version(): string
    {
        return '0.96.0';
    }

    public function description(): string
    {
        return 'Rebuild the shop\'s specification filters';
    }

    public function run(): void
    {
        Artisan::call('technoware:rebuild-store-specs');
    }
}
