<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\Admin\CopilotController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\MentionableController;
use App\Http\Controllers\Api\V1\Admin\NotificationsController;
use App\Http\Controllers\Api\V1\Admin\SearchController;
use App\Http\Controllers\Api\V1\Admin\StaffNotificationController;
use App\Http\Controllers\Api\V1\Admin\StaffPushController;
use App\Http\Controllers\Api\V1\Admin\WritingController;
use Illuminate\Support\Facades\Route;

/*
 * The console's own session routes — not role-gated, because every role
 * needs to check its session and change its own password. Required inside
 * the admin group by routes/api.php.
 */
// Any authenticated, active staff member — not role-gated, since
// every role needs to be able to check its own session.
Route::post('auth/logout', [AdminAuthController::class, 'logout'])->name('auth.logout');
Route::get('auth/me', [AdminAuthController::class, 'me'])->name('auth.me');

/*
 * The command palette's search. Staff-wide like `auth/me` — every role has
 * something to find — and the controller filters each group by role with
 * the same enum the route files use, so nothing is offered that 403s.
 */
Route::get('search', SearchController::class)->name('search');
// The sidebar's once-a-minute poll: what arrived since a moment. Staff-wide
// for the same reason, and the controller nulls what the role cannot open.
Route::get('new-since', [DashboardController::class, 'newSince'])->name('new-since');
/*
 * Ask ALTIS (0.177.0, docs/copilot.md). Staff-wide for the search's reason
 * — every role has questions of its own — and the controller narrows the
 * list to this account's before the words are matched and before a model
 * is shown anything.
 *
 * `ask` is throttled: it can reach a model, and the only thing that bounds
 * a key's spend otherwise is the assistant's daily cap, which is shared
 * with the SEO assistant and the page drafts.
 */
Route::get('copilot/questions', [CopilotController::class, 'index'])->name('copilot.questions');
Route::post('copilot/ask', [CopilotController::class, 'ask'])
    ->middleware('throttle:30,1')->name('copilot.ask');

/*
 * Writing help (0.183.0, docs/ai-writing.md). Staff-wide like the copilot;
 * every surface narrows by role in the controller.
 */
Route::get('writing/status', [WritingController::class, 'status'])->name('writing.status');
Route::post('writing', [WritingController::class, 'write'])->middleware('throttle:20,1')->name('writing.write');
Route::post('writing/subjects', [WritingController::class, 'subjects'])->middleware('throttle:20,1')->name('writing.subjects');

/*
 * Digest and alerts (0.185.0, docs/digest-alerts.md). Staff-wide: everybody
 * chooses their own; the controller lets an administrator address anybody.
 */
Route::get('notifications/preferences', [NotificationsController::class, 'show'])->name('notifications.show');
Route::patch('notifications/preferences', [NotificationsController::class, 'update'])->name('notifications.update');
Route::post('notifications/digest/send', [NotificationsController::class, 'sendDigest'])->middleware('throttle:6,1')->name('notifications.digest');
Route::post('notifications/alerts/test', [NotificationsController::class, 'testAlert'])->middleware('throttle:6,1')->name('notifications.test');
// The bell (C2, docs/notifications.md): the caller's own rows, nobody else's.
Route::get('notifications', [StaffNotificationController::class, 'index'])->name('notifications.index');
Route::post('notifications/read-all', [StaffNotificationController::class, 'readAll'])->name('notifications.read-all');
Route::post('notifications/{id}/read', [StaffNotificationController::class, 'read'])->whereNumber('id')->name('notifications.read');
Route::get('mentionable', MentionableController::class)->middleware('throttle:60,1')->name('mentionable');
Route::post('push/subscribe', [StaffPushController::class, 'subscribe'])->middleware('throttle:20,1')->name('push.subscribe');
Route::delete('push/{id}', [StaffPushController::class, 'destroy'])->whereNumber('id')->name('push.destroy');

// Outside every role: a support engineer must be able to change
// their own password without asking an administrator to do it for
// them, which would mean the administrator knowing it.
Route::patch('auth/password', [AdminAuthController::class, 'changePassword'])->name('auth.password');
