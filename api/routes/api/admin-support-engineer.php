<?php

use App\Http\Controllers\Api\V1\Admin\CannedReplyController;
use App\Http\Controllers\Api\V1\Admin\CustomerAdminController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\JobApplicationController;
use App\Http\Controllers\Api\V1\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use Illuminate\Support\Facades\Route;

/*
 * The support desk: the dashboard, the ticket queue, customers, applications. Everything here is behind `role:support_engineer`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:support_engineer')->group(function () {
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
    Route::get('users', [AdminUserController::class, 'index'])->name('users.index');
    Route::get('tickets', [AdminTicketController::class, 'index'])->name('tickets.index');
    // Declared above the parameterised routes, the `media/move` rule — a
    // literal segment under a `{ticket}` route is a reference to a 404.
    Route::post('tickets/bulk', [AdminTicketController::class, 'bulk'])->name('tickets.bulk');
    Route::get('tickets/{ticket}', [AdminTicketController::class, 'show'])->name('tickets.show');
    Route::patch('tickets/{ticket}', [AdminTicketController::class, 'update'])->name('tickets.update');
    Route::post('tickets/{ticket}/reply', [AdminTicketController::class, 'reply'])->name('tickets.reply');
    Route::post('tickets/{ticket}/merge', [AdminTicketController::class, 'merge'])->name('tickets.merge');
    // The saved replies, filled for this ticket — what the reply form's
    // picker inserts. The console never sees a placeholder.
    Route::get('tickets/{ticket}/canned-replies', [CannedReplyController::class, 'forTicket'])
        ->name('tickets.canned-replies');

    /*
     * Saved replies: the desk's shared library of wording. Support-desk
     * work, so the same role as the queue they are pasted into.
     */
    Route::get('canned-replies', [CannedReplyController::class, 'index'])->name('canned-replies.index');
    Route::post('canned-replies', [CannedReplyController::class, 'store'])->name('canned-replies.store');
    Route::get('canned-replies/{canned_reply}', [CannedReplyController::class, 'show'])->name('canned-replies.show');
    Route::patch('canned-replies/{canned_reply}', [CannedReplyController::class, 'update'])->name('canned-replies.update');
    Route::delete('canned-replies/{canned_reply}', [CannedReplyController::class, 'destroy'])->name('canned-replies.destroy');
    Route::get('ticket-attachments/{attachment}', [AdminTicketController::class, 'downloadAttachment'])
        ->name('ticket-attachments.download');

    /*
     * Portal accounts, and the approval queue self-registration
     * feeds. Support-desk work rather than administrator work:
     * behind `role:admin` every registration would wait on one of
     * two people.
     *
     * Bound by id. There is no slug, and binding by email would
     * put a customer's address in a URL — which ends up in access
     * logs, referrers and browser history.
     */
    Route::get('customers', [CustomerAdminController::class, 'index'])->name('customers.index');
    Route::get('customers/{customer}', [CustomerAdminController::class, 'show'])->name('customers.show');
    Route::patch('customers/{customer}', [CustomerAdminController::class, 'update'])->name('customers.update');
    Route::post('customers/{customer}/approve', [CustomerAdminController::class, 'approve'])->name('customers.approve');
    Route::post('customers/{customer}/reject', [CustomerAdminController::class, 'reject'])->name('customers.reject');
    Route::post('customers/{customer}/status', [CustomerAdminController::class, 'status'])->name('customers.status');
    Route::post('customers/{customer}/resend-verification', [CustomerAdminController::class, 'resendVerification'])
        ->name('customers.resend-verification');

    /*
     * Applications carry a CV and an employment history, so they
     * sit with the support-desk role rather than with content --
     * whoever edits the blog has no business reading them. The
     * download is the only route to a CV that exists.
     */
    Route::get('applications', [JobApplicationController::class, 'index'])->name('applications.index');
    Route::get('applications/{job_application}', [JobApplicationController::class, 'show'])->name('applications.show');
    Route::post('applications/{job_application}/status', [JobApplicationController::class, 'status'])->name('applications.status');
    Route::get('applications/{job_application}/cv', [JobApplicationController::class, 'downloadCv'])->name('applications.cv');
    Route::delete('applications/{job_application}', [JobApplicationController::class, 'destroy'])->name('applications.destroy');
});
