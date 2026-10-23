<?php

namespace App\Http\Controllers\Api\V1\Ext;

use App\Http\Controllers\Controller;
use App\Models\StoreProduct;
use App\Models\StoreProductVariation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The shop's stock and prices, for an inventory system to read. */
class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return ExtList::page($request, StoreProduct::query()->with('variations'), fn (StoreProduct $p) => [
            'id' => $p->id,
            'sku' => $p->sku,
            'name' => $p->name,
            'slug' => $p->slug,
            'status' => $p->status->value,
            // As stored (GST-inclusive), never the figure the website shows.
            'price_paise' => $p->price_paise,
            'compare_at_paise' => $p->compare_at_paise,
            'track_stock' => (bool) $p->track_stock,
            'stock' => $p->stockOnHand(),
            'in_stock' => $p->inStock(),
            'variations' => $p->variations->map(fn (StoreProductVariation $v) => [
                'id' => $v->id, 'sku' => $v->sku, 'name' => $v->name,
                'price_paise' => $v->price_paise, 'stock' => $v->stock,
            ])->values(),
            'updated_at' => $p->updated_at?->toIso8601String(),
        ]);
    }
}
