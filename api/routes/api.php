<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\Admin\BlogPostController as AdminBlogPostController;
use App\Http\Controllers\Api\V1\Admin\BrandController as AdminBrandController;
use App\Http\Controllers\Api\V1\Admin\CaseStudyController as AdminCaseStudyController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\FaqController as AdminFaqController;
use App\Http\Controllers\Api\V1\Admin\IndustryController as AdminIndustryController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeArticleController as AdminKnowledgeArticleController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\PageController as AdminPageController;
use App\Http\Controllers\Api\V1\Admin\ProductCategoryController as AdminProductCategoryController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\RedirectController as AdminRedirectController;
use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\V1\Admin\SolutionController as AdminSolutionController;
use App\Http\Controllers\Api\V1\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Api\V1\Admin\UserAdminController;
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

    // Standalone pages — privacy, terms, downloads. Registered after the
    // named content routes so it can never shadow one.
    Route::get('pages/{page}', [ContentController::class, 'page'])->name('pages.show');

    Route::get('ticket-categories', [ContentController::class, 'ticketCategories'])->name('ticket-categories.index');

    Route::get('settings', [ContentController::class, 'settings'])->name('settings.index');

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

            // Settings sit with the administrator, not the content manager —
            // they are site-wide configuration rather than content.
            Route::middleware('role:admin')->group(function () {
                Route::get('settings', [AdminSettingController::class, 'index'])->name('settings.index');
                Route::patch('settings', [AdminSettingController::class, 'update'])->name('settings.update');
                // Clearing a credential is its own action: a blank save means
                // "unchanged", because the form can never show the current one.
                Route::post('settings/clear-secret', [AdminSettingController::class, 'clearSecret'])->name('settings.clear-secret');

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

            // SEO metadata overview and the redirect table. An admin passes
            // this implicitly, as with every other role check.
            Route::middleware('role:seo_manager')->group(function () {
                Route::get('seo', [SeoController::class, 'index'])->name('seo.index');
                Route::patch('seo/sitemap', [SeoController::class, 'updateSitemap'])->name('seo.sitemap');

                Route::get('redirects', [AdminRedirectController::class, 'index'])->name('redirects.index');
                Route::post('redirects', [AdminRedirectController::class, 'store'])->name('redirects.store');
                Route::get('redirects/{redirect:id}', [AdminRedirectController::class, 'show'])->name('redirects.show');
                Route::patch('redirects/{redirect:id}', [AdminRedirectController::class, 'update'])->name('redirects.update');
                Route::delete('redirects/{redirect:id}', [AdminRedirectController::class, 'destroy'])->name('redirects.destroy');
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

                // This index is the CRUD list and the picker other forms use.
                // One endpoint per resource — the same call made for industries.
                Route::get('products', [AdminProductController::class, 'index'])->name('products.index');
                Route::post('products', [AdminProductController::class, 'store'])->name('products.store');
                Route::get('products/{product:id}', [AdminProductController::class, 'show'])->name('products.show');
                Route::patch('products/{product:id}', [AdminProductController::class, 'update'])->name('products.update');
                Route::delete('products/{product:id}', [AdminProductController::class, 'destroy'])->name('products.destroy');

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

                Route::get('services', [AdminServiceController::class, 'index'])->name('services.index');
                Route::post('services', [AdminServiceController::class, 'store'])->name('services.store');
                Route::get('services/{service:id}', [AdminServiceController::class, 'show'])->name('services.show');
                Route::patch('services/{service:id}', [AdminServiceController::class, 'update'])->name('services.update');
                Route::delete('services/{service:id}', [AdminServiceController::class, 'destroy'])->name('services.destroy');

                Route::get('industries', [AdminIndustryController::class, 'index'])->name('industries.index');
                Route::post('industries', [AdminIndustryController::class, 'store'])->name('industries.store');
                Route::get('industries/{industry:id}', [AdminIndustryController::class, 'show'])->name('industries.show');
                Route::patch('industries/{industry:id}', [AdminIndustryController::class, 'update'])->name('industries.update');
                Route::delete('industries/{industry:id}', [AdminIndustryController::class, 'destroy'])->name('industries.destroy');

                Route::get('pages', [AdminPageController::class, 'index'])->name('pages.index');
                Route::post('pages', [AdminPageController::class, 'store'])->name('pages.store');
                Route::get('pages/{page:id}', [AdminPageController::class, 'show'])->name('pages.show');
                Route::patch('pages/{page:id}', [AdminPageController::class, 'update'])->name('pages.update');
                Route::delete('pages/{page:id}', [AdminPageController::class, 'destroy'])->name('pages.destroy');

                Route::get('brands', [AdminBrandController::class, 'index'])->name('brands.index');
                Route::post('brands', [AdminBrandController::class, 'store'])->name('brands.store');
                Route::get('brands/{brand:id}', [AdminBrandController::class, 'show'])->name('brands.show');
                Route::patch('brands/{brand:id}', [AdminBrandController::class, 'update'])->name('brands.update');
                Route::delete('brands/{brand:id}', [AdminBrandController::class, 'destroy'])->name('brands.destroy');

                // Index doubles as the parent picker and the product form's
                // category select — one endpoint per resource, as with industries.
                Route::get('product-categories', [AdminProductCategoryController::class, 'index'])->name('product-categories.index');
                Route::post('product-categories', [AdminProductCategoryController::class, 'store'])->name('product-categories.store');
                Route::get('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'show'])->name('product-categories.show');
                Route::patch('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'update'])->name('product-categories.update');
                Route::delete('product-categories/{product_category:id}', [AdminProductCategoryController::class, 'destroy'])->name('product-categories.destroy');

                // Owners first: the picker needs it before the form can save.
                Route::get('faq-owners', [AdminFaqController::class, 'owners'])->name('faq-owners.index');
                Route::get('faqs', [AdminFaqController::class, 'index'])->name('faqs.index');
                Route::post('faqs', [AdminFaqController::class, 'store'])->name('faqs.store');
                Route::get('faqs/{faq:id}', [AdminFaqController::class, 'show'])->name('faqs.show');
                Route::patch('faqs/{faq:id}', [AdminFaqController::class, 'update'])->name('faqs.update');
                Route::delete('faqs/{faq:id}', [AdminFaqController::class, 'destroy'])->name('faqs.destroy');

                Route::get('media', [MediaController::class, 'index'])->name('media.index');
                Route::post('media', [MediaController::class, 'store'])->name('media.store');
                Route::delete('media/{medium:id}', [MediaController::class, 'destroy'])->name('media.destroy');
            });

            // Phase 3 mounts the rest of the CMS CRUD here behind
            // role:content_manager, and the SEO manager behind role:seo_manager.
        });
    });
});
