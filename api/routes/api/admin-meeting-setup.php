<?php

use App\Http\Controllers\Api\V1\Admin\MeetingTypeController;
use Illuminate\Support\Facades\Route;

/*
 * Meeting types (docs/meetings.md): what a customer can book, how long it
 * is, its buffers and the hosts allowed for it. The sales manager's call —
 * an administrator passes by implication. The hosts' hours and time off are
 * `role:admin` and live in admin-meeting-hosts.php, because a role file
 * stays inside its one role group. Required inside the admin group by
 * routes/api.php.
 */
Route::middleware('role:sales_manager')->group(function () {
    Route::get('meeting-types', [MeetingTypeController::class, 'index'])->name('meeting-types.index');
    Route::post('meeting-types', [MeetingTypeController::class, 'store'])->name('meeting-types.store');
    Route::get('meeting-types/{meetingType}', [MeetingTypeController::class, 'show'])
        ->whereNumber('meetingType')->name('meeting-types.show');
    Route::patch('meeting-types/{meetingType}', [MeetingTypeController::class, 'update'])
        ->whereNumber('meetingType')->name('meeting-types.update');
    Route::delete('meeting-types/{meetingType}', [MeetingTypeController::class, 'destroy'])
        ->whereNumber('meetingType')->name('meeting-types.destroy');
});
