<?php

use App\Http\Controllers\Api\V1\Admin\AuthController as AdminAuthController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BlogCommentController;
use App\Http\Controllers\Api\V1\CareersController;
use App\Http\Controllers\Api\V1\CartController;
use App\Http\Controllers\Api\V1\CatalogueController;
use App\Http\Controllers\Api\V1\ChatController;
use App\Http\Controllers\Api\V1\CheckoutController;
use App\Http\Controllers\Api\V1\ClientErrorController;
use App\Http\Controllers\Api\V1\CompanyController;
use App\Http\Controllers\Api\V1\CompanySuggestionController;
use App\Http\Controllers\Api\V1\ContentController;
use App\Http\Controllers\Api\V1\EnquiryController;
use App\Http\Controllers\Api\V1\FormController;
use App\Http\Controllers\Api\V1\GalleryController;
use App\Http\Controllers\Api\V1\LandingPageController;
use App\Http\Controllers\Api\V1\NewsletterController;
use App\Http\Controllers\Api\V1\OrderCodeController;
use App\Http\Controllers\Api\V1\PaymentController;
use App\Http\Controllers\Api\V1\PopupController;
use App\Http\Controllers\Api\V1\RedirectController;
use App\Http\Controllers\Api\V1\RegistrationController;
use App\Http\Controllers\Api\V1\SearchController;
use App\Http\Controllers\Api\V1\SliderController;
use App\Http\Controllers\Api\V1\StoreController;
use Illuminate\Support\Facades\Route;

/*
 * Public — cacheable reads for the marketing site and the shop, the forms
 * they post, sign-in for both principals. No auth on anything here.
 * Required inside the v1 group by routes/api.php.
 */
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

/*
 * The shopping feed, as data. `/store/feed.xml` on the frontend renders it.
 *
 * Declared above the two `{slug}` routes out of habit rather than need —
 * neither would bind "feed", since both sit a segment deeper — but the
 * `media/move` rule is cheap to keep and free to break.
 */
Route::get('store/feed', [StoreController::class, 'feed'])->name('store.feed');
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
/*
 * Throttled, unlike every other read on this API, because it is a read that
 * *writes*: `Cart::forToken(null)` mints and persists a row, which is how a
 * first "add to basket" gets a cart without the page that drew the button
 * having to create one.
 *
 * That made it the one public endpoint where an anonymous caller could
 * insert unbounded rows at whatever rate they liked — it was the only cart
 * route with no limit at all. The frontend never did this (`lib/cart.ts`
 * returns early with no cookie, so a crawler creates nothing), but the API
 * is public and the frontend is not the boundary.
 *
 * Generous, because a basket is read on every page of the shop.
 */
Route::get('cart', [CartController::class, 'show'])
    ->middleware('throttle:120,1')->name('cart.show');
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

/*
 * Every popup that is live right now, for the whole site.
 *
 * A collection and never a 404, unlike a slider or a gallery: no popups is
 * the ordinary state of this site, so a miss on the common case would put
 * an error in the log on every page render. The caller cannot ask for "the
 * popup for this page" because a Next layout has no pathname — the match
 * happens in the browser, against the patterns this response carries.
 */
Route::get('popups', [PopupController::class, 'index'])->name('popups.index');

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
/*
 * Both declared **above** `blog/{post}`.
 *
 * Laravel matches in declaration order, so underneath it these bind
 * `{post}` to the literal strings "taxonomy" and "featured" and 404 from
 * model binding — a routing bug that reads as a missing article. The media
 * library has a test pinning exactly this for `media/move`.
 */
Route::get('blog/taxonomy', [ContentController::class, 'blogTaxonomy'])->name('blog.taxonomy');
Route::get('blog/featured', [ContentController::class, 'featuredPosts'])->name('blog.featured');
/*
 * Comments on a post.
 *
 * Above `blog/{post}` for the reason `taxonomy` and `featured` are: a
 * two-segment route is fine underneath it, but keeping the whole blog block
 * in one order is what stops the next person adding a literal in the wrong
 * place.
 *
 * The write is throttled hard — commenting is not something one person does
 * five times in ten minutes, and this is where spam arrives.
 */
Route::get('blog/{slug}/comments', [BlogCommentController::class, 'index'])
    ->middleware('throttle:60,1')->name('blog.comments.index');
Route::post('blog/{slug}/comments', [BlogCommentController::class, 'store'])
    ->middleware('throttle:5,10')->name('blog.comments.store');

Route::get('blog/{post}', [ContentController::class, 'post'])->name('blog.show');

Route::get('case-studies', [ContentController::class, 'caseStudies'])->name('case-studies.index');
Route::get('case-studies/{caseStudy}', [ContentController::class, 'caseStudy'])->name('case-studies.show');

/*
 * The company profile. Plain collections, 200 when empty — read on the
 * homepage and About, where a 404 for "nothing yet" would be an error on
 * every render. No detail routes: these are lists.
 */
Route::get('team', [CompanyController::class, 'team'])->name('team.index');
Route::get('clients', [CompanyController::class, 'clients'])->name('clients.index');
Route::get('certifications', [CompanyController::class, 'certifications'])->name('certifications.index');

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

/*
 * A mail provider reporting a hard bounce or a complaint.
 *
 * **Un-throttled, like the payment webhook**: a provider that gets a 429
 * retries, and retrying is exactly what makes a rate limit here a way to
 * turn one busy send into an escalating storm. What bounds it instead is
 * that nothing is acted on without the shared secret.
 */
Route::post('newsletter/webhooks/{provider}', [NewsletterController::class, 'bounceWebhook'])
    ->name('newsletter.webhook');

/*
 * A browser reporting that its JavaScript failed.
 *
 * Public, because that is where the errors are: a visitor has no session,
 * and an error boundary on the sign-in screen fires before anybody has one.
 * Throttled hard, grouped by fingerprint on write and pruned by age, so the
 * table's size is bounded by the number of *distinct* failures rather than
 * by how often anybody chooses to post.
 */
Route::post('client-errors', [ClientErrorController::class, 'store'])
    ->middleware('throttle:20,1')->name('client-errors.store');

Route::get('settings', [ContentController::class, 'settings'])->name('settings.index');

// The whole active table, for the frontend proxy to hold in memory;
// `lookup` is one path, and records the hit.
Route::get('redirects', [RedirectController::class, 'index'])->name('redirects.index');
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

/*
 * The website assistant.
 *
 * Public because a visitor has no account, which is the whole point of a
 * chatbot on a marketing site. What stands in for authentication is the
 * conversation's own 64-hex token, held by the Next server in an httpOnly
 * cookie — the arrangement the basket already uses.
 *
 * Throttled hard and on two axes. Starting a conversation is cheap and
 * capped low, because a loop that only ever calls it is a table full of
 * empty rows. Sending is what costs money, so it is the one that matters:
 * **12 a minute per IP**, which is faster than anybody types and far
 * slower than a script. `Assistant`'s daily ceiling is the other half —
 * a rate limit bounds one visitor, and only a total bounds the bill.
 */
Route::post('chat/conversations', [ChatController::class, 'start'])
    ->middleware('throttle:6,1')
    ->name('chat.start');

Route::get('chat/conversations/{token}', [ChatController::class, 'show'])
    ->middleware('throttle:30,1')
    ->name('chat.show');

Route::post('chat/conversations/{token}/messages', [ChatController::class, 'send'])
    ->middleware('throttle:12,1')
    ->name('chat.send');

/*
 * A callback request. Throttled hard: one conversation may only produce one
 * lead, so anything past the first press is a mistake or a script.
 */
Route::post('chat/conversations/{token}/lead', [ChatController::class, 'lead'])
    ->middleware('throttle:5,1')
    ->name('chat.lead');

// A thumb. Cheap, and capped so it cannot be used to write to the database
// in a loop.
Route::post('chat/conversations/{token}/messages/{message}/rating', [ChatController::class, 'rate'])
    ->middleware('throttle:20,1')
    ->name('chat.rate');

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
/*
 * Company names already on file, so a colleague spells it the same way.
 *
 * Public because it sits on the registration form, which is public. A
 * prefix match with a three-character floor and five results — the
 * controller's docblock states the trade in full, and the reason it is
 * different in kind from the membership oracle `/auth/register` refuses to
 * be. Throttled at 20 a minute: it is a keystroke-driven lookup, so it has
 * to be looser than the register throttle beside it and still bounded.
 */
Route::get('companies/suggest', CompanySuggestionController::class)
    ->middleware('throttle:20,1')
    ->name('companies.suggest');

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
