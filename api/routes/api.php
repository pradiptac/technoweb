<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\Admin\BlogPostController as AdminBlogPostController;
use App\Http\Controllers\Api\V1\Admin\CaseStudyController as AdminCaseStudyController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeArticleController as AdminKnowledgeArticleController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\SolutionController as AdminSolutionController;
use App\Http\Controllers\Api\V1\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\EnquiryController;
use App\Http\Controllers\Api\V1\RedirectController;
use App\Http\Controllers\Api\V1\TicketController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1
|--------------------------------------------------------------------------
| Everything is versioned under /api/v1 so a future breaking change can ship
| as /api/v2 without stranding the deployed frontend.
|
| Three tiers:
|   public   — cacheable reads for the marketing site, no auth
|   portal   — customer, auth:sanctum, always scoped to the signed-in customer
|   admin    — staff, auth:sanctum + role middleware
*/

Route::prefix('v1')->name('api.v1.')->group(function () {

    /* ---------------------------------------------------------- public */

    Route::get('/', fn () => response()->json([
        'version' => 'v1',
        'endpoints' => ['products', 'solutions', 'services', 'industries', 'blog', 'case-studies', 'knowledge-base'],
    ]));

    Route::get('products', [CatalogueController::class, 'products'])->name('products.index');
    Route::get('products/{product}', [CatalogueController::class, 'product'])->name('products.show');
    Route::get('product-categories', [CatalogueController::class, 'categories'])->name('product-categories.index');
    Route::get('product-categories/{category}', [CatalogueController::class, 'category'])->name('product-categories.show');

    Route::get('solutions', [ContentController::class, 'solutions'])->name('solutions.index');
    Route::get('solutions/{solution}', [ContentController::class, 'solution'])->name('solutions.show');

    Route::get('services', [ContentController::class, 'services'])->name('services.index');
    Route::get('services/{service}', [ContentController::class, 'service'])->name('services.show');

    Route::get('industries', [ContentController::class, 'industries'])->name('industries.index');
    Route::get('industries/{industry}', [ContentController::class, 'industry'])->name('industries.show');

    Route::get('blog', [ContentController::class, 'posts'])->name('blog.index');
    Route::get('blog/{post}', [ContentController::class, 'post'])->name('blog.show');

    Route::get('case-studies', [ContentController::class, 'caseStudies'])->name('case-studies.index');
    Route::get('case-studies/{caseStudy}', [ContentController::class, 'caseStudy'])->name('case-studies.show');

    Route::get('knowledge-base', [ContentController::class, 'knowledgeArticles'])->name('kb.index');
    Route::get('knowledge-base/{article}', [ContentController::class, 'knowledgeArticle'])->name('kb.show');

    Route::get('ticket-categories', [ContentController::class, 'ticketCategories'])->name('ticket-categories.index');

    Route::get('redirects/lookup', [RedirectController::class, 'lookup'])->name('redirects.lookup');

    // Write endpoints open to the public are throttled hard.
    Route::post('enquiries', [EnquiryController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('enquiries.store');

    /* ------------------------------------------------------ portal auth */

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('auth.login');

    Route::post('admin/auth/login', [AdminAuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('admin.auth.login');

    Route::middleware('auth:sanctum')->group(function () {

        /* ------------------------------------------------ customer portal */

        // Guarded as customer-only: these endpoints authorise by comparing
        // the caller's id against a ticket's customer_id, and a staff id is
        // drawn from a different table. Staff have /admin equivalents.
        Route::middleware('customer')->group(function () {
            Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
            Route::get('auth/me', [AuthController::class, 'me'])->name('auth.me');
            Route::patch('auth/profile', [AuthController::class, 'updateProfile'])->name('auth.profile');

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

        /* --------------------------------------------------------- admin */

        Route::prefix('admin')->name('admin.')->group(function () {
            // Any authenticated, active staff member — not role-gated, since
            // every role needs to be able to check its own session.
            Route::post('auth/logout', [AdminAuthController::class, 'logout'])->name('auth.logout');
            Route::get('auth/me', [AdminAuthController::class, 'me'])->name('auth.me');

            Route::middleware('role:support_engineer')->group(function () {
                Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
                Route::get('users', [AdminUserController::class, 'index'])->name('users.index');
                Route::get('tickets', [AdminTicketController::class, 'index'])->name('tickets.index');
                Route::get('tickets/{ticket}', [AdminTicketController::class, 'show'])->name('tickets.show');
                Route::patch('tickets/{ticket}', [AdminTicketController::class, 'update'])->name('tickets.update');
                Route::post('tickets/{ticket}/reply', [AdminTicketController::class, 'reply'])->name('tickets.reply');
                Route::get('ticket-attachments/{attachment}', [AdminTicketController::class, 'downloadAttachment'])
                    ->name('ticket-attachments.download');
            });

            Route::middleware('role:content_manager')->group(function () {
                // Bound by id, not slug. Sluggable::getRouteKeyName() returns
                // 'slug', which breaks the moment the edit form changes the
                // slug it is addressed by.
                Route::get('blog-posts', [AdminBlogPostController::class, 'index'])->name('blog-posts.index');
                Route::post('blog-posts', [AdminBlogPostController::class, 'store'])->name('blog-posts.store');
                Route::get('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'show'])->name('blog-posts.show');
                Route::patch('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'update'])->name('blog-posts.update');
                Route::delete('blog-posts/{blog_post:id}', [AdminBlogPostController::class, 'destroy'])->name('blog-posts.destroy');

                Route::get('industries', [AdminCaseStudyController::class, 'industries'])->name('industries.index');
                Route::get('products', [AdminSolutionController::class, 'products'])->name('products.index');

                Route::get('solutions', [AdminSolutionController::class, 'index'])->name('solutions.index');
                Route::post('solutions', [AdminSolutionController::class, 'store'])->name('solutions.store');
                Route::get('solutions/{solution:id}', [AdminSolutionController::class, 'show'])->name('solutions.show');
                Route::patch('solutions/{solution:id}', [AdminSolutionController::class, 'update'])->name('solutions.update');
                Route::delete('solutions/{solution:id}', [AdminSolutionController::class, 'destroy'])->name('solutions.destroy');
                Route::get('case-studies', [AdminCaseStudyController::class, 'index'])->name('case-studies.index');
                Route::post('case-studies', [AdminCaseStudyController::class, 'store'])->name('case-studies.store');
                Route::get('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'show'])->name('case-studies.show');
                Route::patch('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'update'])->name('case-studies.update');
                Route::delete('case-studies/{case_study:id}', [AdminCaseStudyController::class, 'destroy'])->name('case-studies.destroy');

                Route::get('knowledge-categories', [AdminKnowledgeArticleController::class, 'categories'])
                    ->name('knowledge-categories.index');
                Route::get('knowledge-articles', [AdminKnowledgeArticleController::class, 'index'])->name('knowledge-articles.index');
                Route::post('knowledge-articles', [AdminKnowledgeArticleController::class, 'store'])->name('knowledge-articles.store');
                Route::get('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'show'])->name('knowledge-articles.show');
                Route::patch('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'update'])->name('knowledge-articles.update');
                Route::delete('knowledge-articles/{knowledge_article:id}', [AdminKnowledgeArticleController::class, 'destroy'])->name('knowledge-articles.destroy');

                Route::get('media', [MediaController::class, 'index'])->name('media.index');
                Route::post('media', [MediaController::class, 'store'])->name('media.store');
                Route::delete('media/{medium:id}', [MediaController::class, 'destroy'])->name('media.destroy');
            });

            // Phase 3 mounts the rest of the CMS CRUD here behind
            // role:content_manager, and the SEO manager behind role:seo_manager.
        });
    });
});
