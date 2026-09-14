<?php

use App\Http\Controllers\Api\V1\Admin\ActivityController;
use App\Http\Controllers\Api\V1\Admin\ChatAdminController;
use App\Http\Controllers\Api\V1\Admin\ClientErrorController as AdminClientErrorController;
use App\Http\Controllers\Api\V1\Admin\EmailTemplateController;
use App\Http\Controllers\Api\V1\Admin\IntegrationsController;
use App\Http\Controllers\Api\V1\Admin\MailController;
use App\Http\Controllers\Api\V1\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\V1\Admin\UserAdminController;
use Illuminate\Support\Facades\Route;

/*
 * Administrators only: settings, staff, the activity log, the assistant's console, mail. Everything here is behind `role:admin`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:admin')->group(function () {
    /*
     * Read-only, and deliberately so. No store, no update, no destroy:
     * the only thing that removes a row is the scheduled retention
     * prune, and a log whose subject can edit it is evidence of
     * nothing.
     */
    Route::get('activity', [ActivityController::class, 'index'])->name('activity.index');

    /*
     * JavaScript failures, grouped by bug rather than listed by
     * occurrence — forty people hitting one is one piece of work.
     * `role:admin` for the reason the chat console is: a message can
     * carry a route, a record id and occasionally a fragment of
     * somebody's input.
     */
    Route::get('client-errors', [AdminClientErrorController::class, 'index'])->name('client-errors.index');
    Route::post('client-errors/{id}/resolve', [AdminClientErrorController::class, 'resolve'])->name('client-errors.resolve');

    /*
     * The website assistant.
     *
     * `role:admin` because these transcripts hold whatever
     * visitors typed — names, telephone numbers, descriptions of
     * somebody's network — given by people with no account. Blast
     * radius, the argument `campaign_manager` was split out with.
     *
     * Read-only apart from resolving an unanswered question: there
     * is no way to edit a transcript and no way to delete one, and
     * the only thing that removes a conversation is the retention
     * prune deleting by age.
     */
    Route::get('chat/dashboard', [ChatAdminController::class, 'dashboard'])->name('chat.dashboard');
    Route::get('chat/unanswered', [ChatAdminController::class, 'unanswered'])->name('chat.unanswered');
    Route::post('chat/unanswered/resolve', [ChatAdminController::class, 'resolve'])->name('chat.unanswered.resolve');
    Route::get('chat/conversations', [ChatAdminController::class, 'conversations'])->name('chat.conversations');
    Route::get('chat/conversations/{chatConversation}', [ChatAdminController::class, 'conversation'])->name('chat.conversation');

    Route::get('settings', [AdminSettingController::class, 'index'])->name('settings.index');
    Route::patch('settings', [AdminSettingController::class, 'update'])->name('settings.update');
    // Clearing a credential is its own action: a blank save means
    // "unchanged", because the form can never show the current one.
    Route::post('settings/clear-secret', [AdminSettingController::class, 'clearSecret'])->name('settings.clear-secret');

    /*
     * Outgoing mail: which transport, and connecting a mailbox.
     *
     * Beside settings and behind the same administrator role,
     * because what these write *are* settings — the difference is
     * that they talk to Google and to a mail server, and so can
     * fail in ways a key/value update has no words for.
     *
     * `test` is throttled: it sends a real message on request, and
     * the one endpoint here that does needs a ceiling however
     * trusted the caller is.
     */
    Route::get('settings/mail', [MailController::class, 'status'])->name('settings.mail.status');
    Route::post('settings/mail/authorize', [MailController::class, 'authorize'])->name('settings.mail.authorize');
    Route::post('settings/mail/callback', [MailController::class, 'callback'])->name('settings.mail.callback');
    Route::post('settings/mail/disconnect', [MailController::class, 'disconnect'])->name('settings.mail.disconnect');
    Route::post('settings/mail/test', [MailController::class, 'test'])
        ->middleware('throttle:6,1')->name('settings.mail.test');

    // Proving a third-party key from the screen it was typed into.
    // Same shape as the mail test: one real call, the provider's
    // own words on a refusal, a success clears the last failure.
    Route::post('settings/integrations/hunter/test', [IntegrationsController::class, 'hunter'])
        ->middleware('throttle:6,1')->name('settings.integrations.hunter.test');

    /*
     * What the system's emails say, as against how they are sent.
     *
     * Beside the transport and behind the same role: the two are
     * worked in one sitting, and the console path mirrors this one
     * so `AdminNavRolesTest` can map the sidebar row to a real
     * route rather than falling into its "cannot map, skip" branch
     * — which would leave the newest row the one row it does not
     * check.
     *
     * `preview` is declared **above** `{key}`, or `{key}` binds the
     * literal string "preview" — the trap `leads/export` and the
     * media bulk routes already record. `{key}` is a plain string
     * rather than a bound model, because there is no row for an
     * uncustomised message and binding would 404 on 25 of 25 on a
     * fresh install.
     */
    Route::get('settings/email-templates', [EmailTemplateController::class, 'index'])
        ->name('settings.email-templates.index');
    Route::post('settings/email-templates/{key}/preview', [EmailTemplateController::class, 'preview'])
        ->name('settings.email-templates.preview');
    Route::post('settings/email-templates/{key}/test', [EmailTemplateController::class, 'test'])
        ->middleware('throttle:6,1')->name('settings.email-templates.test');
    Route::get('settings/email-templates/{key}', [EmailTemplateController::class, 'show'])
        ->name('settings.email-templates.show');
    Route::put('settings/email-templates/{key}', [EmailTemplateController::class, 'update'])
        ->name('settings.email-templates.update');
    Route::delete('settings/email-templates/{key}', [EmailTemplateController::class, 'destroy'])
        ->name('settings.email-templates.destroy');

    // Staff accounts. Administrator-only: this is the screen that
    // can lock everyone else out, so it sits with settings rather
    // than with content.
    Route::get('staff/roles', [UserAdminController::class, 'roles'])->name('staff.roles');
    Route::get('staff', [UserAdminController::class, 'index'])->name('staff.index');
    Route::post('staff', [UserAdminController::class, 'store'])->name('staff.store');
    Route::get('staff/{user:id}', [UserAdminController::class, 'show'])->name('staff.show');
    Route::patch('staff/{user:id}', [UserAdminController::class, 'update'])->name('staff.update');
    Route::delete('staff/{user:id}', [UserAdminController::class, 'destroy'])->name('staff.destroy');
});
