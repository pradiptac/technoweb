<?php

use App\Http\Controllers\Api\V1\Admin\MessageAutomationController;
use App\Http\Controllers\Api\V1\Admin\MessageBroadcastController;
use App\Http\Controllers\Api\V1\Admin\MessageContactController;
use App\Http\Controllers\Api\V1\Admin\MessageTemplateController;
use Illuminate\Support\Facades\Route;

/*
 * Messaging channels — WhatsApp, RCS and browser push. Templates,
 * automations, broadcasts and the opt-in list are worked by campaign
 * managers **and** store managers (the client's decision, 2026-09-24): a
 * basket reminder and an order update are the shop's, a broadcast the
 * campaign desk's, and both roles write the templates they send. The
 * provider keys are not here: they are `role:admin`, in admin-admin.php.
 * Required inside the admin group by routes/api.php.
 */
Route::middleware('role:campaign_manager,store_manager')->group(function () {
    Route::get('messaging/templates', [MessageTemplateController::class, 'index'])->name('messaging.templates.index');
    Route::post('messaging/templates', [MessageTemplateController::class, 'store'])->name('messaging.templates.store');
    // Declared above `templates/{messageTemplate}`, or the id binds the word "sync".
    Route::post('messaging/templates/sync', [MessageTemplateController::class, 'sync'])
        ->middleware('throttle:10,1')->name('messaging.templates.sync');
    Route::get('messaging/templates/{messageTemplate}', [MessageTemplateController::class, 'show'])->name('messaging.templates.show');
    Route::patch('messaging/templates/{messageTemplate}', [MessageTemplateController::class, 'update'])->name('messaging.templates.update');
    Route::delete('messaging/templates/{messageTemplate}', [MessageTemplateController::class, 'destroy'])->name('messaging.templates.destroy');
    Route::post('messaging/templates/{messageTemplate}/submit', [MessageTemplateController::class, 'submit'])
        ->middleware('throttle:10,1')->name('messaging.templates.submit');
    Route::post('messaging/templates/{messageTemplate}/test', [MessageTemplateController::class, 'test'])
        ->middleware('throttle:6,1')->name('messaging.templates.test');

    Route::get('messaging/automations', [MessageAutomationController::class, 'index'])->name('messaging.automations.index');
    Route::put('messaging/automations', [MessageAutomationController::class, 'update'])->name('messaging.automations.update');

    Route::get('messaging/contacts', [MessageContactController::class, 'index'])->name('messaging.contacts.index');
    Route::post('messaging/contacts/{messageContact}/opt-out', [MessageContactController::class, 'optOut'])->name('messaging.contacts.opt-out');

    Route::get('messaging/broadcasts', [MessageBroadcastController::class, 'index'])->name('messaging.broadcasts.index');
    Route::post('messaging/broadcasts', [MessageBroadcastController::class, 'store'])->name('messaging.broadcasts.store');
    // Above `broadcasts/{messageBroadcast}` for the `media/move` reason.
    Route::get('messaging/broadcasts/audience', [MessageBroadcastController::class, 'audience'])->name('messaging.broadcasts.audience');
    Route::get('messaging/broadcasts/{messageBroadcast}', [MessageBroadcastController::class, 'show'])->name('messaging.broadcasts.show');
    Route::patch('messaging/broadcasts/{messageBroadcast}', [MessageBroadcastController::class, 'update'])->name('messaging.broadcasts.update');
    Route::delete('messaging/broadcasts/{messageBroadcast}', [MessageBroadcastController::class, 'destroy'])->name('messaging.broadcasts.destroy');
    Route::post('messaging/broadcasts/{messageBroadcast}/send', [MessageBroadcastController::class, 'send'])->name('messaging.broadcasts.send');
    Route::post('messaging/broadcasts/{messageBroadcast}/cancel', [MessageBroadcastController::class, 'cancel'])->name('messaging.broadcasts.cancel');
});
