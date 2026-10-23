<?php

use App\Http\Controllers\Api\V1\Admin\SocialAccountController;
use App\Http\Controllers\Api\V1\Admin\SocialPostController;
use Illuminate\Support\Facades\Route;

/*
 * LinkedIn and X posts (C7). Two roles in one file, as the feature spans both:
 * `content_manager` reviews and approves the drafts, `admin` owns the LinkedIn
 * connection (a company credential, the rule every mailbox and calendar
 * connection follows). `social-posts/draft` is a POST with no id, so it cannot
 * be taken for a post. Required inside the admin group by routes/api.php.
 */
Route::middleware('role:content_manager')->group(function () {
    Route::get('social-posts', [SocialPostController::class, 'index'])->name('social-posts.index');
    Route::post('social-posts/draft', [SocialPostController::class, 'draft'])->middleware('throttle:20,1')->name('social-posts.draft');
    Route::get('social-posts/{socialPost}', [SocialPostController::class, 'show'])->whereNumber('socialPost')->name('social-posts.show');
    Route::patch('social-posts/{socialPost}', [SocialPostController::class, 'update'])->whereNumber('socialPost')->name('social-posts.update');
    Route::post('social-posts/{socialPost}/approve', [SocialPostController::class, 'approve'])->whereNumber('socialPost')
        ->middleware('throttle:20,1')->name('social-posts.approve');
    Route::post('social-posts/{socialPost}/discard', [SocialPostController::class, 'discard'])->whereNumber('socialPost')->name('social-posts.discard');
});

Route::middleware('role:admin')->group(function () {
    Route::get('settings/social', [SocialAccountController::class, 'status'])->name('settings.social.status');
    Route::post('settings/social/linkedin/authorize', [SocialAccountController::class, 'authorize'])->name('settings.social.authorize');
    Route::post('settings/social/linkedin/callback', [SocialAccountController::class, 'callback'])->name('settings.social.callback');
    Route::post('settings/social/linkedin/disconnect', [SocialAccountController::class, 'disconnect'])->name('settings.social.disconnect');
    Route::get('settings/social/linkedin/organizations', [SocialAccountController::class, 'organizations'])->name('settings.social.organizations');
    Route::post('settings/social/linkedin/organization', [SocialAccountController::class, 'organization'])->name('settings.social.organization');
});
