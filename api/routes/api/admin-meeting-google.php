<?php

use App\Http\Controllers\Api\V1\Admin\MeetingsGoogleController;
use Illuminate\Support\Facades\Route;

/*
 * The Google Workspace calendar every meeting is organised on
 * (docs/meetings.md): the consent round trip, on its own OAuth slot, back to
 * exactly one console path (`/admin/meetings/google/callback`). `role:admin`,
 * the rule every mailbox and drive connection follows. `meetings/google`
 * cannot be taken for a meeting: `{meeting}` is held to the reference's
 * shape. Required inside the admin group by routes/api.php.
 */
Route::middleware('role:admin')->group(function () {
    Route::get('meetings/google', [MeetingsGoogleController::class, 'status'])->name('meetings.google.status');
    Route::post('meetings/google/authorize', [MeetingsGoogleController::class, 'authorize'])->name('meetings.google.authorize');
    Route::post('meetings/google/callback', [MeetingsGoogleController::class, 'callback'])->name('meetings.google.callback');
    Route::post('meetings/google/disconnect', [MeetingsGoogleController::class, 'disconnect'])->name('meetings.google.disconnect');
    Route::post('meetings/google/test', [MeetingsGoogleController::class, 'test'])
        ->middleware('throttle:6,1')->name('meetings.google.test');
});
