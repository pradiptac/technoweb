<?php

use App\Http\Controllers\Api\V1\Admin\AnalyticsController;
use Illuminate\Support\Facades\Route;

/* Native analytics (C3, docs/analytics.md). Required inside the admin group by routes/api.php. */
Route::middleware('role:admin,seo_manager,content_manager')->group(function () {
    Route::get('analytics/summary', [AnalyticsController::class, 'summary'])->name('analytics.summary');
    Route::get('analytics/breakdown', [AnalyticsController::class, 'breakdown'])->name('analytics.breakdown');
    Route::get('analytics/pages', [AnalyticsController::class, 'pages'])->name('analytics.pages');
    Route::get('analytics/search', [AnalyticsController::class, 'search'])->name('analytics.search');
    Route::get('analytics/now', [AnalyticsController::class, 'now'])->middleware('throttle:60,1')->name('analytics.now');
    Route::get('analytics/export', [AnalyticsController::class, 'export'])->name('analytics.export');
});
