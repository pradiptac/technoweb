<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerMeetingController;
use App\Http\Controllers\Api\V1\CustomerOrderController;
use App\Http\Controllers\Api\V1\CustomerVisitController;
use App\Http\Controllers\Api\V1\MessagingPreferenceController;
use App\Http\Controllers\Api\V1\ProductReviewController;
use App\Http\Controllers\Api\V1\TicketController;
use Illuminate\Support\Facades\Route;

/*
 * Customer portal — every route here is inside auth:sanctum and the
 * `customer` guard, scoped to the signed-in customer. Required inside the
 * auth:sanctum group by routes/api.php.
 */
/* ------------------------------------------------ customer portal */

// Guarded as customer-only: these endpoints authorise by comparing
// the caller's id against a ticket's customer_id, and a staff id is
// drawn from a different table. Staff have /admin equivalents.
// `portal` after it: with `portal_enabled` off every route here answers 403
// `reason: portal_disabled`, so a token issued before the switch was thrown
// stops working with it (EnsurePortalEnabled).
Route::middleware(['customer', 'portal'])->group(function () {
    Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
    Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
    Route::patch('auth/profile', [AuthController::class, 'updateProfile'])->name('auth.profile');

    /*
     * The customer's own orders.
     *
     * Under `my/` rather than `orders/`, because `orders/{number}` is
     * already the *guest* route and the two are authorised completely
     * differently — one by a session, the other by a secret in a link.
     * Both are real: most buyers here never sign in, and the ones who
     * do should not have to keep an email to see what they bought.
     */
    Route::get('my/orders', [CustomerOrderController::class, 'index'])->name('my.orders.index');
    Route::get('my/orders/{orderNumber}', [CustomerOrderController::class, 'show'])->name('my.orders.show');

    // Their engineer visit requests — `my/` for the `my/orders` reason:
    // `visits/{reference}` is the guest route, authorised by a token.
    Route::get('my/visits', [CustomerVisitController::class, 'index'])->name('my.visits.index');
    Route::get('my/visits/{reference}', [CustomerVisitController::class, 'show'])->name('my.visits.show');
    Route::post('my/visits/{reference}/cancel', [CustomerVisitController::class, 'cancel'])
        ->middleware('throttle:10,1')->name('my.visits.cancel');
    Route::post('my/visits/{reference}/reschedule', [CustomerVisitController::class, 'reschedule'])
        ->middleware('throttle:10,1')->name('my.visits.reschedule');

    // Their online meetings (docs/meetings.md) — `my/` for the same reason:
    // `meetings/{reference}` is the guest route, authorised by a token.
    Route::get('my/meetings', [CustomerMeetingController::class, 'index'])->name('my.meetings.index');
    Route::get('my/meetings/{reference}', [CustomerMeetingController::class, 'show'])
        ->where('reference', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->name('my.meetings.show');
    Route::post('my/meetings/{reference}/cancel', [CustomerMeetingController::class, 'cancel'])
        ->where('reference', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->middleware('throttle:10,1')->name('my.meetings.cancel');
    Route::post('my/meetings/{reference}/reschedule', [CustomerMeetingController::class, 'reschedule'])
        ->where('reference', '[A-Z][A-Z0-9]{1,5}-\d{4}-\d{5}')->middleware('throttle:10,1')->name('my.meetings.reschedule');

    // Which channels this customer is told things on (WhatsApp, RCS, push).
    Route::get('messaging/preferences', [MessagingPreferenceController::class, 'show'])->name('messaging.preferences.show');
    Route::patch('messaging/preferences', [MessagingPreferenceController::class, 'update'])
        ->middleware('throttle:20,1')->name('messaging.preferences.update');

    /*
     * The caller's own review of a shop product: read it (any status) and
     * write or rewrite it. Signed-in customers only, by the client's
     * decision; every write goes back to the queue. `docs/store.md`.
     */
    Route::get('store/products/{storeProduct:slug}/reviews/mine', [ProductReviewController::class, 'mine'])
        ->name('store.products.reviews.mine');
    Route::post('store/products/{storeProduct:slug}/reviews', [ProductReviewController::class, 'store'])
        ->middleware('throttle:10,1')->name('store.products.reviews.store');

    Route::get('tickets', [TicketController::class, 'index'])->name('tickets.index');
    Route::get('tickets/summary', [TicketController::class, 'summary'])->name('tickets.summary');
    Route::post('tickets', [TicketController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('tickets.store');
    Route::get('tickets/{ticket}', [TicketController::class, 'show'])->name('tickets.show');
    Route::post('tickets/{ticket}/messages', [TicketController::class, 'storeMessage'])->name('tickets.messages.store');
    // A customer's verdict on a staff reply. `{message}` is a plain id and
    // the controller checks it belongs to the ticket: binding it scoped
    // would 404 the same way, but the check says why in one place.
    Route::post('tickets/{ticket}/messages/{message}/rating', [TicketController::class, 'rateMessage'])->name('tickets.messages.rate');
    Route::post('tickets/{ticket}/messages/{message}/report', [TicketController::class, 'reportMessage'])->name('tickets.messages.report');
    Route::post('tickets/{ticket}/close', [TicketController::class, 'close'])->name('tickets.close');
    Route::post('tickets/{ticket}/reopen', [TicketController::class, 'reopen'])->name('tickets.reopen');
    Route::get('ticket-attachments/{attachment}', [TicketController::class, 'downloadAttachment'])
        ->name('tickets.attachments.download');
});
