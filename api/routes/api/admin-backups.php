<?php

use App\Http\Controllers\Api\V1\Admin\BackupController;
use App\Http\Controllers\Api\V1\Admin\BackupDriveController;
use App\Http\Controllers\Api\V1\Admin\BackupRestoreController;
use Illuminate\Support\Facades\Route;

/*
 * Backups and restores (2026-09-27, docs/backups.md). `role:admin`: a backup
 * is every customer, order and ticket attachment in one file, and a restore
 * replaces the lot. These paths stay open while a restore runs
 * (`EnsureNotRestoring`), so the screen can watch it.
 *
 * The literal paths are declared above `backups/{backup}`, or `{backup}`
 * binds the word "restores" and answers 404 from model binding — the
 * `media/move` trap.
 */
Route::middleware('role:admin')->group(function () {
    Route::get('backups', [BackupController::class, 'index'])->name('backups.index');
    Route::post('backups', [BackupController::class, 'store'])->middleware('throttle:6,1')->name('backups.store');

    Route::post('backups/destinations/ftp/forget-key', [BackupController::class, 'forgetKey'])->name('backups.destinations.forget-key');
    Route::post('backups/destinations/{destination}/test', [BackupController::class, 'test'])
        ->middleware('throttle:10,1')->name('backups.destinations.test');
    Route::get('backups/destinations/{destination}/folders', [BackupController::class, 'folders'])
        ->middleware('throttle:20,1')->name('backups.destinations.folders');

    Route::get('backups/drive', [BackupDriveController::class, 'status'])->name('backups.drive.status');
    Route::post('backups/drive/authorize', [BackupDriveController::class, 'authorize'])->name('backups.drive.authorize');
    Route::post('backups/drive/callback', [BackupDriveController::class, 'callback'])->name('backups.drive.callback');
    Route::post('backups/drive/disconnect', [BackupDriveController::class, 'disconnect'])->name('backups.drive.disconnect');

    Route::post('backups/restores', [BackupRestoreController::class, 'store'])->middleware('throttle:6,1')->name('backups.restores.store');
    Route::get('backups/restores/{backupRestore}', [BackupRestoreController::class, 'show'])->name('backups.restores.show');
    Route::delete('backups/restores/{backupRestore}', [BackupRestoreController::class, 'destroy'])->name('backups.restores.destroy');

    Route::get('backups/{backup}', [BackupController::class, 'show'])->name('backups.show');
    Route::delete('backups/{backup}', [BackupController::class, 'destroy'])->name('backups.destroy');
    Route::get('backups/{backup}/download/{file}', [BackupController::class, 'download'])
        ->where('file', '[a-z0-9.\-]+')->name('backups.download');
});
