<?php

namespace App\Console\Commands;

use App\Models\StoreProduct;
use App\Support\Store\SpecIndex;
use Illuminate\Console\Command;

/**
 * Rebuild `store_product_specs` for every store product.
 *
 * The index is written by the models' `saved` hooks, so a product saved since
 * the migration is already in it; this is for the rows that were there before
 * it (run once after deploying 2026-09-26) and for putting it right after a
 * write that went around the models. Idempotent: each product's rows are
 * deleted and written again from what it says now.
 */
class RebuildStoreSpecs extends Command
{
    protected $signature = 'technoware:rebuild-store-specs';

    protected $description = 'Rebuild the specification-filter index from every store product';

    public function handle(): int
    {
        $count = 0;

        StoreProduct::query()->select('id')->orderBy('id')->chunkById(200, function ($products) use (&$count) {
            foreach ($products as $product) {
                SpecIndex::rebuild((int) $product->id);
                $count++;
            }
        });

        SpecIndex::touch();

        $this->info("Rebuilt the specification index for {$count} product(s).");

        return self::SUCCESS;
    }
}
