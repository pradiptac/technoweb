<?php

use App\Http\Controllers\Api\V1\Admin\DetailTemplateController;
use Illuminate\Support\Facades\Route;

/*
 * Detail-page templates (0.161.0, docs/page-builder.md "Detail templates").
 * Behind the union of the roles that own a kind of record — content for the
 * catalogue and the blog, store for the shop; the controller narrows to the
 * owner of the kind being laid out, as the share links do. Required inside
 * the admin group by routes/api.php.
 *
 * `options`, `records` and `preview` are declared above `{detailTemplate}` or
 * the model binding takes the literal word and answers 404 — the `media/move`
 * trap.
 */
Route::middleware('role:content_manager,store_manager')->group(function () {
    Route::get('detail-templates/options', [DetailTemplateController::class, 'options'])->name('detail-templates.options');
    Route::get('detail-templates/records', [DetailTemplateController::class, 'records'])->name('detail-templates.records');
    // Named `.show` so the public resources' `routeIs('*.show')` reads it as a detail read.
    Route::post('detail-templates/preview', [DetailTemplateController::class, 'preview'])->middleware('throttle:60,1')->name('detail-templates.preview.show');
    Route::get('detail-templates', [DetailTemplateController::class, 'index'])->name('detail-templates.index');
    Route::post('detail-templates', [DetailTemplateController::class, 'store'])->name('detail-templates.store');
    Route::get('detail-templates/{detailTemplate}', [DetailTemplateController::class, 'show'])->name('detail-templates.show');
    Route::patch('detail-templates/{detailTemplate}', [DetailTemplateController::class, 'update'])->name('detail-templates.update');
    Route::delete('detail-templates/{detailTemplate}', [DetailTemplateController::class, 'destroy'])->name('detail-templates.destroy');
    Route::post('detail-templates/{detailTemplate}/activate', [DetailTemplateController::class, 'activate'])->name('detail-templates.activate');
    Route::post('detail-templates/{detailTemplate}/deactivate', [DetailTemplateController::class, 'deactivate'])->name('detail-templates.deactivate');
});
