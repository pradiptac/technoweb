<?php

use App\Http\Controllers\Api\V1\Admin\MyMeetingController;
use Illuminate\Support\Facades\Route;

/*
 * A host's own meetings (docs/meetings.md), scoped to `host_id` — the diary
 * of somebody who hosts calls and is neither sales nor support. An
 * administrator passes by implication and sees their own. Required inside
 * the admin group by routes/api.php.
 */
Route::middleware('role:meeting_host')->group(function () {
    Route::get('my-meetings', [MyMeetingController::class, 'index'])->name('my-meetings.index');
    Route::get('my-meetings/{meeting}', [MyMeetingController::class, 'show'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('my-meetings.show');
    Route::patch('my-meetings/{meeting}', [MyMeetingController::class, 'update'])
        ->where('meeting', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('my-meetings.update');
});
