<?php

use App\Http\Controllers\Api\V1\Admin\HealthController;
use Illuminate\Support\Facades\Route;

/*
 * The site health centre (0.181.0, docs/health.md). Behind the union of the
 * roles that own a checked kind, as page history is; the controller narrows
 * every finding to the kinds the caller owns. Required inside the admin group
 * by routes/api.php.
 */
Route::middleware('role:content_manager,store_manager,seo_manager')->group(function () {
    Route::get('health', [HealthController::class, 'index'])->name('health.index');
    Route::post('health/recheck', [HealthController::class, 'recheck'])->middleware('throttle:30,1')->name('health.recheck');
    Route::post('health/bulk', [HealthController::class, 'bulk'])->middleware('throttle:30,1')->name('health.bulk');
    Route::post('health/{finding}/ignore', [HealthController::class, 'ignore'])->whereNumber('finding')->name('health.ignore');
    Route::post('health/{finding}/restore', [HealthController::class, 'restore'])->whereNumber('finding')->name('health.restore');
});
