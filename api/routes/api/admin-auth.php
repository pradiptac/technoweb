<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
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
// Outside every role: a support engineer must be able to change
// their own password without asking an administrator to do it for
// them, which would mean the administrator knowing it.
Route::patch('auth/password', [AdminAuthController::class, 'changePassword'])->name('auth.password');
