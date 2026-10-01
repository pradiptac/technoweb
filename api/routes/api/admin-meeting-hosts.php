<?php

use App\Http\Controllers\Api\V1\Admin\MeetingHostController;
use Illuminate\Support\Facades\Route;

/*
 * Meeting hosts (docs/meetings.md): each host's weekly hours, their time
 * off, and whether the connected Google account can see their free/busy.
 * `role:admin` — it decides when a colleague can be booked. Who *is* a host
 * is the `meeting_host` role, ticked on the Staff form, not anything here.
 * Required inside the admin group by routes/api.php.
 */
Route::middleware('role:admin')->group(function () {
    Route::get('meeting-hosts', [MeetingHostController::class, 'index'])->name('meeting-hosts.index');
    Route::get('meeting-hosts/{user}', [MeetingHostController::class, 'show'])
        ->whereNumber('user')->name('meeting-hosts.show');
    Route::put('meeting-hosts/{user}/hours', [MeetingHostController::class, 'updateHours'])
        ->whereNumber('user')->name('meeting-hosts.hours');
    Route::post('meeting-hosts/{user}/time-off', [MeetingHostController::class, 'storeTimeOff'])
        ->whereNumber('user')->name('meeting-hosts.time-off.store');
    Route::delete('meeting-hosts/{user}/time-off/{timeOff}', [MeetingHostController::class, 'destroyTimeOff'])
        ->whereNumber(['user', 'timeOff'])->name('meeting-hosts.time-off.destroy');
});
