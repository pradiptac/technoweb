<?php

use App\Http\Controllers\Api\V1\Admin\MeetingController as AdminMeetingController;
use Illuminate\Support\Facades\Route;

/*
 * Online meetings (2026-09-29, docs/meetings.md): the queue, the diary and
 * a booking made on somebody's behalf. Worked by the sales desk **and** the
 * support desk — a demo starts a sale, a call sorts out a problem, and
 * either may be the one who books it. Required inside the admin group by
 * routes/api.php.
 *
 * `{meeting}` binds by reference (`Meeting::getRouteKeyName()`) and is held
 * to the reference's shape, so `meetings/slots` — and `meetings/google`,
 * in admin-meeting-google.php — can never bind as one. `slots` is declared
 * above it all the same.
 */
Route::middleware('role:sales_manager,support_engineer')->group(function () {
    Route::get('meetings', [AdminMeetingController::class, 'index'])->name('meetings.index');
    Route::get('meetings/slots', [AdminMeetingController::class, 'slots'])->name('meetings.slots');
    Route::post('meetings', [AdminMeetingController::class, 'store'])->name('meetings.store');
    Route::get('meetings/{meeting}', [AdminMeetingController::class, 'show'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('meetings.show');
    Route::patch('meetings/{meeting}', [AdminMeetingController::class, 'update'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('meetings.update');
    Route::post('meetings/{meeting}/move', [AdminMeetingController::class, 'move'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('meetings.move');
    Route::post('meetings/{meeting}/cancel', [AdminMeetingController::class, 'cancel'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('meetings.cancel');
    Route::post('meetings/{meeting}/resync', [AdminMeetingController::class, 'resync'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('meetings.resync');
});
