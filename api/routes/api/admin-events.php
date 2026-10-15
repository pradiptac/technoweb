<?php

use App\Http\Controllers\Api\V1\Admin\EventRegistrationController;
use Illuminate\Support\Facades\Route;

/*
 * Event registrations (0.118.0, docs/events.md). Worked by whoever runs the
 * event **and** by the sales desk — every registration files a lead, and the
 * person following that lead up needs to see who is coming. The event's own
 * CRUD stays `role:content_manager` (admin-content-manager.php), and the
 * settings screen is `role:admin`, with every other settings group.
 * Required inside the admin group by routes/api.php.
 *
 * `export` is declared above `{registration}`, or the parameter would bind
 * the literal "export" and 404 from model binding — the `media/move` trap.
 * The nested `{registration}` is scoped to its event: one addressed through
 * another event's id is a 404.
 */
Route::middleware('role:content_manager,sales_manager')->group(function () {
    Route::get('events/{event:id}/registrations', [EventRegistrationController::class, 'index'])->name('events.registrations.index');
    Route::get('events/{event:id}/registrations/export', [EventRegistrationController::class, 'export'])->name('events.registrations.export');
    Route::post('events/{event:id}/registrations', [EventRegistrationController::class, 'store'])->name('events.registrations.store');
    Route::patch('events/{event:id}/registrations/{registration}', [EventRegistrationController::class, 'update'])->name('events.registrations.update');
    Route::delete('events/{event:id}/registrations/{registration}', [EventRegistrationController::class, 'destroy'])->name('events.registrations.destroy');
});
