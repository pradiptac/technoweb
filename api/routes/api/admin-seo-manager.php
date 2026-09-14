<?php

use App\Http\Controllers\Api\V1\Admin\LandingPageController as AdminLandingPageController;
use App\Http\Controllers\Api\V1\Admin\LocationController as AdminLocationController;
use App\Http\Controllers\Api\V1\Admin\RedirectController as AdminRedirectController;
use App\Http\Controllers\Api\V1\Admin\SeoAiController;
use App\Http\Controllers\Api\V1\Admin\SeoController;
use Illuminate\Support\Facades\Route;

/*
 * SEO: the overview, redirects, landing pages, places and the AI assistant. Everything here is behind `role:seo_manager`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:seo_manager')->group(function () {
    Route::get('seo', [SeoController::class, 'index'])->name('seo.index');
    Route::patch('seo/sitemap', [SeoController::class, 'updateSitemap'])->name('seo.sitemap');

    /*
     * The AI assistant, declared here for the same reason
     * `seo/sitemap` is — above `seo/{type}/{id}`, or `{type}`
     * binds the literal "ai" and every one of these answers 404
     * from model binding. That is the `media/move` trap, which
     * reads as a missing record rather than as a routing mistake.
     *
     * Throttled: an AI request costs money, and the limit is per
     * editor rather than the daily cap, which bounds the bill.
     * `test-model` is tighter still — it is a button somebody
     * presses while reading, not while working.
     */
    Route::post('seo/ai/test-model', [SeoAiController::class, 'testModel'])
        ->middleware('throttle:6,1')->name('seo.ai.test-model');
    Route::get('seo/ai/suggestions', [SeoAiController::class, 'suggestions'])->name('seo.ai.suggestions');
    Route::post('seo/ai/suggestions/{seoSuggestion}/status', [SeoAiController::class, 'decide'])
        ->name('seo.ai.decide');
    Route::get('seo/ai/context', [SeoAiController::class, 'context'])->name('seo.ai.context');
    /*
     * Last of the `seo/ai/*` block, because `{action}` is a
     * parameter and would otherwise swallow "suggestions",
     * "context" and "test-model" — the same shadowing, one level
     * further in.
     */
    Route::post('seo/ai/{action}', [SeoAiController::class, 'run'])
        ->middleware('throttle:10,1')->name('seo.ai.run');

    /*
     * One record, re-scored. Declared *after* `seo/sitemap` so the
     * literal segment is matched first — `{type}` would otherwise
     * happily swallow "sitemap" and this would shadow it.
     */
    Route::get('seo/{type}/{id}', [SeoController::class, 'show'])->name('seo.show');

    Route::get('redirects', [AdminRedirectController::class, 'index'])->name('redirects.index');
    Route::post('redirects', [AdminRedirectController::class, 'store'])->name('redirects.store');
    Route::get('redirects/{redirect:id}', [AdminRedirectController::class, 'show'])->name('redirects.show');
    Route::patch('redirects/{redirect:id}', [AdminRedirectController::class, 'update'])->name('redirects.update');
    Route::delete('redirects/{redirect:id}', [AdminRedirectController::class, 'destroy'])->name('redirects.destroy');

    /*
     * Landing pages and the places they can be about.
     *
     * Under seo_manager rather than content_manager on purpose. A
     * landing page is not a piece of content — it is a decision
     * about which queries this site competes for, and the cost of
     * getting it wrong lands on the ranking of pages nobody
     * touched. The role that already owns the redirect table and
     * the SEO overview is the one that should own this.
     *
     * `opportunities` is declared before `{landing_page:id}` or the
     * literal would be captured as an id.
     */
    Route::get('landing-pages/opportunities', [AdminLandingPageController::class, 'opportunities'])->name('landing-pages.opportunities');
    Route::get('landing-pages', [AdminLandingPageController::class, 'index'])->name('landing-pages.index');
    Route::post('landing-pages', [AdminLandingPageController::class, 'store'])->name('landing-pages.store');
    Route::get('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'show'])->name('landing-pages.show');
    Route::patch('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'update'])->name('landing-pages.update');
    Route::delete('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'destroy'])->name('landing-pages.destroy');

    Route::get('locations', [AdminLocationController::class, 'index'])->name('locations.index');
    Route::post('locations', [AdminLocationController::class, 'store'])->name('locations.store');
    Route::get('locations/{location:id}', [AdminLocationController::class, 'show'])->name('locations.show');
    Route::patch('locations/{location:id}', [AdminLocationController::class, 'update'])->name('locations.update');
    Route::delete('locations/{location:id}', [AdminLocationController::class, 'destroy'])->name('locations.destroy');
});
