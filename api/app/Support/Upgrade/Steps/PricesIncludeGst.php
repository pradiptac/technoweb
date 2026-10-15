<?php

namespace App\Support\Upgrade\Steps;

use App\Models\Setting;
use App\Support\Store\Tax;
use App\Support\Upgrade\UpgradeStep;
use Illuminate\Support\Facades\DB;

/**
 * Stored prices include GST (0.178.0, docs/store.md "Tax").
 *
 * In 0.176.0 `store_price_basis` decided what a stored price meant, and on a
 * shop set to `exclusive` every price had been typed before GST. Since this
 * release a stored price always includes GST and that setting only decides
 * how the website shows it, so such a shop's prices are converted once, at
 * each product's own rate — the customer pays exactly what they paid the
 * day before — and `store_price_entry` is set to `exclusive`, so the console
 * still takes prices the way that shop has been typing them.
 *
 * A shop on `inclusive` (the default, and every shop before 0.176.0) is
 * untouched: its prices already mean the right thing. Written through the
 * query builder, so no price-drop or spec-index event fires for a change
 * that moves nobody's money.
 */
final class PricesIncludeGst implements UpgradeStep
{
    public function id(): string
    {
        return '2026-10-14-prices-include-gst';
    }

    public function version(): string
    {
        return '0.178.0';
    }

    public function description(): string
    {
        return 'Store every shop price with GST in it';
    }

    public function run(): void
    {
        if (Setting::get('store_price_basis') !== Tax::BASIS_EXCLUSIVE) {
            return;
        }

        DB::transaction(function () {
            $rates = [];

            foreach (DB::table('store_products')->get(['id', 'gst_percent', 'price_paise', 'compare_at_paise']) as $p) {
                $rate = $rates[$p->id] = Tax::rateForPercent($p->gst_percent);

                DB::table('store_products')->where('id', $p->id)->update([
                    'price_paise' => $p->price_paise === null ? null : Tax::addTo((int) $p->price_paise, $rate),
                    'compare_at_paise' => $p->compare_at_paise === null ? null : Tax::addTo((int) $p->compare_at_paise, $rate),
                ]);
            }

            foreach (DB::table('store_product_variations')->whereNotNull('price_paise')->get(['id', 'store_product_id', 'price_paise']) as $v) {
                DB::table('store_product_variations')->where('id', $v->id)->update([
                    'price_paise' => Tax::addTo((int) $v->price_paise, $rates[$v->store_product_id] ?? Tax::rate()),
                ]);
            }

            // The price a wishlist line was saved at, so a later price drop is
            // measured against a figure of the same kind.
            if (DB::getSchemaBuilder()->hasTable('wishlist_items')) {
                foreach (DB::table('wishlist_items')->get(['id', 'store_product_id', 'price_at_save']) as $w) {
                    DB::table('wishlist_items')->where('id', $w->id)->update([
                        'price_at_save' => Tax::addTo((int) $w->price_at_save, $rates[$w->store_product_id] ?? Tax::rate()),
                    ]);
                }
            }

            Setting::updateOrCreate(
                ['key' => 'store_price_entry'],
                ['group' => 'invoicing', 'value' => Tax::BASIS_EXCLUSIVE, 'type' => 'string'],
            );
        });
    }
}
