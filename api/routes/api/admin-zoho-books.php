<?php

use App\Http\Controllers\Api\V1\Admin\ZohoBooksController;
use Illuminate\Support\Facades\Route;

/*
 * Connecting Zoho Books (0.134.0, docs/store.md "Zoho Books invoices"): the
 * consent round trip, on its own OAuth slot, back to exactly one console
 * path (`/admin/store/settings/zoho/callback`); what the settings screen's
 * pickers offer; and a test. `role:admin`, the rule every mailbox, drive and
 * calendar connection follows — the button that makes one order's invoice is
 * a store manager's and lives with the order's routes. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:admin')->group(function () {
    Route::get('settings/zoho-books', [ZohoBooksController::class, 'status'])->name('settings.zoho-books.status');
    Route::post('settings/zoho-books/authorize', [ZohoBooksController::class, 'authorize'])->name('settings.zoho-books.authorize');
    Route::post('settings/zoho-books/callback', [ZohoBooksController::class, 'callback'])->name('settings.zoho-books.callback');
    Route::post('settings/zoho-books/disconnect', [ZohoBooksController::class, 'disconnect'])->name('settings.zoho-books.disconnect');
    Route::post('settings/zoho-books/test', [ZohoBooksController::class, 'test'])
        ->middleware('throttle:6,1')->name('settings.zoho-books.test');
});
