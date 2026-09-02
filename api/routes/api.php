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
use App\Http\Controllers\Api\V1\Admin\GalleryController as AdminGalleryController;
use App\Http\Controllers\Api\V1\Admin\IndustryController as AdminIndustryController;
use App\Http\Controllers\Api\V1\Admin\JobApplicationController;
use App\Http\Controllers\Api\V1\Admin\JobOpeningController;
use App\Http\Controllers\Api\V1\Admin\JobReferenceController;
use App\Http\Controllers\Api\V1\Admin\KnowledgeArticleController as AdminKnowledgeArticleController;
use App\Http\Controllers\Api\V1\Admin\LandingPageController as AdminLandingPageController;
use App\Http\Controllers\Api\V1\Admin\LeadController;
use App\Http\Controllers\Api\V1\Admin\LocationController as AdminLocationController;
use App\Http\Controllers\Api\V1\Admin\MailController;
use App\Http\Controllers\Api\V1\Admin\MediaController;
use App\Http\Controllers\Api\V1\Admin\MediaFolderController;
use App\Http\Controllers\Api\V1\Admin\MenuController as AdminMenuController;
use App\Http\Controllers\Api\V1\Admin\NewsletterCampaignController as AdminNewsletterCampaignController;
use App\Http\Controllers\Api\V1\Admin\NewsletterGroupController as AdminNewsletterGroupController;
use App\Http\Controllers\Api\V1\Admin\NewsletterImportController as AdminNewsletterImportController;
use App\Http\Controllers\Api\V1\Admin\NewsletterReportController as AdminNewsletterReportController;
use App\Http\Controllers\Api\V1\Admin\NewsletterSubscriberController as AdminNewsletterSubscriberController;
use App\Http\Controllers\Api\V1\Admin\NewsletterSuppressionController as AdminNewsletterSuppressionController;
use App\Http\Controllers\Api\V1\Admin\NewsletterTemplateController as AdminNewsletterTemplateController;
use App\Http\Controllers\Api\V1\Admin\PageController as AdminPageController;
use App\Http\Controllers\Api\V1\Admin\ProductCategoryController as AdminProductCategoryController;
use App\Http\Controllers\Api\V1\Admin\ProductController as AdminProductController;
use App\Http\Controllers\Api\V1\Admin\RedirectController as AdminRedirectController;
use App\Http\Controllers\Api\V1\Admin\SeoController;
use App\Http\Controllers\Api\V1\Admin\ServiceController as AdminServiceController;
use App\Http\Controllers\Api\V1\Admin\SettingController as AdminSettingController;
use App\Http\Controllers\Api\V1\Admin\SliderController as AdminSliderController;
use App\Http\Controllers\Api\V1\Admin\SolutionController as AdminSolutionController;
use App\Http\Controllers\Api\V1\Admin\Store\CategoryController as AdminStoreCategoryController;
use App\Http\Controllers\Api\V1\Admin\Store\CodeController as AdminStoreCodeController;
use App\Http\Controllers\Api\V1\Admin\Store\CouponController as AdminStoreCouponController;
use App\Http\Controllers\Api\V1\Admin\Store\DashboardController as AdminStoreDashboardController;
use App\Http\Controllers\Api\V1\Admin\Store\OrderController as AdminStoreOrderController;
use App\Http\Controllers\Api\V1\Admin\Store\ProductController as AdminStoreProductController;
use App\Http\Controllers\Api\V1\Admin\Store\ReportController as AdminStoreReportController;
use App\Http\Controllers\Api\V1\Admin\Store\StockController as AdminStoreStockController;
use App\Http\Controllers\Api\V1\Admin\TicketController as AdminTicketController;
use App\Http\Controllers\Api\V1\Admin\UserAdminController;
use App\Http\Controllers\Api\V1\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CareersController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\CustomerOrderController;
use App\Http\Controllers\Api\V1\EnquiryController;
use App\Http\Controllers\Api\V1\FormController;
use App\Http\Controllers\Api\V1\GalleryController;
use App\Http\Controllers\Api\V1\LandingPageController;
use App\Http\Controllers\Api\V1\NewsletterController;
use App\Http\Controllers\Api\V1\OrderCodeController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\RedirectController;
use App\Http\Controllers\Api\V1\RegistrationController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\SliderController;
use App\Http\Controllers\Api\V1\StoreController;
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

    /*
     * The shop.
     *
     * Its own segment and its own controller, because what the store sells is
     * maintained separately from what the site advertises — two lists, two
     * lifecycles. `/store/products/{slug}` and `/store/categories/{slug}` are
     * spelled out rather than collapsed into `/store/{slug}`: the catalogue
     * already pays a documented cost for one segment resolving two kinds of
     * record, and this deliberately does not repeat it.
     */
    Route::get('store/products', [StoreController::class, 'products'])->name('store.products.index');
    Route::get('store/products/{storeProduct:slug}', [StoreController::class, 'product'])->name('store.products.show');
    Route::get('store/categories', [StoreController::class, 'categories'])->name('store.categories.index');
    Route::get('store/categories/{storeCategory:slug}', [StoreController::class, 'category'])->name('store.categories.show');

    /*
     * The basket.
     *
     * Public and unauthenticated, because guest checkout is a requirement — a
     * cart that needed an account would put every purchase behind the approval
     * queue. It is addressed by a token in `X-Cart-Token`, which the Next
     * server holds in an httpOnly cookie and forwards; browser JavaScript never
     * sees it, exactly as with the portal session.
     *
     * Throttled generously: adding to a basket is a thing people do quickly and
     * repeatedly, and a limit that bites during ordinary shopping is a limit
     * that costs a sale.
     */
    Route::get('cart', [CartController::class, 'show'])->name('cart.show');
    Route::post('cart/items', [CartController::class, 'addItem'])
        ->middleware('throttle:60,1')->name('cart.items.store');
    Route::patch('cart/items/{item}', [CartController::class, 'updateItem'])
        ->middleware('throttle:60,1')->name('cart.items.update');
    Route::delete('cart/items/{item}', [CartController::class, 'removeItem'])
        ->middleware('throttle:60,1')->name('cart.items.destroy');
    Route::delete('cart', [CartController::class, 'clear'])
        ->middleware('throttle:30,1')->name('cart.clear');

    /*
     * Coupons on the basket.
     *
     * Throttled harder than the rest of the cart: typing codes at a shop until
     * one works is the one thing somebody does to this endpoint that is not
     * shopping, and a code space is small enough to be worth walking.
     */
    Route::post('cart/coupon', [CartController::class, 'applyCoupon'])
        ->middleware('throttle:15,1')->name('cart.coupon.apply');
    Route::delete('cart/coupon', [CartController::class, 'removeCoupon'])
        ->middleware('throttle:30,1')->name('cart.coupon.remove');

    /*
     * The checkout.
     *
     * Public, because guest checkout is a requirement — a portal account is
     * created automatically once the money arrives, and making somebody wait on
     * the approval queue to buy something would be absurd.
     *
     * The order is read back by `access_token`, never by its number alone: the
     * number is printed on paperwork, quoted on the telephone and sequential,
     * so anything it unlocked would be unlocked for whoever counted upwards.
     *
     * Throttled hard. Placing an order writes rows and locks stock, and there
     * is no legitimate reason to do it ten times a minute.
     */
    Route::post('checkout', [CheckoutController::class, 'store'])
        ->middleware('throttle:10,1')->name('checkout.store');
    Route::get('orders/{orderNumber}', [CheckoutController::class, 'show'])
        ->middleware('throttle:60,1')->name('orders.show');

    /*
     * Payment.
     *
     * `session` and `verify` are addressed by the order's token, like reading
     * the order itself. The **webhook is not**, and cannot be: the caller is the
     * gateway's servers, and its signature is the authentication.
     *
     * The webhook is deliberately un-throttled. A gateway retries on anything
     * that is not a 2xx, so a rate limit turns a busy minute into an escalating
     * retry storm — and the handler is idempotent, which is the actual defence.
     */
    Route::post('orders/{orderNumber}/pay', [PaymentController::class, 'session'])
        ->middleware('throttle:20,1')->name('orders.pay');
    Route::post('orders/{orderNumber}/verify', [PaymentController::class, 'verify'])
        ->middleware('throttle:20,1')->name('orders.verify');
    Route::post('payments/{gateway}/webhook', [PaymentController::class, 'webhook'])
        ->name('payments.webhook');

    /*
     * Revealing an activation code.
     *
     * A POST because it *records* the reveal — and because a GET would be
     * pre-fetched, proxy-logged with its URL and cached, none of which is
     * acceptable for the thing being handed over. Throttled: a code is revealed
     * a handful of times by the person who bought it, never sixty.
     */
    Route::post('orders/{orderNumber}/items/{item}/reveal', [OrderCodeController::class, 'reveal'])
        ->middleware('throttle:20,1')->name('orders.reveal');

    // Carousels, addressed by slug from a [slider] shortcode or the hero.
    Route::get('sliders/{slug}', [SliderController::class, 'show'])->name('sliders.show');

    // Picture sets, addressed by slug from a [gallery] shortcode. 404 when
    // unpublished or empty, exactly like a slider.
    Route::get('galleries/{slug}', [GalleryController::class, 'show'])->name('galleries.show');

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

    /*
     * The newsletter's public surface.
     *
     * `subscribe` is throttled and answers 202 for everything, the rule
     * `/auth/register` follows — anything else turns the form into a
     * membership oracle. The two tracking endpoints are throttled far higher,
     * because one mailing produces thousands of legitimate hits in the first
     * minutes and a limit that bit there would silently lose the opens it was
     * meant to protect.
     */
    Route::post('newsletter/subscribe', [NewsletterController::class, 'subscribe'])
        ->middleware('throttle:10,1')->name('newsletter.subscribe');

    Route::get('newsletter/open/{token}', [NewsletterController::class, 'open'])
        ->middleware('throttle:600,1')->name('newsletter.open');
    Route::get('newsletter/click/{token}/{link}', [NewsletterController::class, 'click'])
        ->middleware('throttle:600,1')->name('newsletter.click');

    /*
     * Unsubscribe, on GET as well as POST.
     *
     * POST is what `List-Unsubscribe-Post` sends, so a mail client's own
     * unsubscribe button works without anybody visiting a page; GET backs the
     * link in the footer. Both are idempotent — a client may fire the POST
     * more than once.
     */
    Route::get('newsletter/unsubscribe/{token}', [NewsletterController::class, 'unsubscribeDetails'])
        ->middleware('throttle:30,1')->name('newsletter.unsubscribe.show');
    Route::post('newsletter/unsubscribe/{token}', [NewsletterController::class, 'unsubscribe'])
        ->middleware('throttle:30,1')->name('newsletter.unsubscribe');

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

            /*
             * The customer's own orders.
             *
             * Under `my/` rather than `orders/`, because `orders/{number}` is
             * already the *guest* route and the two are authorised completely
             * differently — one by a session, the other by a secret in a link.
             * Both are real: most buyers here never sign in, and the ones who
             * do should not have to keep an email to see what they bought.
             */
            Route::get('my/orders', [CustomerOrderController::class, 'index'])->name('my.orders.index');
            Route::get('my/orders/{orderNumber}', [CustomerOrderController::class, 'show'])->name('my.orders.show');

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
            /*
             * The lead pipeline, behind `role:sales_manager`.
             *
             * Its own role for the reason the two below it have theirs: blast
             * radius rather than skill. What this block reads is every
             * enquirer's name, telephone number and what they are planning to
             * spend -- a list of this company's prospects, which is worth more
             * to a competitor than anything else in the console.
             *
             * **The export is declared above `leads/{lead}`.** Laravel matches
             * in declaration order, so underneath it `{lead}` binds to the
             * literal string "export" and model binding answers 404 -- a
             * routing bug that reads as a missing record. The media library's
             * bulk routes are here for the same reason and there is a test for
             * it.
             *
             * There is no `store`: a lead exists because somebody filled in a
             * form, and an endpoint that could invent one would make every
             * figure on the screen unauditable.
             */
            Route::middleware('role:sales_manager')->group(function () {
                Route::get('leads/export', [LeadController::class, 'export'])->name('leads.export');

                Route::get('leads', [LeadController::class, 'index'])->name('leads.index');
                Route::get('leads/{lead}', [LeadController::class, 'show'])->name('leads.show');
                Route::patch('leads/{lead}', [LeadController::class, 'update'])->name('leads.update');
                Route::post('leads/{lead}/notes', [LeadController::class, 'note'])->name('leads.notes.store');
                Route::delete('leads/{lead}', [LeadController::class, 'destroy'])->name('leads.destroy');
            });

            /*
             * The store, behind `role:store_manager`.
             *
             * Its own role rather than `content_manager`, on the same argument
             * `campaign_manager` is made with: blast radius, not skill. This
             * block holds prices, stock and — once they exist — the digital
             * codes, and a mistake in any of the three cannot be taken back
             * once somebody has paid. Whoever runs the shop has no business
             * editing the blog, and whoever edits the blog has no business
             * changing what a switch costs.
             *
             * Bound by **id**, not slug: the edit form changes the slug it is
             * addressed by, so a slug-bound route breaks mid-save.
             */
            Route::middleware('role:store_manager')->group(function () {
                // Everything the shop is doing, in one request. Declared above
                // the parameterised store routes for the same reason
                // `media/move` is: Laravel matches in declaration order.
                Route::get('store/dashboard', AdminStoreDashboardController::class)->name('store.dashboard');

                // Above `store/{anything}` for the same reason `media/move` is:
                // Laravel matches in declaration order.
                Route::get('store/reports', [AdminStoreReportController::class, 'index'])->name('store.reports');
                Route::get('store/reports/export', [AdminStoreReportController::class, 'export'])->name('store.reports.export');

                /*
                 * Stock in and out. `export` and `movements` are declared
                 * above nothing parameterised here, but the order still
                 * matters for the same reason `media/move` does: Laravel
                 * matches in declaration order, and a later `store/stock/{id}`
                 * would bind `{id}` to the literal "export".
                 */
                Route::get('store/stock', [AdminStoreStockController::class, 'index'])->name('store.stock');
                Route::get('store/stock/export', [AdminStoreStockController::class, 'export'])->name('store.stock.export');
                Route::get('store/stock/movements', [AdminStoreStockController::class, 'movements'])->name('store.stock.movements');

                Route::get('store/categories', [AdminStoreCategoryController::class, 'index'])->name('store.categories.index');
                Route::post('store/categories', [AdminStoreCategoryController::class, 'store'])->name('store.categories.store');
                Route::get('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'show'])->name('store.categories.show');
                Route::patch('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'update'])->name('store.categories.update');
                Route::delete('store/categories/{storeCategory:id}', [AdminStoreCategoryController::class, 'destroy'])->name('store.categories.destroy');

                Route::get('store/products', [AdminStoreProductController::class, 'index'])->name('store.products.index');
                Route::post('store/products', [AdminStoreProductController::class, 'store'])->name('store.products.store');
                Route::get('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'show'])->name('store.products.show');
                Route::patch('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'update'])->name('store.products.update');
                Route::delete('store/products/{storeProduct:id}', [AdminStoreProductController::class, 'destroy'])->name('store.products.destroy');

                /*
                 * The activation-code inventory, per product.
                 *
                 * Nested under the product because that is the only thing a
                 * code belongs to before it is sold, and it is how somebody
                 * asks the question — "how many licences of this are left".
                 */
                Route::get('store/products/{storeProduct:id}/codes', [AdminStoreCodeController::class, 'index'])->name('store.codes.index');
                Route::post('store/products/{storeProduct:id}/codes', [AdminStoreCodeController::class, 'store'])->name('store.codes.store');
                Route::post('store/codes/{code:id}/reveal', [AdminStoreCodeController::class, 'reveal'])
                    ->middleware('throttle:30,1')->name('store.codes.reveal');
                Route::delete('store/codes/{code:id}', [AdminStoreCodeController::class, 'destroy'])->name('store.codes.destroy');

                /*
                 * Orders, bound by **order number** rather than id.
                 *
                 * The rule every CMS entity follows — bind by id, because the
                 * edit form changes the slug it is addressed by — does not
                 * apply: nothing about an order can change its number, and the
                 * number is what a customer reads out on the telephone.
                 */
                /*
                 * Discount codes. Deleting one that has been used is refused
                 * by the controller — the usage rows explain why an order's
                 * total is what it is, and that is not tidying-up to lose.
                 */
                Route::get('store/coupons', [AdminStoreCouponController::class, 'index'])->name('store.coupons.index');
                Route::post('store/coupons', [AdminStoreCouponController::class, 'store'])->name('store.coupons.store');
                Route::get('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'show'])->name('store.coupons.show');
                Route::patch('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'update'])->name('store.coupons.update');
                Route::delete('store/coupons/{coupon:id}', [AdminStoreCouponController::class, 'destroy'])->name('store.coupons.destroy');

                Route::get('store/orders', [AdminStoreOrderController::class, 'index'])->name('store.orders.index');
                Route::get('store/orders/{order}', [AdminStoreOrderController::class, 'show'])->name('store.orders.show');
                Route::post('store/orders/{order}/status', [AdminStoreOrderController::class, 'status'])->name('store.orders.status');
                Route::patch('store/orders/{order}/shipping', [AdminStoreOrderController::class, 'shipping'])->name('store.orders.shipping');
                Route::post('store/orders/{order}/invoice', [AdminStoreOrderController::class, 'invoice'])->name('store.orders.invoice');
                Route::get('store/orders/{order}/invoice', [AdminStoreOrderController::class, 'downloadInvoice'])->name('store.orders.invoice.download');
                Route::post('store/orders/{order}/notes', [AdminStoreOrderController::class, 'note'])->name('store.orders.notes');
                /*
                 * The one route in the console that can make an order paid, and
                 * only for a method with no gateway behind it. It demands a
                 * reference and records who confirmed it; the status route still
                 * refuses to reach `paid` from a dropdown.
                 */
                Route::post('store/orders/{order}/payments', [AdminStoreOrderController::class, 'recordPayment'])->name('store.orders.payments');
                Route::post('store/orders/{order}/fulfil', [AdminStoreOrderController::class, 'fulfil'])->name('store.orders.fulfil');
            });

            /*
             * The newsletter, behind `role:campaign_manager`.
             *
             * Its own role rather than `content_manager`, and this block sat
             * inside that group for months while the comment above it and
             * API.md both said `role:admin` — so anybody who could edit a blog
             * post could also mail the entire list, which is exactly what the
             * comment argued against. A role makes the claim and the code the
             * same thing.
             *
             * The reasoning for separating it at all is blast radius rather
             * than skill: a send cannot be recalled — there is no draft, no
             * unpublish and no 301 — and this module holds thousands of
             * people's personal data beside a suppression list with legal
             * weight. An `admin` still passes implicitly, as everywhere.
             *
             * Static segments are declared **above** the parameterised ones, or
             * `newsletter/subscribers/export` binds {subscriber} to the literal
             * word and 404s from model binding — the trap `media/move`
             * documents.
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

                Route::get('newsletter/groups', [AdminNewsletterGroupController::class, 'index'])->name('newsletter.groups.index');
                Route::post('newsletter/groups', [AdminNewsletterGroupController::class, 'store'])->name('newsletter.groups.store');
                Route::patch('newsletter/groups/{group}', [AdminNewsletterGroupController::class, 'update'])->name('newsletter.groups.update');
                Route::delete('newsletter/groups/{group}', [AdminNewsletterGroupController::class, 'destroy'])->name('newsletter.groups.destroy');
                Route::post('newsletter/groups/{group}/members', [AdminNewsletterGroupController::class, 'members'])->name('newsletter.groups.members');

                Route::get('newsletter/imports', [AdminNewsletterImportController::class, 'index'])->name('newsletter.imports.index');
                Route::post('newsletter/imports/analyse', [AdminNewsletterImportController::class, 'analyse'])->name('newsletter.imports.analyse');
                Route::post('newsletter/imports', [AdminNewsletterImportController::class, 'store'])->name('newsletter.imports.store');
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
                Route::get('newsletter/campaigns/{campaign}/audience', [AdminNewsletterCampaignController::class, 'audience'])->name('newsletter.campaigns.audience');
                Route::get('newsletter/campaigns/{campaign}/health', [AdminNewsletterCampaignController::class, 'health'])->name('newsletter.campaigns.health');
                Route::post('newsletter/campaigns/{campaign}/test', [AdminNewsletterCampaignController::class, 'test'])
                    ->middleware('throttle:6,1')->name('newsletter.campaigns.test');
                Route::post('newsletter/campaigns/{campaign}/send', [AdminNewsletterCampaignController::class, 'send'])->name('newsletter.campaigns.send');
                Route::post('newsletter/campaigns/{campaign}/cancel', [AdminNewsletterCampaignController::class, 'cancel'])->name('newsletter.campaigns.cancel');
                Route::get('newsletter/campaigns/{campaign}/report', [AdminNewsletterReportController::class, 'campaign'])->name('newsletter.campaigns.report');
            });

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

                Route::get('galleries', [AdminGalleryController::class, 'index'])->name('galleries.index');
                Route::post('galleries', [AdminGalleryController::class, 'store'])->name('galleries.store');
                Route::get('galleries/{gallery:id}', [AdminGalleryController::class, 'show'])->name('galleries.show');
                Route::patch('galleries/{gallery:id}', [AdminGalleryController::class, 'update'])->name('galleries.update');
                Route::delete('galleries/{gallery:id}', [AdminGalleryController::class, 'destroy'])->name('galleries.destroy');

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
