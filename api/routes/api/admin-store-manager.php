<?php

use App\Http\Controllers\Api\V1\Admin\Store\CategoryController as AdminStoreCategoryController;
use App\Http\Controllers\Api\V1\Admin\Store\CodeController as AdminStoreCodeController;
use App\Http\Controllers\Api\V1\Admin\Store\CouponController as AdminStoreCouponController;
use App\Http\Controllers\Api\V1\Admin\Store\DashboardController as AdminStoreDashboardController;
use App\Http\Controllers\Api\V1\Admin\Store\OrderController as AdminStoreOrderController;
use App\Http\Controllers\Api\V1\Admin\Store\ProductController as AdminStoreProductController;
use App\Http\Controllers\Api\V1\Admin\Store\ReportController as AdminStoreReportController;
use App\Http\Controllers\Api\V1\Admin\Store\StockController as AdminStoreStockController;
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

    Route::get('store/categories', [AdminStoreCategoryController::class, 'index'])->name('store.categories.index');
    Route::post('store/categories', [AdminStoreCategoryController::class, 'store'])->name('store.categories.store');
    Route::get('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'show'])->name('store.categories.show');
    Route::patch('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'update'])->name('store.categories.update');
    Route::delete('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'destroy'])->name('store.categories.destroy');

    Route::get('store/products', [AdminStoreProductController::class, 'index'])->name('store.products.index');
    Route::post('store/products', [AdminStoreProductController::class, 'store'])->name('store.products.store');
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
    Route::post('store/orders/{order}/fulfil', [AdminStoreOrderController::class, 'fulfil'])->name('store.orders.fulfil');
});
