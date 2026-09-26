<?php

use App\Http\Controllers\Api\V1\Admin\VisitController as AdminVisitController;
use Illuminate\Support\Facades\Route;

/*
 * Engineer visit requests (2026-09-26, docs/visits.md). Worked by the sales
 * desk **and** the support desk — a site survey starts a sale and scopes an
 * installation, and either may be the one who rings back. The settings
 * screen is `role:admin`, with every other settings group. Required inside
 * the admin group by routes/api.php.
 */
Route::middleware('role:sales_manager,support_engineer')->group(function () {
    Route::get('visits', [AdminVisitController::class, 'index'])->name('visits.index');
    Route::get('visits/{visit}', [AdminVisitController::class, 'show'])->name('visits.show');
    Route::patch('visits/{visit}', [AdminVisitController::class, 'update'])->name('visits.update');
    Route::post('visits/{visit}/confirm', [AdminVisitController::class, 'confirm'])->name('visits.confirm');
});
