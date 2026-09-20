<?php

use App\Http\Controllers\Api\V1\Admin\LeadController;
use Illuminate\Support\Facades\Route;

/*
 * The lead pipeline. Everything here is behind `role:sales_manager`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:sales_manager')->group(function () {
    Route::get('leads/export', [LeadController::class, 'export'])->name('leads.export');

    Route::get('leads', [LeadController::class, 'index'])->name('leads.index');
    Route::get('leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
    Route::patch('leads/{lead}', [LeadController::class, 'update'])->name('leads.update');
    Route::post('leads/{lead}/notes', [LeadController::class, 'note'])->name('leads.notes.store');
    Route::delete('leads/{lead}', [LeadController::class, 'destroy'])->name('leads.destroy');
});
