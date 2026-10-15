<?php

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
});
