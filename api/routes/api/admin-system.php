<?php

use App\Http\Controllers\Api\V1\Admin\SystemController;
use App\Http\Controllers\Api\V1\Admin\UpdateController;
use Illuminate\Support\Facades\Route;

/*
 * System → Status and Updates (docs/distribution.md). `role:admin`: an update
 * replaces the whole application, and the status screen names the server's
 * PHP setup and disk. Required inside the admin group by routes/api.php.
 *
 * These paths stay open while an update runs (`EnsureNotRestoring`), so the
 * screen can drive and watch it. The literal `updates/*` paths are declared
 * above `updates/packages/{file}`.
 */
Route::middleware('role:admin')->group(function () {
    Route::get('system/status', [SystemController::class, 'status'])->name('system.status');

    Route::get('system/updates', [UpdateController::class, 'index'])->name('system.updates.index');
    Route::post('system/updates/upload', [UpdateController::class, 'upload'])
        ->middleware('throttle:600,1')->name('system.updates.upload');
    Route::post('system/updates/apply', [UpdateController::class, 'apply'])
        ->middleware('throttle:6,1')->name('system.updates.apply');
    Route::post('system/updates/step', [UpdateController::class, 'step'])
        ->middleware('throttle:120,1')->name('system.updates.step');
    Route::post('system/updates/retry', [UpdateController::class, 'retry'])->name('system.updates.retry');
    Route::post('system/updates/rollback', [UpdateController::class, 'rollback'])
        ->middleware('throttle:6,1')->name('system.updates.rollback');
    Route::post('system/updates/abandon', [UpdateController::class, 'abandon'])->name('system.updates.abandon');
    Route::delete('system/updates/packages/{file}', [UpdateController::class, 'destroy'])
        ->where('file', '[A-Za-z0-9._-]+\.zip')->name('system.updates.destroy');
});
