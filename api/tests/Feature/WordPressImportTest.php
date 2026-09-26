<?php

namespace Tests\Feature;

use App\Enums\OrderStatus;
use App\Enums\Role as RoleEnum;
use App\Models\BlogCategory;
use App\Models\BlogComment;
use App\Models\BlogPost;
use App\Models\ContentType;
use App\Models\Coupon;
use App\Models\CouponUsage;
use App\Models\Customer;
use App\Models\CustomField;
use App\Models\Entry;
use App\Models\Menu;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\Page;
use App\Models\ProductReview;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\StockMovement;
use App\Models\StoreProduct;
use App\Models\User;
use App\Models\Webhook;
use App\Models\WebhookDelivery;
use App\Models\WordPressImport;
use App\Support\CustomFields\CustomFields;
use App\Support\Net\PublicHost;
use App\Support\Net\SafeHttp;
use App\Support\Net\UnsafeUrl;
use App\Support\QueueHealth;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The WordPress / WooCommerce importer, end to end against a faked site.
 *
 * The site is a handful of records chosen so each exercises a rule: a post
 * with ACF values (one a repeater), a Yoast title ending in the site's name
 * and a link to a page; a page whose slug is one of this site's routes; the
 * shop's cart page; a simple product on sale, a variable one with an
 * "any colour" option, a downloadable one and a grouped one; a customer, a
 * coupon restricted to one product, a paid order with shipping and a coupon,
 * a guest cash-on-delivery order; two reviews, one by somebody with no
 * account; a comment; a portfolio post type.
 *
 * The queue runs synchronously in tests, so starting the scan runs the whole
 * chain — scan, analysis — inside the request, and committing runs the whole
 * commit.
 */
class WordPressImportTest extends TestCase
{
    use RefreshDatabase;

    private const SITE = 'https://shop.example';

    private const API = '/api/v1/admin/imports/wordpress';

    private const PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82";

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
        Notification::fake();
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'shop.example' ? ['93.184.216.34'] : []);
    }

    private function admin(): User
    {
        $user = User::firstOrCreate(['email' => 'admin@technoware.in'], ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true]);
        $role = Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]);
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user->load('roles');
    }

    private function asAdmin(): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$this->admin()->createToken('admin')->plainTextToken);
    }

    private function start(array $overrides = []): WordPressImport
    {
        $this->asAdmin()->postJson(self::API, $overrides + [
            'site_url' => 'shop.example/',
            'sections' => ['content', 'catalogue', 'customers', 'custom'],
            'wp_user' => 'editor',
            'wp_password' => 'abcd efgh ijkl mnop',
            'wc_key' => 'ck_test123',
            'wc_secret' => 'cs_test456',
        ])->assertStatus(202);

        return WordPressImport::query()->latest('id')->firstOrFail();
    }

    private function commit(WordPressImport $import): WordPressImport
    {
        $this->asAdmin()->postJson(self::API.'/'.$import->id.'/commit')->assertStatus(202);

        return $import->fresh();
    }

    /** @var array<string, mixed> what the faked site answers; replaced by `fakeSite()` */
    private array $routes = [];

    private bool $faked = false;

    /**
     * Serve the site from `$routes`. `Http::fake()` stacks its stubs and the
     * first to match wins, so the stub is registered once and a second call
     * only changes what it answers.
     *
     * @param  array<string, mixed>  $site
     */
    private function fakeSite(array $site = []): void
    {
        $this->routes = array_replace($this->site(), $site);

        if ($this->faked) {
            return;
        }

        $this->faked = true;

        Http::fake(function (Request $request) {
            $routes = $this->routes;
            $url = $request->url();

            if (str_contains($url, '/wp-content/uploads/')) {
                return Http::response(self::PNG, 200, ['Content-Type' => 'image/png']);
            }

            $path = trim((string) parse_url($url, PHP_URL_PATH), '/');
            parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
            $route = preg_replace('#^wp-json/?#', '', $path);

            // A second status for the same collection (held comments).
            $key = $route.(isset($query['status']) && $route === 'wp/v2/comments' ? '?'.$query['status'] : '');

            if (! array_key_exists($key, $routes) || $routes[$key] === 404) {
                return Http::response(['code' => 'rest_no_route', 'message' => 'No route was found.'], 404);
            }

            $body = $routes[$key];
            $page = (int) ($query['page'] ?? 1);

            if (array_is_list($body) && $page > 1) {
                return Http::response(['code' => 'rest_post_invalid_page_number'], 400);
            }

            return Http::response($body, 200, array_is_list($body) ? ['X-WP-TotalPages' => '1', 'X-WP-Total' => (string) count($body)] : []);
        });
    }

    /** @return array<string, mixed> route => body */
    private function site(): array
    {
        $upload = self::SITE.'/wp-content/uploads/2024/05/cable.png';
        $billing = ['first_name' => 'Neil', 'last_name' => 'Basu', 'company' => 'Meridian Foods', 'address_1' => '1 Park Street', 'address_2' => '', 'city' => 'Kolkata', 'state' => 'WB', 'postcode' => '700016', 'country' => 'IN', 'email' => 'neil@buyer.in', 'phone' => '9876543210'];

        return [
            '' => ['name' => 'Old Shop', 'url' => self::SITE, 'namespaces' => ['wp/v2', 'wc/v3', 'yoast/v1', 'acf/v3']],
            'wc/v3/settings/general' => [['id' => 'woocommerce_currency', 'value' => 'INR']],
            'wc/v3/settings/products' => [['id' => 'woocommerce_weight_unit', 'value' => 'kg']],
            'wc/v3/settings/tax' => [['id' => 'woocommerce_calc_taxes', 'value' => 'yes'], ['id' => 'woocommerce_prices_include_tax', 'value' => 'yes']],
            'wp/v2/media' => [['id' => 11, 'source_url' => $upload, 'alt_text' => 'A patch cable', 'mime_type' => 'image/png', 'title' => ['raw' => 'cable']]],
            'wp/v2/users' => [['id' => 1, 'email' => 'editor@old.example', 'name' => 'Editor']],
            'wp/v2/categories' => [['id' => 3, 'name' => 'Guides', 'slug' => 'guides', 'parent' => 0, 'description' => '', 'link' => self::SITE.'/category/guides/']],
            'wp/v2/tags' => [],
            'wp/v2/posts' => [[
                'id' => 21, 'slug' => 'cabling-guide', 'status' => 'publish', 'date_gmt' => '2024-05-01T10:00:00',
                'title' => ['raw' => 'Cabling guide'], 'excerpt' => ['raw' => 'Short'],
                'content' => ['raw' => '<!-- wp:paragraph -->x', 'rendered' => '<p>See <a href="https://shop.example/services/">our services</a>.</p><p><img src="https://shop.example/wp-content/uploads/2024/05/cable-300x200.png" srcset="x 300w"></p>', 'protected' => false],
                'featured_media' => 11, 'author' => 1, 'categories' => [3], 'tags' => [], 'sticky' => false, 'comment_status' => 'open',
                'link' => self::SITE.'/2024/05/cabling-guide/',
                'acf' => ['subtitle' => 'Everything about cables', 'launch_date' => '20240131', 'rows' => [['a' => 1]]],
                'yoast_head_json' => ['title' => 'Cabling guide - Old Shop', 'description' => 'All about cables', 'canonical' => self::SITE.'/2024/05/cabling-guide/', 'robots' => ['index' => 'index', 'follow' => 'follow']],
            ]],
            'wp/v2/pages' => [
                ['id' => 31, 'slug' => 'services', 'status' => 'publish', 'date_gmt' => '2024-01-01T00:00:00', 'title' => ['raw' => 'Our services'], 'content' => ['raw' => '[contact-form-7 id="4"]', 'rendered' => '<p>We install networks.</p>'], 'parent' => 0, 'link' => self::SITE.'/services/'],
                ['id' => 32, 'slug' => 'cart', 'status' => 'publish', 'title' => ['raw' => 'Cart'], 'content' => ['raw' => '', 'rendered' => ''], 'parent' => 0, 'link' => self::SITE.'/cart/'],
            ],
            'wp/v2/comments?approve' => [['id' => 41, 'post' => 21, 'parent' => 0, 'author_name' => 'Asha', 'author_email' => 'asha@example.in', 'author_ip' => '203.0.113.9', 'content' => ['rendered' => '<p>Great guide.</p>'], 'status' => 'approved', 'type' => 'comment', 'date_gmt' => '2024-05-02T10:00:00', 'link' => self::SITE.'/2024/05/cabling-guide/#comment-41']],
            'wp/v2/comments?hold' => [],
            'wp/v2/menus' => 404,
            'wp/v2/menu-items' => 404,
            'wp/v2/types' => [
                'post' => ['name' => 'Posts', 'rest_base' => 'posts'],
                'page' => ['name' => 'Pages', 'rest_base' => 'pages'],
                'portfolio' => ['name' => 'Portfolio', 'rest_base' => 'portfolio', 'hierarchical' => false],
            ],
            'wp/v2/portfolio' => [['id' => 121, 'slug' => 'dc-fitout', 'status' => 'publish', 'date_gmt' => '2024-03-01T00:00:00', 'title' => ['raw' => 'Data centre fit-out'], 'excerpt' => ['raw' => ''], 'content' => ['raw' => '', 'rendered' => '<p>Work.</p>'], 'featured_media' => 11, 'link' => self::SITE.'/portfolio/dc-fitout/', 'acf' => ['client' => 'Meridian']]],
            'wc/v3/products/categories' => [
                ['id' => 51, 'name' => 'Switches', 'slug' => 'switches', 'parent' => 0, 'description' => '', 'image' => null, 'menu_order' => 0],
                ['id' => 15, 'name' => 'Uncategorized', 'slug' => 'uncategorized', 'parent' => 0],
            ],
            'wc/v3/products/brands' => 404,
            'wc/v3/products' => [
                ['id' => 61, 'name' => 'CBS350 Switch', 'slug' => 'cbs350', 'type' => 'simple', 'status' => 'publish', 'price' => '1179.99', 'regular_price' => '1299.00', 'sale_price' => '1179.99', 'manage_stock' => true, 'stock_quantity' => 7, 'backorders' => 'no', 'weight' => '1.5', 'sku' => 'CBS-24', 'global_unique_id' => '1234567890123', 'categories' => [['id' => 51]], 'images' => [['id' => 11, 'src' => $upload]], 'attributes' => [['name' => 'Ports', 'options' => ['24'], 'visible' => true, 'variation' => false]], 'description' => '<p>Fast.</p>', 'short_description' => '<p>A fast switch.</p>', 'permalink' => self::SITE.'/product/cbs350/', 'meta_data' => [], 'tags' => []],
                ['id' => 62, 'name' => 'Patch cable', 'slug' => 'patch-cable', 'type' => 'variable', 'status' => 'publish', 'price' => '100', 'regular_price' => '', 'manage_stock' => false, 'categories' => [['id' => 51]], 'images' => [], 'attributes' => [['name' => 'Length', 'options' => ['1m', '2m'], 'visible' => true, 'variation' => true]], 'description' => '', 'permalink' => self::SITE.'/product/patch-cable/', 'meta_data' => []],
                ['id' => 63, 'name' => 'Install manual', 'slug' => 'install-manual', 'type' => 'simple', 'downloadable' => true, 'status' => 'publish', 'price' => '99'],
                ['id' => 64, 'name' => 'Starter kit', 'slug' => 'starter-kit', 'type' => 'grouped', 'status' => 'publish', 'price' => ''],
            ],
            'wc/v3/products/62/variations' => [
                ['id' => 71, 'price' => '100', 'attributes' => [['name' => 'Length', 'option' => '1m']], 'manage_stock' => true, 'stock_quantity' => 5, 'status' => 'publish'],
                ['id' => 72, 'price' => '150', 'attributes' => [['name' => 'Length', 'option' => '2m']], 'manage_stock' => true, 'stock_quantity' => 2, 'status' => 'publish'],
                ['id' => 73, 'price' => '90', 'attributes' => [['name' => 'Colour', 'option' => '']], 'status' => 'publish'],
            ],
            'wc/v3/products/reviews' => [
                ['id' => 81, 'product_id' => 61, 'status' => 'approved', 'reviewer' => 'Neil Basu', 'reviewer_email' => 'neil@buyer.in', 'review' => '<p>Solid.</p>', 'rating' => 5, 'date_created_gmt' => '2024-06-01T00:00:00'],
                ['id' => 82, 'product_id' => 61, 'status' => 'approved', 'reviewer' => 'Guest', 'reviewer_email' => 'guest@nowhere.in', 'review' => '<p>Fine.</p>', 'rating' => 4, 'date_created_gmt' => '2024-06-02T00:00:00'],
            ],
            'wc/v3/customers' => [['id' => 91, 'email' => 'neil@buyer.in', 'first_name' => 'Neil', 'last_name' => 'Basu', 'billing' => $billing, 'shipping' => $billing, 'date_created_gmt' => '2023-01-01T00:00:00']],
            'wc/v3/coupons' => [
                ['id' => 101, 'code' => 'welcome10', 'discount_type' => 'percent', 'amount' => '10.00', 'product_ids' => [61], 'usage_limit' => 100, 'status' => 'publish'],
                ['id' => 102, 'code' => 'flat50', 'discount_type' => 'fixed_product', 'amount' => '50'],
            ],
            'wc/v3/orders' => [
                ['id' => 111, 'number' => '1001', 'status' => 'completed', 'currency' => 'INR', 'customer_id' => 91, 'billing' => $billing, 'shipping' => $billing,
                    'payment_method' => 'razorpay', 'payment_method_title' => 'Razorpay', 'transaction_id' => 'pay_ABC',
                    'date_created_gmt' => '2024-06-01T09:00:00', 'date_paid_gmt' => '2024-06-01T09:05:00', 'date_completed_gmt' => '2024-06-03T09:00:00',
                    'line_items' => [['name' => 'CBS350 Switch', 'product_id' => 61, 'variation_id' => 0, 'quantity' => 2, 'subtotal' => '2000.00', 'subtotal_tax' => '360.00', 'sku' => 'CBS-24', 'meta_data' => []]],
                    'shipping_lines' => [['method_title' => 'Flat rate', 'total' => '100.00', 'total_tax' => '0.00']],
                    'fee_lines' => [], 'coupon_lines' => [['code' => 'welcome10', 'discount' => '200.00', 'discount_tax' => '36.00']],
                    'discount_total' => '200.00', 'discount_tax' => '36.00', 'total' => '2224.00', 'total_tax' => '324.00',
                    'refunds' => [], 'customer_note' => 'Leave at reception', 'meta_data' => []],
                ['id' => 112, 'number' => '1002', 'status' => 'processing', 'currency' => 'INR', 'customer_id' => 0,
                    'billing' => ['first_name' => 'Guest', 'last_name' => 'Buyer', 'email' => 'guest@nowhere.in', 'address_1' => '2 Lake Road', 'city' => 'Kolkata', 'state' => 'WB', 'postcode' => '700029', 'country' => 'IN'],
                    'shipping' => [], 'payment_method' => 'cod', 'date_created_gmt' => '2024-07-01T09:00:00', 'date_paid_gmt' => null,
                    'line_items' => [['name' => 'Patch cable - 1m', 'product_id' => 62, 'variation_id' => 71, 'quantity' => 1, 'subtotal' => '100.00', 'subtotal_tax' => '0.00', 'meta_data' => [['key' => 'pa_length', 'display_key' => 'Length', 'display_value' => '1m']]]],
                    'shipping_lines' => [], 'fee_lines' => [], 'coupon_lines' => [], 'discount_total' => '0', 'discount_tax' => '0', 'total' => '100.00', 'total_tax' => '0.00', 'refunds' => []],
            ],
            'wc/v3/orders/111/notes' => [['id' => 1, 'author' => 'system', 'note' => 'Order status changed from Processing to Completed.', 'customer_note' => false, 'date_created_gmt' => '2024-06-03T09:00:00']],
            'wc/v3/orders/112/notes' => [],
        ];
    }

    public function test_a_scan_reads_the_site_and_the_review_names_what_will_not_come_across(): void
    {
        $this->fakeSite();
        $import = $this->start();

        $this->assertSame('ready', $import->status, (string) $import->error);
        $this->assertSame(self::SITE, $import->site_url);

        $data = $this->asAdmin()->getJson(self::API.'/'.$import->id)->assertOk()->json('data');
        $steps = collect($data['analysis']['steps'])->keyBy('key');

        $this->assertSame(1, $steps['posts']['create']);
        $this->assertSame(1, $steps['pages']['create']);
        $this->assertSame(1, $steps['pages']['skip'], 'the cart page is WooCommerce machinery');
        $this->assertSame(2, $steps['products']['create']);
        $this->assertSame(2, $steps['products']['skip']);
        $this->assertSame(1, $steps['coupons']['skip']);
        $this->assertSame(2, $steps['orders']['create']);
        $this->assertSame(1, $steps['reviews']['create']);
        $this->assertSame(1, $steps['reviews']['skip'], 'a review by somebody with no account');

        $reasons = collect($steps['products']['reasons'])->pluck('reason')->implode("\n");
        $this->assertStringContainsString('Downloadable', $reasons);
        $this->assertStringContainsString('grouped', $reasons);
        $this->assertStringContainsString('any Colour', $reasons);

        $postWarnings = collect($steps['posts']['reasons'])->pluck('reason')->implode("\n");
        $this->assertStringContainsString('"rows"', $postWarnings, 'the ACF repeater is named');
        $this->assertStringContainsString('[contact-form-7]', collect($steps['pages']['reasons'])->pluck('reason')->implode("\n"));

        $acf = collect($data['analysis']['decisions']['acf']['blog_post'])->keyBy('source');
        $this->assertSame('text', $acf['subtitle']['kind']);
        $this->assertSame('date', $acf['launch_date']['kind']);
        $this->assertNotNull($acf['rows']['unsupported']);

        $this->assertSame(1, $data['analysis']['decisions']['newsletter']['customers']);
        $this->assertArrayHasKey('menus', $data['site']['missing'], 'an endpoint the site does not have is recorded, not fatal');

        // A dry run writes nothing.
        $this->assertSame(0, BlogPost::query()->count());
        $this->assertSame(0, StoreProduct::query()->count());
        $this->assertSame(0, Customer::query()->count());
    }

    public function test_the_credentials_outlive_nothing(): void
    {
        $this->fakeSite();
        $import = $this->start();

        $this->assertStringNotContainsString('abcdefghijklmnop', json_encode($import->fresh()->toArray()));
        $this->assertStringNotContainsString('cs_test456', json_encode($import->fresh()->toArray()));

        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/wp-json/wp/v2/posts') && $r->hasHeader('Authorization', 'Basic '.base64_encode('editor:abcdefghijklmnop')));
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/wp-json/wc/v3/products') && $r->hasHeader('Authorization', 'Basic '.base64_encode('ck_test123:cs_test456')));
        Http::assertNotSent(fn (Request $r) => str_contains($r->url(), '/wp-content/uploads/') && $r->hasHeader('Authorization'));
    }

    public function test_the_commit_brings_everything_across_and_sends_nothing(): void
    {
        $hook = Webhook::query()->create(['name' => 'Fulfilment', 'url' => 'https://hooks.example/in', 'events' => ['order.paid', 'order.status_changed', 'order.placed'], 'is_active' => true, 'secret' => 'x']);
        $this->fakeSite();
        $import = $this->commit($this->start());

        $this->assertSame('completed', $import->status, (string) $import->error);

        // Content: the post, its picture, its category, its link to the page that moved.
        $post = BlogPost::query()->where('slug', 'cabling-guide')->firstOrFail();
        $this->assertNotNull($post->cover_image_path);
        $this->assertSame(['guides'], $post->categories->pluck('slug')->all());
        $this->assertNull($post->author_id, 'no staff account has the author\'s address');
        $this->assertStringContainsString('href="/services-2"', (string) $post->body);
        $this->assertStringNotContainsString('shop.example/wp-content', (string) $post->body);
        $this->assertStringNotContainsString('srcset', (string) $post->body);
        $this->assertSame('All about cables', $post->seo?->description);
        $this->assertNull($post->seo?->title, 'a Yoast title that is only the post title and the site name is not an override');
        $this->assertNull($post->seo?->canonical_url, 'a canonical to the old site is never copied');

        $this->assertSame('services-2', Page::query()->where('title', 'Our services')->value('slug'), '/services is this site\'s own route');
        $this->assertFalse(Page::query()->where('slug', 'cart')->exists());

        $comment = BlogComment::query()->sole();
        $this->assertSame($post->id, $comment->blog_post_id);
        $this->assertSame(hash_hmac('sha256', '203.0.113.9', (string) config('app.key')), $comment->ip_hash);

        // ACF → custom fields.
        $fields = CustomFields::fieldsFor('blog_post');
        $this->assertSame('text', $fields['subtitle']->kind->value);
        $this->assertSame('date', $fields['launch_date']->kind->value);
        $this->assertArrayNotHasKey('rows', $fields);
        $this->assertSame('2024-01-31', CustomFields::adminValues($post->load('customValues.field.group'))['launch_date'] ?? null);

        // A custom post type.
        $type = ContentType::query()->where('slug', 'portfolio')->firstOrFail();
        $entry = Entry::query()->where('content_type_id', $type->id)->sole();
        $this->assertSame('dc-fitout', $entry->slug);
        $this->assertSame('Meridian', CustomFields::adminValues($entry->load('customValues.field.group'))['client'] ?? null);

        // The catalogue.
        $switch = StoreProduct::query()->where('slug', 'cbs350')->firstOrFail();
        $this->assertSame(117999, $switch->price_paise);
        $this->assertSame(129900, $switch->compare_at_paise);
        $this->assertTrue($switch->track_stock);
        $this->assertSame(7, $switch->stock);
        $this->assertSame('1234567890123', $switch->gtin);
        $this->assertSame(1500, $switch->weight_grams);
        $this->assertSame('switches', $switch->category?->slug);
        $this->assertSame(['Ports' => '24'], $switch->specifications);
        $this->assertCount(1, $switch->images);
        $this->assertSame(1, StockMovement::query()->where('store_product_id', $switch->id)->count(), 'opening stock is a ledger movement');

        $cable = StoreProduct::query()->where('slug', 'patch-cable')->firstOrFail();
        $this->assertSame(10000, $cable->price_paise);
        $this->assertSame(['1m', '2m'], $cable->variations()->orderBy('sort_order')->get()->map(fn ($v) => $v->options['Length'])->all());
        $this->assertSame(15000, $cable->variations()->where('name', '2m')->value('price_paise'));
        $this->assertFalse(StoreProduct::query()->whereIn('slug', ['install-manual', 'starter-kit'])->exists());

        // Customers, coupons, orders.
        $neil = Customer::query()->where('email', 'neil@buyer.in')->firstOrFail();
        $this->assertSame('active', $neil->status->value);
        $this->assertNull($neil->email_verified_at);
        $this->assertSame('West Bengal', $neil->billing_address['state']);
        $this->assertNull($neil->shipping_address, 'a delivery address the same as the billing one is not a second address');
        $this->assertTrue(NewsletterSubscriber::query()->where('email', 'neil@buyer.in')->exists(), 'imported customers join Existing customers, as decided');

        $coupon = Coupon::query()->where('code', 'WELCOME10')->firstOrFail();
        $this->assertSame('percentage', $coupon->type);
        $this->assertSame(10, (int) $coupon->value);
        $this->assertFalse(Coupon::query()->where('code', 'FLAT50')->exists());

        $order = Order::query()->where('order_number', 'WC-1001')->firstOrFail();
        $this->assertSame($neil->id, $order->customer_id);
        $this->assertSame(OrderStatus::Completed, $order->status);
        $this->assertSame(222400, $order->total_paise);
        $this->assertSame(32400, $order->gst_paise);
        $this->assertSame(23600, $order->discount_paise);
        $this->assertSame(246000, $order->subtotal_paise);
        $this->assertSame($order->subtotal_paise - $order->discount_paise, $order->total_paise, 'the lines add up to the total');
        $this->assertSame(['CBS350 Switch', 'Shipping — Flat rate'], $order->items()->orderBy('id')->pluck('name')->all());
        $this->assertSame($switch->id, $order->items()->orderBy('id')->value('store_product_id'));
        $this->assertNotNull($order->paid_at);
        $this->assertNotNull($order->review_requested_at, 'or the hourly review request mails every past customer');
        $this->assertSame('pay_ABC', $order->payments()->value('gateway_payment_id'));
        $this->assertSame('Leave at reception', $order->customer_note);
        $this->assertSame(1, $order->notes()->count());
        $this->assertSame(1, CouponUsage::query()->where('coupon_id', $coupon->id)->where('order_id', $order->id)->count());

        $guest = Order::query()->where('order_number', 'WC-1002')->firstOrFail();
        $this->assertNull($guest->customer_id);
        $this->assertSame(OrderStatus::Confirmed, $guest->status, 'an unpaid cash-on-delivery order is confirmed, not paid');
        $this->assertNull($guest->paid_at);
        $this->assertSame($cable->variations()->where('name', '1m')->value('id'), $guest->items()->value('store_product_variation_id'));

        $this->assertMatchesRegularExpression('/^ORD-\d{4}-00001$/', Order::nextNumber(), 'imported numbers do not move the live sequence');

        // Reviews: the one with an account, verified by the imported order.
        $review = ProductReview::query()->sole();
        $this->assertSame($neil->id, $review->customer_id);
        $this->assertSame($order->id, $review->order_id);
        $this->assertSame(5, (int) $review->rating);

        // Redirects from the old addresses; never over one of this site's routes.
        $this->assertSame('/blog/cabling-guide', Redirect::query()->where('from_path', '/2024/05/cabling-guide')->value('to_path'));
        $this->assertSame('/store/products/cbs350', Redirect::query()->where('from_path', '/product/cbs350')->value('to_path'));
        $this->assertSame('/store/categories/switches', Redirect::query()->where('from_path', '/product-category/switches')->value('to_path'));
        $this->assertSame('/store', Redirect::query()->where('from_path', '/shop')->value('to_path'));
        $this->assertFalse(Redirect::query()->where('from_path', '/services')->exists());

        // Nothing was sent to anybody, and no webhook heard about history.
        Notification::assertNothingSentTo($neil);
        $this->assertSame(0, WebhookDelivery::query()->where('webhook_id', $hook->id)->count());

        // The harvest is gone.
        $this->assertSame([], Storage::disk('local')->allFiles('wordpress-imports/'.$import->id));
    }

    public function test_menus_arrive_unassigned_and_point_at_records(): void
    {
        $this->fakeSite([
            'wp/v2/menus' => [['id' => 7, 'name' => 'Main', 'slug' => 'main', 'locations' => ['primary']]],
            'wp/v2/menu-items' => [
                ['id' => 201, 'title' => ['rendered' => 'Services'], 'type' => 'post_type', 'object' => 'page', 'object_id' => 31, 'parent' => 0, 'menu_order' => 1, 'menus' => 7, 'url' => self::SITE.'/services/', 'status' => 'publish'],
                ['id' => 202, 'title' => ['rendered' => 'Switches'], 'type' => 'taxonomy', 'object' => 'product_cat', 'object_id' => 51, 'parent' => 201, 'menu_order' => 2, 'menus' => 7, 'url' => self::SITE.'/product-category/switches/', 'status' => 'publish'],
                ['id' => 203, 'title' => ['rendered' => 'Blog'], 'type' => 'custom', 'object' => 'custom', 'object_id' => 0, 'parent' => 0, 'menu_order' => 3, 'menus' => 7, 'url' => self::SITE.'/blog/', 'status' => 'publish'],
                ['id' => 204, 'title' => ['rendered' => 'Partner'], 'type' => 'custom', 'object' => 'custom', 'object_id' => 0, 'parent' => 0, 'menu_order' => 4, 'menus' => 7, 'url' => 'https://partner.example/', 'target' => '_blank', 'status' => 'publish'],
            ],
        ]);

        $this->commit($this->start());

        $menu = Menu::query()->where('name', 'Main')->firstOrFail();
        $this->assertNull($menu->location, 'an import never takes over the live navigation');

        $items = $menu->items()->orderBy('sort_order')->get()->keyBy('label');
        $this->assertSame('page', $items['Services']->type->value);
        $this->assertSame(Page::query()->where('slug', 'services-2')->value('id'), $items['Services']->target_id);
        $this->assertSame('/store/categories/switches', $items['Switches']->url);
        $this->assertSame($items['Services']->id, $items['Switches']->parent_id);
        $this->assertSame('/blog', $items['Blog']->url);
        $this->assertSame('https://partner.example/', $items['Partner']->url);
        $this->assertTrue((bool) $items['Partner']->open_in_new_tab);
    }

    /**
     * Measured on a real WordPress: without Yoast's index built, a collection
     * request carries the first post's head on every post.
     */
    public function test_a_yoast_head_about_another_page_is_not_imported(): void
    {
        $site = $this->site();
        $site['wp/v2/posts'][0]['yoast_head_json']['canonical'] = self::SITE.'/?p=99';
        $site['wp/v2/posts'][0]['yoast_head_json']['title'] = 'Somebody else - Old Shop';
        $this->fakeSite($site);

        $import = $this->start();
        $this->assertStringContainsString('Optimise SEO data', implode(' ', $import->analysis['notices']), 'the review warns before anything is written');

        $this->commit($import);
        $post = BlogPost::query()->where('slug', 'cabling-guide')->firstOrFail();
        $this->assertNull($post->seo?->title);
        $this->assertNull($post->seo?->description);
    }

    public function test_old_site_staff_and_catch_all_categories_are_not_imported(): void
    {
        $site = $this->site();
        $site['wc/v3/customers'][] = ['id' => 92, 'email' => 'owner@old.example', 'role' => 'administrator', 'first_name' => 'Owner'];
        $site['wc/v3/customers'][] = ['id' => 93, 'email' => 'reader@old.example', 'role' => 'subscriber', 'first_name' => 'Reader'];
        $site['wp/v2/categories'][] = ['id' => 1, 'name' => 'Uncategorized', 'slug' => 'uncategorized', 'parent' => 0];
        $this->fakeSite($site);

        $this->commit($this->start());

        $this->assertFalse(Customer::query()->where('email', 'owner@old.example')->exists(), 'an administrator on the old site is not a customer');
        $this->assertTrue(Customer::query()->where('email', 'reader@old.example')->exists(), 'a subscriber is somebody who signed up');
        $this->assertFalse(BlogCategory::query()->where('slug', 'uncategorized')->exists());
    }

    /**
     * A site on "Plain" permalinks reports `?p=`-style addresses; a shop may
     * have renamed `/product-category/`. Both redirect, and a body link in the
     * query form is rewritten like any other.
     */
    public function test_plain_permalinks_and_a_renamed_category_base_are_redirected(): void
    {
        $site = $this->site();
        $site['wp/v2/posts'][0]['link'] = self::SITE.'/?p=21';
        $site['wp/v2/posts'][0]['yoast_head_json']['canonical'] = self::SITE.'/?p=21';
        $site['wp/v2/posts'][0]['content']['rendered'] = '<p>See <a href="'.self::SITE.'/?page_id=31">our services</a>.</p>';
        $site['wp/v2/pages'][0]['link'] = self::SITE.'/?page_id=31';
        $site['wc/v3/products'][0]['permalink'] = self::SITE.'/?product=cbs350';
        $site['wc/v3/products/categories'][] = ['id' => 52, 'name' => 'Routers', 'slug' => 'routers', 'parent' => 0];
        $site['wp/v2/product_cat'] = [
            ['id' => 51, 'slug' => 'switches', 'link' => self::SITE.'/?product_cat=switches'],
            ['id' => 52, 'slug' => 'routers', 'link' => self::SITE.'/shop/category/routers/'],
        ];
        $this->fakeSite($site);

        $this->commit($this->start());

        $to = fn (string $from) => Redirect::query()->where('from_path', $from)->value('to_path');
        $this->assertSame('/blog/cabling-guide', $to('/?p=21'));
        $this->assertSame('/services-2', $to('/?page_id=31'));
        $this->assertSame('/store/products/cbs350', $to('/?product=cbs350'));
        $this->assertSame('/store/categories/switches', $to('/?product_cat=switches'));
        $this->assertSame('/store/categories/routers', $to('/shop/category/routers'), 'the address WordPress reports, not the default base');
        $this->assertNull($to('/product-category/routers'));

        $this->assertStringContainsString('href="/services-2"', (string) BlogPost::query()->where('slug', 'cabling-guide')->value('body'));
    }

    public function test_the_sync_queue_counts_as_draining(): void
    {
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        $this->assertSame('sync', config('queue.default'));

        $this->asAdmin()->getJson(self::API)->assertOk()->assertJsonPath('meta.delivering', true);
    }

    public function test_a_second_run_updates_rather_than_copies(): void
    {
        $this->fakeSite();
        $this->commit($this->start());

        $site = $this->site();
        $site['wc/v3/products'][0]['price'] = '999.00';
        $site['wc/v3/products'][0]['stock_quantity'] = 3;
        $this->fakeSite($site);

        $second = $this->commit($this->start());
        $this->assertSame('completed', $second->status, (string) $second->error);

        $this->assertSame(1, BlogPost::query()->count());
        $this->assertSame(2, StoreProduct::query()->count());
        $this->assertSame(2, Order::query()->count());
        $this->assertSame(1, Customer::query()->count());
        $this->assertSame(1, BlogComment::query()->count());
        $this->assertSame(1, ProductReview::query()->count());
        $this->assertSame(2, StoreProduct::query()->where('slug', 'patch-cable')->firstOrFail()->variations()->count());
        $this->assertSame(1, CustomField::query()->where('key', 'subtitle')->count());

        $switch = StoreProduct::query()->where('slug', 'cbs350')->firstOrFail();
        $this->assertSame(99900, $switch->price_paise);
        $this->assertSame(3, $switch->stock);
        $this->assertSame(2, StockMovement::query()->where('store_product_id', $switch->id)->count(), 'the change in stock is a movement too');
        $this->assertSame(1, Order::query()->where('order_number', 'WC-1001')->firstOrFail()->notes()->count(), 'notes are replaced, not doubled');
    }

    public function test_prices_can_have_gst_added_when_woocommerce_added_tax_on_top(): void
    {
        $site = $this->site();
        $site['wc/v3/settings/tax'] = [['id' => 'woocommerce_calc_taxes', 'value' => 'yes'], ['id' => 'woocommerce_prices_include_tax', 'value' => 'no']];
        $this->fakeSite($site);

        $import = $this->start();
        $this->assertSame('keep', $import->analysis['decisions']['tax_basis']['value']);

        $this->asAdmin()->patchJson(self::API.'/'.$import->id, ['decisions' => ['tax_basis' => 'add_gst']])->assertStatus(202);
        $this->assertSame('ready', $import->fresh()->status);

        $this->commit($import->fresh());

        // ₹1,179.99 + 18% = ₹1,392.3882 → ₹1,392.39; an order's total is never adjusted.
        $this->assertSame(139239, StoreProduct::query()->where('slug', 'cbs350')->value('price_paise'));
        $this->assertSame(222400, Order::query()->where('order_number', 'WC-1001')->value('total_paise'));
    }

    public function test_a_shop_selling_in_another_currency_imports_no_money(): void
    {
        $site = $this->site();
        $site['wc/v3/settings/general'] = [['id' => 'woocommerce_currency', 'value' => 'USD']];
        foreach ($site['wc/v3/orders'] as $i => $order) {
            $site['wc/v3/orders'][$i]['currency'] = 'USD';
        }
        $this->fakeSite($site);

        $import = $this->commit($this->start());

        $this->assertSame(0, StoreProduct::query()->count());
        $this->assertSame(0, Order::query()->count());
        $this->assertSame(0, Coupon::query()->count());
        $this->assertSame(1, BlogPost::query()->count(), 'the content still comes across');
        $this->assertStringContainsString('USD', implode(' ', $import->analysis['notices']));
    }

    public function test_a_private_or_disguised_address_is_refused(): void
    {
        foreach (['https://127.0.0.1', 'https://127.1', 'https://intranet.example'] as $url) {
            $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'intranet.example' ? ['10.0.0.5'] : []);

            $this->asAdmin()->postJson(self::API, [
                'site_url' => $url, 'sections' => ['content'], 'wp_user' => 'u', 'wp_password' => 'p',
            ])->assertStatus(422)->assertJsonValidationErrors(['site_url']);
        }

        $this->assertSame(0, WordPressImport::query()->count());
    }

    public function test_a_redirect_into_the_network_is_refused(): void
    {
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'shop.example' ? ['93.184.216.34'] : ['10.0.0.1']);
        Http::fake(['*' => Http::response('', 302, ['Location' => 'https://metadata.internal/latest/'])]);

        $this->expectException(UnsafeUrl::class);
        SafeHttp::get(self::SITE.'/wp-json/');
    }

    public function test_credentials_are_not_forwarded_to_another_host(): void
    {
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['93.184.216.34']);
        Http::fake([
            'shop.example/*' => Http::response('', 301, ['Location' => 'https://cdn.example/moved']),
            'cdn.example/*' => Http::response(['ok' => true]),
        ]);

        SafeHttp::get(self::SITE.'/wp-json/', ['basic' => ['editor', 'secret']]);

        Http::assertSent(fn (Request $r) => str_contains($r->url(), 'cdn.example') && ! $r->hasHeader('Authorization'));
    }

    public function test_a_scan_is_refused_when_nothing_drains_the_queue(): void
    {
        config(['queue.default' => 'database']);
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        Cache::forget(QueueHealth::WORKER_KEY);

        $this->asAdmin()->postJson(self::API, [
            'site_url' => self::SITE, 'sections' => ['content'], 'wp_user' => 'u', 'wp_password' => 'p',
        ])->assertStatus(422)->assertJsonValidationErrors(['queue']);
    }

    public function test_without_a_woocommerce_key_the_shop_is_read_with_the_application_password(): void
    {
        $this->fakeSite();
        $import = $this->start(['wc_key' => null, 'wc_secret' => null]);

        $this->assertSame('ready', $import->status, (string) $import->error);
        Http::assertSent(fn (Request $r) => str_contains($r->url(), '/wp-json/wc/v3/products') && $r->hasHeader('Authorization', 'Basic '.base64_encode('editor:abcdefghijklmnop')));
    }

    public function test_only_an_administrator_can_import(): void
    {
        $user = User::query()->create(['name' => 'Content', 'email' => 'content@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);
        $role = Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]);
        $user->roles()->sync([$role->id]);

        $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin')->plainTextToken)
            ->getJson(self::API)->assertForbidden();
    }
}
