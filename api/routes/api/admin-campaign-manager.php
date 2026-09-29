<?php

use App\Http\Controllers\Api\V1\Admin\NewsletterCampaignController as AdminNewsletterCampaignController;
use App\Http\Controllers\Api\V1\Admin\NewsletterGroupController as AdminNewsletterGroupController;
use App\Http\Controllers\Api\V1\Admin\NewsletterImportController as AdminNewsletterImportController;
use App\Http\Controllers\Api\V1\Admin\NewsletterMailboxController as AdminNewsletterMailboxController;
use App\Http\Controllers\Api\V1\Admin\NewsletterReportController as AdminNewsletterReportController;
use App\Http\Controllers\Api\V1\Admin\NewsletterSequenceController as AdminNewsletterSequenceController;
use App\Http\Controllers\Api\V1\Admin\NewsletterSubscriberController as AdminNewsletterSubscriberController;
use App\Http\Controllers\Api\V1\Admin\NewsletterSuppressionController as AdminNewsletterSuppressionController;
use App\Http\Controllers\Api\V1\Admin\NewsletterTemplateController as AdminNewsletterTemplateController;
use App\Http\Controllers\Api\V1\Admin\NewsletterVerificationController as AdminNewsletterVerificationController;
use Illuminate\Support\Facades\Route;

/*
 * The newsletter. Everything here is behind `role:campaign_manager`; an
 * administrator passes every role check implicitly. Required inside the
 * admin group by routes/api.php.
 */
Route::middleware('role:campaign_manager')->group(function () {
    Route::get('newsletter/dashboard', [AdminNewsletterReportController::class, 'dashboard'])->name('newsletter.dashboard');

    /*
     * Is anything going to deliver this.
     *
     * Its own route rather than a field on the campaign, because
     * it is a fact about the deployment and not about the record —
     * and because the send screen needs it *fresh*: a value baked
     * into the page an hour ago says the scheduler was alive an
     * hour ago, which is not the question anybody is asking with
     * their finger over Send.
     */
    Route::get('newsletter/queue', [AdminNewsletterReportController::class, 'queue'])->name('newsletter.queue');

    Route::get('newsletter/subscribers', [AdminNewsletterSubscriberController::class, 'index'])->name('newsletter.subscribers.index');
    Route::post('newsletter/subscribers', [AdminNewsletterSubscriberController::class, 'store'])->name('newsletter.subscribers.store');
    Route::get('newsletter/subscribers/export', [AdminNewsletterSubscriberController::class, 'export'])->name('newsletter.subscribers.export');
    Route::post('newsletter/subscribers/paste', [AdminNewsletterSubscriberController::class, 'paste'])->name('newsletter.subscribers.paste');
    Route::get('newsletter/subscribers/{subscriber}', [AdminNewsletterSubscriberController::class, 'show'])->name('newsletter.subscribers.show');
    Route::patch('newsletter/subscribers/{subscriber}', [AdminNewsletterSubscriberController::class, 'update'])->name('newsletter.subscribers.update');
    Route::delete('newsletter/subscribers/{subscriber}', [AdminNewsletterSubscriberController::class, 'destroy'])->name('newsletter.subscribers.destroy');
    Route::post('newsletter/subscribers/{subscriber}/unsubscribe', [AdminNewsletterSubscriberController::class, 'unsubscribe'])->name('newsletter.subscribers.unsubscribe');
    // One address, now, whatever Hunter said before. Throttled:
    // each press spends one of the month's allowance.
    Route::post('newsletter/subscribers/{subscriber}/verify', [AdminNewsletterSubscriberController::class, 'verify'])
        ->middleware('throttle:30,1')->name('newsletter.subscribers.verify');

    // The Hunter verification screen: breakdown, allowance, queue, ledger.
    Route::get('newsletter/verification', [AdminNewsletterVerificationController::class, 'show'])->name('newsletter.verification');

    Route::get('newsletter/groups', [AdminNewsletterGroupController::class, 'index'])->name('newsletter.groups.index');
    Route::post('newsletter/groups', [AdminNewsletterGroupController::class, 'store'])->name('newsletter.groups.store');
    Route::patch('newsletter/groups/{group}', [AdminNewsletterGroupController::class, 'update'])->name('newsletter.groups.update');
    Route::delete('newsletter/groups/{group}', [AdminNewsletterGroupController::class, 'destroy'])->name('newsletter.groups.destroy');
    Route::post('newsletter/groups/{group}/members', [AdminNewsletterGroupController::class, 'members'])->name('newsletter.groups.members');

    Route::get('newsletter/imports', [AdminNewsletterImportController::class, 'index'])->name('newsletter.imports.index');
    Route::post('newsletter/imports/analyse', [AdminNewsletterImportController::class, 'analyse'])->name('newsletter.imports.analyse');
    Route::post('newsletter/imports', [AdminNewsletterImportController::class, 'store'])->name('newsletter.imports.store');

    /*
     * Importing from a mailbox. The literal `mailbox` routes are declared
     * above `imports/{import}`, or `{import}` binds the word "mailbox" and
     * every one of them answers 404 from model binding — the `media/move`
     * trap. The consent verbs mirror Settings → Ticketing's on the
     * newsletter's own slot; `scan` starts the queued job, `show` is what
     * the screen polls, `destroy` discards a scan that has not been committed.
     */
    Route::get('newsletter/imports/mailbox', [AdminNewsletterMailboxController::class, 'status'])->name('newsletter.imports.mailbox.status');
    Route::post('newsletter/imports/mailbox/authorize', [AdminNewsletterMailboxController::class, 'authorize'])->name('newsletter.imports.mailbox.authorize');
    Route::post('newsletter/imports/mailbox/callback', [AdminNewsletterMailboxController::class, 'callback'])->name('newsletter.imports.mailbox.callback');
    Route::post('newsletter/imports/mailbox/disconnect', [AdminNewsletterMailboxController::class, 'disconnect'])->name('newsletter.imports.mailbox.disconnect');
    Route::post('newsletter/imports/mailbox/scan', [AdminNewsletterImportController::class, 'scan'])
        ->middleware('throttle:6,1')->name('newsletter.imports.mailbox.scan');
    Route::get('newsletter/imports/crawl', [AdminNewsletterImportController::class, 'crawlStatus'])->name('newsletter.imports.crawl.status');
    Route::post('newsletter/imports/crawl', [AdminNewsletterImportController::class, 'crawl'])
        ->middleware('throttle:6,1')->name('newsletter.imports.crawl.start');

    Route::get('newsletter/imports/{import}', [AdminNewsletterImportController::class, 'show'])->name('newsletter.imports.show');
    Route::delete('newsletter/imports/{import}', [AdminNewsletterImportController::class, 'destroy'])->name('newsletter.imports.destroy');
    Route::get('newsletter/imports/{import}/rows', [AdminNewsletterImportController::class, 'rows'])->name('newsletter.imports.rows');

    Route::get('newsletter/templates', [AdminNewsletterTemplateController::class, 'index'])->name('newsletter.templates.index');
    Route::post('newsletter/templates', [AdminNewsletterTemplateController::class, 'store'])->name('newsletter.templates.store');
    Route::post('newsletter/templates/preview', [AdminNewsletterTemplateController::class, 'preview'])->name('newsletter.templates.preview');
    Route::get('newsletter/templates/{template}', [AdminNewsletterTemplateController::class, 'show'])->name('newsletter.templates.show');
    Route::patch('newsletter/templates/{template}', [AdminNewsletterTemplateController::class, 'update'])->name('newsletter.templates.update');
    Route::delete('newsletter/templates/{template}', [AdminNewsletterTemplateController::class, 'destroy'])->name('newsletter.templates.destroy');

    Route::get('newsletter/suppressions', [AdminNewsletterSuppressionController::class, 'index'])->name('newsletter.suppressions.index');
    Route::post('newsletter/suppressions', [AdminNewsletterSuppressionController::class, 'store'])->name('newsletter.suppressions.store');
    Route::delete('newsletter/suppressions/{id}', [AdminNewsletterSuppressionController::class, 'destroy'])->name('newsletter.suppressions.destroy');

    Route::get('newsletter/campaigns', [AdminNewsletterCampaignController::class, 'index'])->name('newsletter.campaigns.index');
    Route::post('newsletter/campaigns', [AdminNewsletterCampaignController::class, 'store'])->name('newsletter.campaigns.store');
    Route::get('newsletter/campaigns/{campaign}', [AdminNewsletterCampaignController::class, 'show'])->name('newsletter.campaigns.show');
    Route::patch('newsletter/campaigns/{campaign}', [AdminNewsletterCampaignController::class, 'update'])->name('newsletter.campaigns.update');
    Route::delete('newsletter/campaigns/{campaign}', [AdminNewsletterCampaignController::class, 'destroy'])->name('newsletter.campaigns.destroy');
    Route::post('newsletter/campaigns/{campaign}/duplicate', [AdminNewsletterCampaignController::class, 'duplicate'])->name('newsletter.campaigns.duplicate');
    // A copy sent to the non-openers of a sent campaign; once per campaign.
    Route::post('newsletter/campaigns/{campaign}/resend', [AdminNewsletterCampaignController::class, 'resend'])->name('newsletter.campaigns.resend');
    Route::get('newsletter/campaigns/{campaign}/audience', [AdminNewsletterCampaignController::class, 'audience'])->name('newsletter.campaigns.audience');
    Route::get('newsletter/campaigns/{campaign}/health', [AdminNewsletterCampaignController::class, 'health'])->name('newsletter.campaigns.health');
    Route::post('newsletter/campaigns/{campaign}/test', [AdminNewsletterCampaignController::class, 'test'])
        ->middleware('throttle:6,1')->name('newsletter.campaigns.test');
    Route::post('newsletter/campaigns/{campaign}/send', [AdminNewsletterCampaignController::class, 'send'])->name('newsletter.campaigns.send');
    Route::post('newsletter/campaigns/{campaign}/decide', [AdminNewsletterCampaignController::class, 'decide'])->name('newsletter.campaigns.decide');
    Route::post('newsletter/campaigns/{campaign}/cancel', [AdminNewsletterCampaignController::class, 'cancel'])->name('newsletter.campaigns.cancel');
    Route::get('newsletter/campaigns/{campaign}/report', [AdminNewsletterReportController::class, 'campaign'])->name('newsletter.campaigns.report');

    /*
     * Automation sequences. A step is a campaign row edited through the
     * campaign routes above; these manage the sequence's shape and who is in
     * it. `steps/reorder` is declared above `steps/{campaign}`, or `{campaign}`
     * binds the word "reorder" — the `media/move` trap.
     */
    Route::get('newsletter/sequences', [AdminNewsletterSequenceController::class, 'index'])->name('newsletter.sequences.index');
    Route::post('newsletter/sequences', [AdminNewsletterSequenceController::class, 'store'])->name('newsletter.sequences.store');
    Route::get('newsletter/sequences/{sequence}', [AdminNewsletterSequenceController::class, 'show'])->name('newsletter.sequences.show');
    Route::patch('newsletter/sequences/{sequence}', [AdminNewsletterSequenceController::class, 'update'])->name('newsletter.sequences.update');
    Route::delete('newsletter/sequences/{sequence}', [AdminNewsletterSequenceController::class, 'destroy'])->name('newsletter.sequences.destroy');
    Route::post('newsletter/sequences/{sequence}/steps', [AdminNewsletterSequenceController::class, 'storeStep'])->name('newsletter.sequences.steps.store');
    Route::patch('newsletter/sequences/{sequence}/steps/reorder', [AdminNewsletterSequenceController::class, 'reorderSteps'])->name('newsletter.sequences.steps.reorder');
    Route::patch('newsletter/sequences/{sequence}/steps/{campaign}', [AdminNewsletterSequenceController::class, 'updateStep'])->name('newsletter.sequences.steps.update');
    Route::delete('newsletter/sequences/{sequence}/steps/{campaign}', [AdminNewsletterSequenceController::class, 'destroyStep'])->name('newsletter.sequences.steps.destroy');
    Route::post('newsletter/sequences/{sequence}/enrol', [AdminNewsletterSequenceController::class, 'enrol'])->name('newsletter.sequences.enrol');
    Route::get('newsletter/sequences/{sequence}/enrolments', [AdminNewsletterSequenceController::class, 'enrolments'])->name('newsletter.sequences.enrolments');
    Route::post('newsletter/sequences/{sequence}/enrolments/{enrolment}/cancel', [AdminNewsletterSequenceController::class, 'cancelEnrolment'])->name('newsletter.sequences.enrolments.cancel');
    Route::get('newsletter/sequences/{sequence}/report', [AdminNewsletterSequenceController::class, 'report'])->name('newsletter.sequences.report');
});
