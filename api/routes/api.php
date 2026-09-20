<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1
|--------------------------------------------------------------------------
| Everything is versioned under /api/v1 so a future breaking change can ship
| as /api/v2 without stranding the deployed frontend.
|
| Three tiers:
|   public   — cacheable reads for the marketing site, no auth
|   portal   — customer, auth:sanctum, always scoped to the signed-in customer
|   admin    — staff, auth:sanctum + role middleware
*/

Route::prefix('v1')->name('api.v1.')->group(function () {
    require __DIR__.'/api/public.php';

    Route::middleware('auth:sanctum')->group(function () {
        require __DIR__.'/api/portal.php';

        /*
         * `staff` refuses a customer token at the boundary, so nothing below
         * has to; `activity` records writes by rule — every DELETE, every
         * store, anything under staff, customers, settings or auth — from one
         * place (App\Support\ActivityLogger) rather than at each of the write
         * routes, where a per-route call is a per-route omission.
         */
        Route::prefix('admin')->middleware(['staff', 'activity'])->name('admin.')->group(function () {
            require __DIR__.'/api/admin-auth.php';
            require __DIR__.'/api/admin-support-engineer.php';
            require __DIR__.'/api/admin-admin.php';
            require __DIR__.'/api/admin-sales-manager.php';
            require __DIR__.'/api/admin-store-manager.php';
            require __DIR__.'/api/admin-campaign-manager.php';
            require __DIR__.'/api/admin-seo-manager.php';
            require __DIR__.'/api/admin-content-manager.php';
        });
    });
});
