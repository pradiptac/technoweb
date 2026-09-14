<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerOrderController;
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
Route::middleware('customer')->group(function () {
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

    Route::get('tickets', [TicketController::class, 'index'])->name('tickets.index');
    Route::get('tickets/summary', [TicketController::class, 'summary'])->name('tickets.summary');
    Route::post('tickets', [TicketController::class, 'store'])
        ->middleware('throttle:20,1')
        ->name('tickets.store');
    Route::get('tickets/{ticket}', [TicketController::class, 'show'])->name('tickets.show');
    Route::post('tickets/{ticket}/messages', [TicketController::class, 'storeMessage'])->name('tickets.messages.store');
    Route::post('tickets/{ticket}/close', [TicketController::class, 'close'])->name('tickets.close');
    Route::post('tickets/{ticket}/reopen', [TicketController::class, 'reopen'])->name('tickets.reopen');
    Route::get('ticket-attachments/{attachment}', [TicketController::class, 'downloadAttachment'])
        ->name('tickets.attachments.download');
});
