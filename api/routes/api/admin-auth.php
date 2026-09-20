<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\SearchController;
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
// Outside every role: a support engineer must be able to change
// their own password without asking an administrator to do it for
// them, which would mean the administrator knowing it.
Route::patch('auth/password', [AdminAuthController::class, 'changePassword'])->name('auth.password');
