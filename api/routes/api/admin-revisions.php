<?php

use App\Http\Controllers\Api\V1\Admin\PresenceController;
use App\Http\Controllers\Api\V1\Admin\RecordNoteController;
use App\Http\Controllers\Api\V1\Admin\RevisionController;
use Illuminate\Support\Facades\Route;

/*
 * Page history (0.145.0, docs/page-builder.md "Page history"). Read-only: a
 * restore is the console loading a snapshot into the edit form. Behind the
 * union of the roles that own a kind of record, as the share links are; the
 * controller narrows to the owner of the record whose history is asked for.
 * Required inside the admin group by routes/api.php.
 */
Route::middleware('role:content_manager,store_manager,seo_manager')->group(function () {
    Route::get('revisions', [RevisionController::class, 'index'])->name('revisions.index');
    Route::get('revisions/{id}', [RevisionController::class, 'show'])->whereNumber('id')->middleware('throttle:60,1')->name('revisions.show');

    // Team notes (C2, docs/notifications.md): the same kinds and the same per-kind owners.
    Route::get('record-notes', [RecordNoteController::class, 'index'])->name('record-notes.index');
    Route::post('record-notes', [RecordNoteController::class, 'store'])->middleware('throttle:20,1')->name('record-notes.store');
    Route::delete('record-notes/{id}', [RecordNoteController::class, 'destroy'])->whereNumber('id')->name('record-notes.destroy');

    // Who else has the edit screen open (C2): a 20-second beat, and a goodbye on leaving.
    Route::post('presence', [PresenceController::class, 'beat'])->middleware('throttle:12,1')->name('presence.beat');
    Route::post('presence/leave', [PresenceController::class, 'leave'])->middleware('throttle:30,1')->name('presence.leave');
});
