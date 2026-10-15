<?php

use App\Http\Controllers\Api\V1\Admin\PreviewLinkController;
use Illuminate\Support\Facades\Route;

/*
 * Draft share links (0.138.0, docs/admin-console.md). Behind the union of the
 * three roles that own a kind of record — content, shop and SEO; the
 * controller narrows to the owner of the record being shared, so a content
 * manager cannot link a shop product. Required inside the admin group by
 * routes/api.php.
 */
Route::middleware('role:content_manager,store_manager,seo_manager')->group(function () {
    Route::get('preview-links', [PreviewLinkController::class, 'index'])->name('preview-links.index');
    Route::post('preview-links', [PreviewLinkController::class, 'store'])->name('preview-links.store');
    Route::delete('preview-links/{previewLink}', [PreviewLinkController::class, 'destroy'])->name('preview-links.destroy');
});
