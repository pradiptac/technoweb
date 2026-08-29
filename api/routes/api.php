<?php

use App\Http\Controllers\Api\V1\Admin\ActivityController;
use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\Admin\BlogPostController as AdminBlogPostController;
use App\Http\Controllers\Api\V1\Admin\BrandController as AdminBrandController;
use App\Http\Controllers\Api\V1\Admin\CaseStudyController as AdminCaseStudyController;
use App\Http\Controllers\Api\V1\Admin\CustomerAdminController;
use App\Http\Controllers\Api\V1\Admin\DashboardController;
use App\Http\Controllers\Api\V1\Admin\FaqController as AdminFaqController;
use App\Http\Controllers\Api\V1\Admin\FormController as AdminFormController;
use App\Http\Controllers\Api\V1\Admin\IndustryController as AdminIndustryController;
use App\Http\Controllers\Api\V1\Admin\JobApplicationController;
use App\Http\Controllers\Api\V1\Admin\JobOpeningController;
use App\Http\Controllers\Api\V1\Admin\JobReferenceController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeArticleController as AdminKnowledgeArticleController;
use App\Http\Controllers\Api\V1\Admin\LandingPageController as AdminLandingPageController;
use App\Http\Controllers\Api\V1\Admin\LocationController as AdminLocationController;
use App\Http\Controllers\Api\V1\Admin\MailController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\MediaFolderController;
use App\Http\Controllers\Api\V1\Admin\PageController as AdminPageController;
use App\Http\Controllers\Api\V1\Admin\ProductCategoryController as AdminProductCategoryController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\RedirectController as AdminRedirectController;
use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\V1\Admin\MenuController as AdminMenuController;
use App\Http\Controllers\Api\V1\Admin\SliderController as AdminSliderController;
use App\Http\Controllers\Api\V1\Admin\SolutionController as AdminSolutionController;
use App\Http\Controllers\Api\V1\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Api\V1\Admin\UserAdminController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CareersController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\EnquiryController;
use App\Http\Controllers\Api\V1\FormController;
use App\Http\Controllers\Api\V1\LandingPageController;
use App\Http\Controllers\Api\V1\RedirectController;
use App\Http\Controllers\Api\V1\RegistrationController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\SliderController;
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
    Route::get('brands', [CatalogueController::class, 'brands'])->name('brands.index');

    // Carousels, addressed by slug from a [slider] shortcode or the hero.
    Route::get('sliders/{slug}', [SliderController::class, 'show'])->name('sliders.show');

    // Editor-built forms. The submit shares the enquiry throttle: both are an
    // anonymous POST that ends in somebody's inbox.
    Route::get('forms/{slug}', [FormController::class, 'show'])->name('forms.show');
    Route::post('forms/{slug}', [FormController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('forms.store');

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
    Route::get('pages', [ContentController::class, 'pages'])->name('pages.index');
    Route::get('pages/{page}', [ContentController::class, 'page'])->name('pages.show');

    // Site-wide search. Public and uncached — see the note in API.md about
    // why a search response must never be ISR-cached.
    Route::get('search', SearchController::class)->name('search');

    Route::get('ticket-categories', [ContentController::class, 'ticketCategories'])->name('ticket-categories.index');

    /*
     * The navigation for a place in the layout. 404 when no menu is assigned,
     * which is what makes this additive: an install that never opens the menu
     * screen keeps the navigation it has today.
     */
    Route::get('menus/{location}', [ContentController::class, 'menu'])->name('menus.show');

    Route::get('settings', [ContentController::class, 'settings'])->name('settings.index');

    Route::get('redirects/lookup', [RedirectController::class, 'lookup'])->name('redirects.lookup');

    /*
     * Programmatic landing pages.
     *
     * `lookup?path=` rather than a wildcard segment, the same shape as the
     * redirect lookup above and for the same reason: a path contains slashes,
     * and a route parameter told to accept them is one that will eventually
     * accept a slash it should not. It also keeps the whole family — /brands,
     * /brands/{b}/{c}, /locations/{l}/{s} — on one resolution rather than the
     * try-this-then-that that /products/[slug] needs.
     */
    Route::get('landing-pages', [LandingPageController::class, 'index'])->name('landing-pages.index');
    Route::get('landing-pages/lookup', [LandingPageController::class, 'lookup'])->name('landing-pages.lookup');

    // Write endpoints open to the public are throttled hard.
    /* ---------------------------------------------------------- careers */

    Route::get('careers', [CareersController::class, 'index'])->name('careers.index');
    Route::get('careers/{job_opening}', [CareersController::class, 'show'])->name('careers.show');

    /*
     * An application. Throttled hard and bound by slug like every public
     * detail route -- and the controller checks the vacancy is still open
     * before it stores anything, because a tab left across a closing date
     * would otherwise post into a role nobody is hiring for.
     */
    Route::post('careers/{job_opening}/apply', [CareersController::class, 'apply'])
        ->middleware('throttle:5,1')
        ->name('careers.apply');

    Route::post('enquiries', [EnquiryController::class, 'store'])
        ->middleware('throttle:10,1')
        ->name('enquiries.store');

    /* ------------------------------------------------------ portal auth */

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('auth.login');

    /*
     * Sign in by one-time code — the default way in, with the password form a
     * link away.
     *
     * `request-code` is throttled like registration rather than like login,
     * because it sends mail to an address the caller chose: unthrottled, it is
     * a way to have this site spam somebody. Both answer identically whether or
     * not the address has an account behind it.
     */
    Route::post('auth/request-code', [AuthController::class, 'requestCode'])
        ->middleware('throttle:5,1')
        ->name('auth.request-code');
    Route::post('auth/verify-code', [AuthController::class, 'verifyCode'])
        ->middleware('throttle:10,1')
        ->name('auth.verify-code');

    /*
     * Self-registration.
     *
     * Throttled harder than login, because all three send mail to an address
     * the caller chose and none of them requires a credential. Every response
     * is identical whether or not the address is known — see
     * RegistrationController::sameAnswer().
     */
    Route::post('auth/register', [RegistrationController::class, 'register'])
        ->middleware('throttle:5,1')
        ->name('auth.register');
    Route::post('auth/verify-email', [RegistrationController::class, 'verify'])
        ->middleware('throttle:10,1')
        ->name('auth.verify-email');
    Route::post('auth/resend-verification', [RegistrationController::class, 'resendVerification'])
        ->middleware('throttle:5,1')
        ->name('auth.resend-verification');

    /*
     * Password reset, both principals.
     *
     * Throttled harder than login: this one sends mail to an address the
     * caller chose, so an unthrottled endpoint is a way to have the site spam
     * somebody. The responses are deliberately identical whether or not the
     * address exists — see ResetsPasswords.
     */
    Route::post('auth/forgot-password', [AuthController::class, 'forgotPassword'])
        ->middleware('throttle:5,1')
        ->name('auth.forgot-password');
    Route::post('auth/reset-password', [AuthController::class, 'resetPassword'])
        ->middleware('throttle:10,1')
        ->name('auth.reset-password');

    Route::post('admin/auth/forgot-password', [AdminAuthController::class, 'forgotPassword'])
        ->middleware('throttle:5,1')
        ->name('admin.auth.forgot-password');
    Route::post('admin/auth/reset-password', [AdminAuthController::class, 'resetPassword'])
        ->middleware('throttle:10,1')
        ->name('admin.auth.reset-password');

    Route::post('admin/auth/login', [AdminAuthController::class, 'login'])
        ->middleware('throttle:10,1')
        ->name('admin.auth.login');

    /*
     * The console's codes, and a separate audience from the portal's.
     *
     * A code minted at `auth/request-code` is worthless here and the reverse,
     * which is enforced in `SignInCodes` rather than by these two routes
     * happening to live in different files.
     */
    Route::post('admin/auth/request-code', [AdminAuthController::class, 'requestCode'])
        ->middleware('throttle:5,1')
        ->name('admin.auth.request-code');
    Route::post('admin/auth/verify-code', [AdminAuthController::class, 'verifyCode'])
        ->middleware('throttle:10,1')
        ->name('admin.auth.verify-code');

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

        /*
         * `staff` on the whole group, not an instanceof check per route.
         *
         * logout, me and the change-password endpoint are reachable by every
         * role by design, so `role:` cannot guard them — and each was carrying
         * its own inline check. The third was added without one, and a
         * customer token could call it. A middleware on the group cannot be
         * forgotten.
         */
        /*
         * `activity` sits beside `staff` on the whole group.
         *
         * What it records is a decision taken in one place
         * (App\Support\ActivityLogger) rather than at each of the 67 write
         * routes below — a per-route call is a per-route omission waiting to
         * happen, and the one that gets omitted is the one somebody comes
         * looking for.
         */
        Route::prefix('admin')->middleware(['staff', 'activity'])->name('admin.')->group(function () {
            // Any authenticated, active staff member — not role-gated, since
            // every role needs to be able to check its own session.
            Route::post('auth/logout', [AdminAuthController::class, 'logout'])->name('auth.logout');
            Route::get('auth/me', [AdminAuthController::class, 'me'])->name('auth.me');
            // Outside every role: a support engineer must be able to change
            // their own password without asking an administrator to do it for
            // them, which would mean the administrator knowing it.
            Route::patch('auth/password', [AdminAuthController::class, 'changePassword'])->name('auth.password');

            Route::middleware('role:support_engineer')->group(function () {
                Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
                Route::get('users', [AdminUserController::class, 'index'])->name('users.index');
                Route::get('tickets', [AdminTicketController::class, 'index'])->name('tickets.index');
                Route::get('tickets/{ticket}', [AdminTicketController::class, 'show'])->name('tickets.show');
                Route::patch('tickets/{ticket}', [AdminTicketController::class, 'update'])->name('tickets.update');
                Route::post('tickets/{ticket}/reply', [AdminTicketController::class, 'reply'])->name('tickets.reply');
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

            // Settings sit with the administrator, not the content manager —
            // they are site-wide configuration rather than content.
            Route::middleware('role:admin')->group(function () {
                /*
                 * Read-only, and deliberately so. No store, no update, no destroy:
                 * the only thing that removes a row is the scheduled retention
                 * prune, and a log whose subject can edit it is evidence of
                 * nothing.
                 */
                Route::get('activity', [ActivityController::class, 'index'])->name('activity.index');
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
                /*
                 * One record, re-scored. Declared *after* `seo/sitemap` so the
                 * literal segment is matched first — `{type}` would otherwise
                 * happily swallow "sitemap" and this would shadow it.
                 */
                Route::get('seo/{type}/{id}', [SeoController::class, 'show'])->name('seo.show');

                Route::get('redirects', [AdminRedirectController::class, 'index'])->name('redirects.index');
                Route::post('redirects', [AdminRedirectController::class, 'store'])->name('redirects.store');
                Route::get('redirects/{redirect:id}', [AdminRedirectController::class, 'show'])->name('redirects.show');
                Route::patch('redirects/{redirect:id}', [AdminRedirectController::class, 'update'])->name('redirects.update');
                Route::delete('redirects/{redirect:id}', [AdminRedirectController::class, 'destroy'])->name('redirects.destroy');

                /*
                 * Landing pages and the places they can be about.
                 *
                 * Under seo_manager rather than content_manager on purpose. A
                 * landing page is not a piece of content — it is a decision
                 * about which queries this site competes for, and the cost of
                 * getting it wrong lands on the ranking of pages nobody
                 * touched. The role that already owns the redirect table and
                 * the SEO overview is the one that should own this.
                 *
                 * `opportunities` is declared before `{landing_page:id}` or the
                 * literal would be captured as an id.
                 */
                Route::get('landing-pages/opportunities', [AdminLandingPageController::class, 'opportunities'])->name('landing-pages.opportunities');
                Route::get('landing-pages', [AdminLandingPageController::class, 'index'])->name('landing-pages.index');
                Route::post('landing-pages', [AdminLandingPageController::class, 'store'])->name('landing-pages.store');
                Route::get('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'show'])->name('landing-pages.show');
                Route::patch('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'update'])->name('landing-pages.update');
                Route::delete('landing-pages/{landing_page:id}', [AdminLandingPageController::class, 'destroy'])->name('landing-pages.destroy');

                Route::get('locations', [AdminLocationController::class, 'index'])->name('locations.index');
                Route::post('locations', [AdminLocationController::class, 'store'])->name('locations.store');
                Route::get('locations/{location:id}', [AdminLocationController::class, 'show'])->name('locations.show');
                Route::patch('locations/{location:id}', [AdminLocationController::class, 'update'])->name('locations.update');
                Route::delete('locations/{location:id}', [AdminLocationController::class, 'destroy'])->name('locations.destroy');
            });

            Route::middleware('role:content_manager')->group(function () {

                /*
                 * Vacancies are content: a careers page is a page. The people
                 * who apply are not, and live under role:support_engineer.
                 *
                 * Bound by **id**, not slug. Sluggable::getRouteKeyName()
                 * returns the slug, so {job_opening} looks a vacancy up by slug
                 * -- and the edit form is the thing that changes the slug it is
                 * addressed by. Every other CMS entity here spells :id out for
                 * that reason; this one did not, and every update 404'd.
                 */
                Route::get('job-openings', [JobOpeningController::class, 'index'])->name('job-openings.index');
                Route::post('job-openings', [JobOpeningController::class, 'store'])->name('job-openings.store');
                Route::get('job-openings/{job_opening:id}', [JobOpeningController::class, 'show'])->name('job-openings.show');
                Route::patch('job-openings/{job_opening:id}', [JobOpeningController::class, 'update'])->name('job-openings.update');
                Route::delete('job-openings/{job_opening:id}', [JobOpeningController::class, 'destroy'])->name('job-openings.destroy');

                Route::get('job-qualifications', [JobReferenceController::class, 'qualifications'])->name('job-qualifications.index');
                Route::post('job-qualifications', [JobReferenceController::class, 'storeQualification'])->name('job-qualifications.store');
                Route::patch('job-qualifications/{job_qualification}', [JobReferenceController::class, 'updateQualification'])->name('job-qualifications.update');
                Route::delete('job-qualifications/{job_qualification}', [JobReferenceController::class, 'destroyQualification'])->name('job-qualifications.destroy');
                Route::get('job-experience-levels', [JobReferenceController::class, 'experienceLevels'])->name('job-experience-levels.index');
                Route::post('job-experience-levels', [JobReferenceController::class, 'storeExperienceLevel'])->name('job-experience-levels.store');
                Route::patch('job-experience-levels/{job_experience_level}', [JobReferenceController::class, 'updateExperienceLevel'])->name('job-experience-levels.update');
                Route::delete('job-experience-levels/{job_experience_level}', [JobReferenceController::class, 'destroyExperienceLevel'])->name('job-experience-levels.destroy');
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

                // Bound by id, not slug: the edit form can change the slug it
                // is addressed by, the same reason every other CMS entity does.
                Route::get('sliders', [AdminSliderController::class, 'index'])->name('sliders.index');
                Route::post('sliders', [AdminSliderController::class, 'store'])->name('sliders.store');
                Route::get('sliders/{slider:id}', [AdminSliderController::class, 'show'])->name('sliders.show');
                Route::patch('sliders/{slider:id}', [AdminSliderController::class, 'update'])->name('sliders.update');
                Route::delete('sliders/{slider:id}', [AdminSliderController::class, 'destroy'])->name('sliders.destroy');

                /*
                 * Menus. Bound by id like every other CMS entity, and under
                 * `content_manager` rather than `admin`: deciding what the
                 * navigation says is editorial work, and it is the same role
                 * that already owns what every one of those links points at.
                 */
                // Above `menus/{menu}`: Laravel matches in declaration order, so
                // underneath it this binds {menu} to the literal "targets" and
                // 404s from model binding — the trap `media/move` documents.
                Route::get('menu-targets', [AdminMenuController::class, 'targets'])->name('menus.targets');
                Route::get('menus', [AdminMenuController::class, 'index'])->name('menus.index');
                Route::post('menus', [AdminMenuController::class, 'store'])->name('menus.store');
                Route::get('menus/{menu:id}', [AdminMenuController::class, 'show'])->name('menus.show');
                Route::patch('menus/{menu:id}', [AdminMenuController::class, 'update'])->name('menus.update');
                Route::delete('menus/{menu:id}', [AdminMenuController::class, 'destroy'])->name('menus.destroy');

                Route::get('forms', [AdminFormController::class, 'index'])->name('forms.index');
                Route::post('forms', [AdminFormController::class, 'store'])->name('forms.store');
                Route::get('forms/{form:id}', [AdminFormController::class, 'show'])->name('forms.show');
                Route::patch('forms/{form:id}', [AdminFormController::class, 'update'])->name('forms.update');
                Route::delete('forms/{form:id}', [AdminFormController::class, 'destroy'])->name('forms.destroy');
                Route::get('forms/{form:id}/submissions', [AdminFormController::class, 'submissions'])->name('forms.submissions');

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

                Route::get('media-folders', [MediaFolderController::class, 'index'])->name('media-folders.index');
                Route::post('media-folders', [MediaFolderController::class, 'store'])->name('media-folders.store');
                Route::delete('media-folders/{mediaFolder:id}', [MediaFolderController::class, 'destroy'])->name('media-folders.destroy');

                Route::get('media', [MediaController::class, 'index'])->name('media.index');
                Route::post('media', [MediaController::class, 'store'])->name('media.store');
                // Before the {medium} routes, or "download" is read as an id.
                /*
                 * The bulk routes sit *above* `media/{medium:id}` on purpose.
                 *
                 * Laravel matches in declaration order, so `media/move` under
                 * the parameterised route would bind `{medium:id}` to the
                 * literal string "move" and answer 404 from model binding —
                 * a routing bug that reads as a missing record.
                 */
                Route::post('media/move', [MediaController::class, 'move'])->name('media.move');
                Route::post('media/copy', [MediaController::class, 'copy'])->name('media.copy');
                Route::post('media/delete', [MediaController::class, 'bulkDestroy'])->name('media.bulk-destroy');

                Route::get('media/{medium:id}/download', [MediaController::class, 'download'])->name('media.download');
                Route::post('media/{medium:id}/resize', [MediaController::class, 'resize'])->name('media.resize');
                Route::post('media/{medium:id}/crop', [MediaController::class, 'crop'])->name('media.crop');
                Route::post('media/{medium:id}/transform', [MediaController::class, 'transform'])->name('media.transform');
                Route::post('media/{medium:id}/replace', [MediaController::class, 'replace'])->name('media.replace');
                Route::get('media/{medium:id}/versions', [MediaController::class, 'versions'])->name('media.versions');
                Route::post('media/{medium:id}/versions/{version}/restore', [MediaController::class, 'restoreVersion'])->name('media.versions.restore');

                /*
                 * The bin. `restore` and `purge` take a plain {id} rather than
                 * a bound model, because route-model binding cannot find a
                 * soft-deleted row — it applies the default scope and answers
                 * 404 for every file in the bin, which is every file these two
                 * routes exist for.
                 */
                Route::post('media/trash/empty', [MediaController::class, 'emptyTrash'])->name('media.trash.empty');
                Route::post('media/{id}/restore', [MediaController::class, 'restore'])->name('media.restore');
                Route::delete('media/{id}/purge', [MediaController::class, 'purge'])->name('media.purge');

                Route::patch('media/{medium:id}', [MediaController::class, 'update'])->name('media.update');
                Route::delete('media/{medium:id}', [MediaController::class, 'destroy'])->name('media.destroy');
            });

            // Phase 3 mounts the rest of the CMS CRUD here behind
            // role:content_manager, and the SEO manager behind role:seo_manager.
        });
    });
});
