<?php

use App\Http\Controllers\Api\V1\Admin\Store\CategoryController as AdminStoreCategoryController;
use App\Http\Controllers\Api\V1\Admin\Store\CodeController as AdminStoreCodeController;
use App\Http\Controllers\Api\V1\Admin\Store\CouponController as AdminStoreCouponController;
use App\Http\Controllers\Api\V1\Admin\Store\DashboardController as AdminStoreDashboardController;
use App\Http\Controllers\Api\V1\Admin\Store\OrderController as AdminStoreOrderController;
use App\Http\Controllers\Api\V1\Admin\Store\ProductController as AdminStoreProductController;
use App\Http\Controllers\Api\V1\Admin\Store\ProductImportController as AdminStoreProductImportController;
use App\Http\Controllers\Api\V1\Admin\Store\PromoController as AdminStorePromoController;
use App\Http\Controllers\Api\V1\Admin\Store\ReportController as AdminStoreReportController;
use App\Http\Controllers\Api\V1\Admin\Store\ReturnController as AdminStoreReturnController;
use App\Http\Controllers\Api\V1\Admin\Store\ReviewController as AdminStoreReviewController;
use App\Http\Controllers\Api\V1\Admin\Store\ShippingController as AdminStoreShippingController;
use App\Http\Controllers\Api\V1\Admin\Store\StockController as AdminStoreStockController;
use App\Http\Controllers\Api\V1\Admin\Store\TagController as AdminStoreTagController;
use App\Http\Controllers\Api\V1\Admin\Store\VideoSettingsController as AdminStoreVideoSettingsController;
use App\Http\Controllers\Api\V1\Admin\ZohoBooksController;
use Illuminate\Support\Facades\Route;

/*
 * The shop: products, orders, coupons, codes, reports and the stock ledger. Everything here is behind `role:store_manager`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:store_manager')->group(function () {
    // Everything the shop is doing, in one request. Declared above
    // the parameterised store routes for the same reason
    // `media/move` is: Laravel matches in declaration order.
    Route::get('store/dashboard', AdminStoreDashboardController::class)->name('store.dashboard');

    // The shop front's promo band: the eight `store_promo_*` settings rows,
    // and no other key — see PromoController. Above `store/{anything}` too.
    Route::get('store/promo', [AdminStorePromoController::class, 'index'])->name('store.promo');
    Route::patch('store/promo', [AdminStorePromoController::class, 'update'])->name('store.promo.update');

    // "Shop the videos": the eleven `store_videos_*` rows and no other key
    // (0.140.0) — see VideoSettingsController. Above `store/{anything}` too.
    Route::get('store/videos', [AdminStoreVideoSettingsController::class, 'index'])->name('store.videos');
    Route::patch('store/videos', [AdminStoreVideoSettingsController::class, 'update'])->name('store.videos.update');
    /*
     * Shop tags (0.141.0): the Tags screen and the form's Suggest button.
     * The literal segments — `reorder`, `settings`, `auto`, and `products/
     * tag-suggest` — come above the parameterised routes, or `{storeTag}`
     * binds the word and answers 404 from model binding.
     */
    Route::get('store/tags', [AdminStoreTagController::class, 'index'])->name('store.tags.index');
    Route::post('store/tags', [AdminStoreTagController::class, 'store'])->name('store.tags.store');
    Route::patch('store/tags/reorder', [AdminStoreTagController::class, 'reorder'])->name('store.tags.reorder');
    Route::patch('store/tags/settings', [AdminStoreTagController::class, 'settings'])->name('store.tags.settings');
    Route::post('store/tags/auto', [AdminStoreTagController::class, 'auto'])->middleware('throttle:6,1')->name('store.tags.auto');
    Route::post('store/products/tag-suggest', [AdminStoreTagController::class, 'suggest'])->middleware('throttle:10,1')->name('store.products.tag-suggest');
    Route::patch('store/tags/{storeTag:id}', [AdminStoreTagController::class, 'update'])->name('store.tags.update');
    Route::post('store/tags/{storeTag:id}/merge', [AdminStoreTagController::class, 'merge'])->name('store.tags.merge');
    Route::delete('store/tags/{storeTag:id}', [AdminStoreTagController::class, 'destroy'])->name('store.tags.destroy');
    /*
     * Delivery charges (0.142.0): the mode, the flat charge, the default
     * weight, and the zones with their weight slabs. `store/shipping/settings`
     * and the zone routes are declared as a set above `store/{anything}`.
     */
    Route::get('store/shipping', [AdminStoreShippingController::class, 'index'])->name('store.shipping');
    Route::put('store/shipping/settings', [AdminStoreShippingController::class, 'updateSettings'])->name('store.shipping.settings');
    Route::post('store/shipping/zones', [AdminStoreShippingController::class, 'store'])->name('store.shipping.zones.store');
    Route::patch('store/shipping/zones/{zone}', [AdminStoreShippingController::class, 'update'])->name('store.shipping.zones.update');
    Route::delete('store/shipping/zones/{zone}', [AdminStoreShippingController::class, 'destroy'])->name('store.shipping.zones.destroy');
    Route::post('store/shipping/zones/{zone}/move', [AdminStoreShippingController::class, 'move'])->name('store.shipping.zones.move');

    // Above `store/{anything}` for the same reason `media/move` is:
    // Laravel matches in declaration order.
    Route::get('store/reports', [AdminStoreReportController::class, 'index'])->name('store.reports');
    Route::get('store/reports/export', [AdminStoreReportController::class, 'export'])->name('store.reports.export');

    /*
     * Stock in and out. `export` and `movements` are declared
     * above nothing parameterised here, but the order still
     * matters for the same reason `media/move` does: Laravel
     * matches in declaration order, and a later `store/stock/{id}`
     * would bind `{id}` to the literal "export".
     */
    Route::get('store/stock', [AdminStoreStockController::class, 'index'])->name('store.stock');
    Route::get('store/stock/export', [AdminStoreStockController::class, 'export'])->name('store.stock.export');
    Route::get('store/stock/movements', [AdminStoreStockController::class, 'movements'])->name('store.stock.movements');

    /*
     * Product reviews: the queue, one door for one decision or fifty, the
     * featured switch and a delete. `moderate` is declared above
     * `store/reviews/{review}` — Laravel matches in declaration order.
     */
    Route::get('store/reviews', [AdminStoreReviewController::class, 'index'])->name('store.reviews.index');
    Route::post('store/reviews/moderate', [AdminStoreReviewController::class, 'moderate'])->name('store.reviews.moderate');
    Route::patch('store/reviews/{review}', [AdminStoreReviewController::class, 'update'])->name('store.reviews.update');
    Route::delete('store/reviews/{review}', [AdminStoreReviewController::class, 'destroy'])->name('store.reviews.destroy');

    Route::get('store/categories', [AdminStoreCategoryController::class, 'index'])->name('store.categories.index');
    Route::post('store/categories', [AdminStoreCategoryController::class, 'store'])->name('store.categories.store');
    Route::post('store/categories/bulk', [AdminStoreCategoryController::class, 'bulk'])->middleware('throttle:30,1')->name('store.categories.bulk');
    Route::get('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'show'])->name('store.categories.show');
    Route::patch('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'update'])->name('store.categories.update');
    Route::delete('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'destroy'])->name('store.categories.destroy');

    Route::get('store/products', [AdminStoreProductController::class, 'index'])->name('store.products.index');
    Route::post('store/products', [AdminStoreProductController::class, 'store'])->name('store.products.store');
    Route::post('store/products/bulk', [AdminStoreProductController::class, 'bulk'])->middleware('throttle:30,1')->name('store.products.bulk');

    /*
     * The catalogue as a spreadsheet, both ways. Declared above
     * `store/products/{storeProduct:id}` — Laravel matches in declaration
     * order, so underneath it "export" and "import" would bind `{id}` and
     * answer 404 from model binding, the `media/move` trap.
     */
    Route::get('store/products/export', [AdminStoreProductImportController::class, 'export'])->name('store.products.export');
    Route::post('store/products/import/analyse', [AdminStoreProductImportController::class, 'analyse'])->name('store.products.import.analyse');
    Route::post('store/products/import', [AdminStoreProductImportController::class, 'store'])->name('store.products.import');

    Route::get('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'show'])->name('store.products.show');
    Route::patch('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'update'])->name('store.products.update');
    Route::delete('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'destroy'])->name('store.products.destroy');

    /*
     * The activation-code inventory, per product.
     *
     * Nested under the product because that is the only thing a
     * code belongs to before it is sold, and it is how somebody
     * asks the question — "how many licences of this are left".
     */
    Route::get('store/products/{storeProduct:id}/codes', [AdminStoreCodeController::class, 'index'])->name('store.codes.index');
    Route::post('store/products/{storeProduct:id}/codes', [AdminStoreCodeController::class, 'store'])->name('store.codes.store');
    Route::post('store/codes/{code:id}/reveal', [AdminStoreCodeController::class, 'reveal'])
        ->middleware('throttle:30,1')->name('store.codes.reveal');
    Route::delete('store/codes/{code:id}', [AdminStoreCodeController::class, 'destroy'])->name('store.codes.destroy');

    /*
     * Orders, bound by **order number** rather than id.
     *
     * The rule every CMS entity follows — bind by id, because the
     * edit form changes the slug it is addressed by — does not
     * apply: nothing about an order can change its number, and the
     * number is what a customer reads out on the telephone.
     */
    /*
     * Discount codes. Deleting one that has been used is refused
     * by the controller — the usage rows explain why an order's
     * total is what it is, and that is not tidying-up to lose.
     */
    Route::get('store/coupons', [AdminStoreCouponController::class, 'index'])->name('store.coupons.index');
    Route::post('store/coupons', [AdminStoreCouponController::class, 'store'])->name('store.coupons.store');
    Route::get('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'show'])->name('store.coupons.show');
    Route::patch('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'update'])->name('store.coupons.update');
    Route::delete('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'destroy'])->name('store.coupons.destroy');

    Route::get('store/orders', [AdminStoreOrderController::class, 'index'])->name('store.orders.index');
    Route::get('store/orders/{order}', [AdminStoreOrderController::class, 'show'])->name('store.orders.show');
    Route::post('store/orders/{order}/status', [AdminStoreOrderController::class, 'status'])->name('store.orders.status');
    Route::patch('store/orders/{order}/shipping', [AdminStoreOrderController::class, 'shipping'])->name('store.orders.shipping');
    Route::post('store/orders/{order}/invoice', [AdminStoreOrderController::class, 'invoice'])->name('store.orders.invoice');
    Route::get('store/orders/{order}/invoice', [AdminStoreOrderController::class, 'downloadInvoice'])->name('store.orders.invoice.download');
    Route::post('store/orders/{order}/notes', [AdminStoreOrderController::class, 'note'])->name('store.orders.notes');
    /*
     * The one route in the console that can make an order paid, and
     * only for a method with no gateway behind it. It demands a
     * reference and records who confirmed it; the status route still
     * refuses to reach `paid` from a dropdown.
     */
    Route::post('store/orders/{order}/payments', [AdminStoreOrderController::class, 'recordPayment'])->name('store.orders.payments');
    Route::post('store/orders/{order}/refunds', [AdminStoreOrderController::class, 'recordRefund'])->name('store.orders.refunds');
    // Make — or try again to make — this order's invoice in Zoho Books
    // (0.134.0, docs/store.md "Zoho Books invoices"). A store manager's
    // press; connecting the account is the administrator's.
    Route::post('store/orders/{order}/zoho-invoice', [ZohoBooksController::class, 'createForOrder'])
        ->middleware('throttle:20,1')->name('store.orders.zoho-invoice');
    // Send — or try again to send — one payment or refund on the order to
    // Zoho Books (0.136.0). The payment is addressed through its order.
    Route::post('store/orders/{order}/payments/{payment}/zoho', [ZohoBooksController::class, 'sendPayment'])
        ->whereNumber('payment')->middleware('throttle:20,1')->name('store.orders.payments.zoho');
    Route::post('store/orders/{order}/fulfil', [AdminStoreOrderController::class, 'fulfil'])->name('store.orders.fulfil');

    /*
     * The returns desk (0.132.0, docs/store.md "Returns"), bound by
     * reference like an order by its number. No `store` — a return exists
     * because a customer asked for one — and no `destroy`. Each move is its
     * own route because each does something besides write the status:
     * mails the customer, puts stock back, records a refund.
     */
    Route::get('store/returns', [AdminStoreReturnController::class, 'index'])->name('store.returns.index');
    Route::get('store/returns/{order_return}', [AdminStoreReturnController::class, 'show'])->name('store.returns.show');
    Route::patch('store/returns/{order_return}', [AdminStoreReturnController::class, 'update'])->name('store.returns.update');
    Route::post('store/returns/{order_return}/approve', [AdminStoreReturnController::class, 'approve'])->name('store.returns.approve');
    Route::post('store/returns/{order_return}/reject', [AdminStoreReturnController::class, 'reject'])->name('store.returns.reject');
    Route::post('store/returns/{order_return}/receive', [AdminStoreReturnController::class, 'receive'])->name('store.returns.receive');
    Route::post('store/returns/{order_return}/refund', [AdminStoreReturnController::class, 'refund'])->name('store.returns.refund');
    Route::post('store/returns/{order_return}/close', [AdminStoreReturnController::class, 'close'])->name('store.returns.close');
    Route::get('store/returns/{order_return}/photos/{photo}', [AdminStoreReturnController::class, 'photo'])
        ->where('photo', '[0-9]+')->name('store.returns.photo');
});
