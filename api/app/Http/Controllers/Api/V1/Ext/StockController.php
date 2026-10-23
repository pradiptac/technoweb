<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Enums\ProductType;
use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateApiKey;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use App\Support\Store\StockLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Set shop stock levels by SKU. Each level goes through `StockLedger`, so the
 * ledger says which key moved it; a SKU that cannot be placed unambiguously is
 * refused on its own and never stops the rest.
 */
class StockController extends Controller
{
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'items' => 'required|array|between:1,100',
            'items.*.sku' => 'required|string|max:120|distinct',
            'items.*.stock' => 'required|integer|min:0|max:1000000',
        ]);
        $source = 'API key "'.AuthenticateApiKey::key($request)->name.'"';

        $updated = $refused = [];
        foreach ($data['items'] as $item) {
            $message = DB::transaction(fn () => $this->set($item['sku'], (int) $item['stock'], $source));
            if ($message === null) {
                $updated[] = $item['sku'];
            } else {
                $refused[] = ['sku' => $item['sku'], 'message' => $message];
            }
        }

        return response()->json(['updated' => $updated, 'refused' => $refused]);
    }

    /** @return string|null why the SKU was refused, or null once it is set */
    private function set(string $sku, int $stock, string $source): ?string
    {
        $variations = StoreProductVariation::where('sku', $sku)->get();
        $products = StoreProduct::where('sku', $sku)->get();
        $matches = $variations->count() + $products->count();

        if ($matches === 0) {
            return 'No product or option has that SKU.';
        }
        if ($matches > 1) {
            return 'That SKU is on more than one product.';
        }

        $variation = $variations->isEmpty() ? null : $variations->first();
        $product = $variation === null ? $products->first() : $variation->product;
        if ($product->type !== ProductType::Physical || ! $product->track_stock) {
            return 'That product does not count stock.';
        }
        $product->load('variations');
        // A variated product's own level is never read (`inStock()` answers from its options).
        if ($variation === null && $product->variations->isNotEmpty()) {
            return "That product has options; set stock on an option's SKU.";
        }

        $productBefore = (int) $product->stock;
        $variationsBefore = $product->variations->pluck('stock', 'id')->all();
        ($variation ?? $product)->update(['stock' => $stock]);
        StockLedger::adjusted($product, $productBefore, $variationsBefore, false, $source);

        return null;
    }
}
