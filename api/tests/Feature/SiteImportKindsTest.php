<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Media;
use App\Models\MenuItem;
use App\Models\Page;
use App\Models\Product;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\SiteImport;
use App\Models\User;
use App\Support\Chat\AiProvider;
use App\Support\Chat\AiReply;
use App\Support\CustomFonts;
use App\Support\Net\PublicHost;
use App\Support\QueueHealth;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

/**
 * The second half of the site import (0.164.0, `docs/site-import.md`): pages
 * sorted into pages, blog posts and catalogue products, the AI fallback, and
 * the site's colours and fonts — through the same faked network as
 * `SiteImportTest`, with the `AiProvider` faked and no request let out.
 */
class SiteImportKindsTest extends TestCase
{
    use RefreshDatabase;

    private const API = '/api/v1/admin/imports/site';

    private const PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82";

    private const CSS = ":root{--primary:#c2410c;--accent:#0ea5e9}\n"
        ."body{font-family:'Gotham',sans-serif;background:#ffffff;color:#1f2937}\n"
        ."h1,h2{font-family:'Fraunces',serif}\n"
        ."a{color:#c2410c}.btn{background:#c2410c;color:#fff}\n"
        ."@font-face{font-family:'Gotham';src:url('../fonts/gotham.woff2') format('woff2');font-weight:400}\n";

    /** @var array<string, string> path => html */
    private array $pages = [];

    /** @var list<string> every prompt the faked model was sent, system message first */
    private array $asked = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        config(['site_import.delay_ms' => 0]);
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'acme.test' ? ['93.184.216.34'] : []);
        $this->seed(SettingsSeeder::class);
        config(['services.openrouter.key' => null]);
    }

    // ── helpers ────────────────────────────────────────────────────────

    private function asAdmin(): static
    {
        $user = User::firstOrCreate(['email' => 'admin@technoware.in'], ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()])->id]);

        return $this->withHeader('Authorization', 'Bearer '.$user->load('roles')->createToken('admin')->plainTextToken);
    }

    private function start(): SiteImport
    {
        $this->asAdmin()->postJson(self::API, ['source' => 'url', 'start_url' => 'acme.test/'])->assertStatus(202);

        return SiteImport::query()->latest('id')->firstOrFail();
    }

    private function commit(SiteImport $import): SiteImport
    {
        $this->asAdmin()->postJson(self::API.'/'.$import->id.'/commit')->assertStatus(202);

        return $import->fresh();
    }

    private function decide(SiteImport $import, array $decisions): SiteImport
    {
        $this->asAdmin()->patchJson(self::API.'/'.$import->id, ['decisions' => $decisions])->assertStatus(202);

        return $import->fresh();
    }

    /** @return array<string, mixed> the import as the console reads it */
    private function review(SiteImport $import): array
    {
        return $this->asAdmin()->getJson(self::API.'/'.$import->id)->assertOk()->json('data');
    }

    private function row(array $review, string $path): array
    {
        return collect($review['analysis']['pages'])->firstWhere('path', $path) ?? $this->fail("No row for {$path}");
    }

    /** @return array<string, array<string, mixed>> */
    private function steps(array $review): array
    {
        return collect($review['analysis']['steps'])->keyBy('key')->all();
    }

    private function wrap(string $title, string $content, string $head = ''): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><title>'.$title.' | Acme Networks</title>'
            .'<link rel="stylesheet" href="/css/site.css"><link rel="stylesheet" href="https://fonts.example/other.css">'.$head.'</head><body>'
            .'<header><a href="/">Acme Networks</a><nav><ul>'
            .'<li><a href="/">Home</a></li><li><a href="/about">About</a></li><li><a href="/blog/wifi-tips.html">Tips</a></li><li><a href="/contact">Contact</a></li></ul></nav></header>'
            .$content
            .'<footer><p>&copy; 2026 Acme Networks. All rights reserved.</p><ul><li><a href="/privacy">Privacy</a></li></ul></footer>'
            .'</body></html>';
    }

    private function site(): void
    {
        $table = '<table><tr><th>Ports</th><td>24 x 1G</td></tr><tr><th>Uplinks</th><td>4 x SFP</td></tr><tr><th>Power</th><td>PoE+ 370W</td></tr><tr><th>Warranty</th><td>Limited lifetime</td></tr></table>';

        $this->pages = [
            '/' => $this->wrap('Home', '<h1>Managed IT that works</h1><p>We run the network so you can run the business, from the first survey to the last cable.</p><p>Read <a href="/blog/wifi-tips.html">our Wi-Fi tips</a> or see <a href="/products/switch-24">the 24 port switch</a>.</p>'
                .'<p><a href="/blog">The blog</a> <a href="/compare">Compare</a> <a href="/pricing">Pricing</a></p>'),
            '/about' => $this->wrap('About', '<h1>About us</h1><p>We started in 2012 and now look after three hundred sites across eastern India with a team of twenty engineers.</p>'),
            '/contact' => $this->wrap('Contact', '<h1>Contact</h1><p>Write to us and we will answer within a day, usually much sooner than that.</p>'),
            '/privacy' => $this->wrap('Privacy', '<h1>Privacy</h1><p>We keep very little about you and we keep it only as long as the law makes us keep it.</p>'),
            '/blog' => $this->wrap('Blog', '<h1>The blog</h1><p>Notes from our engineers about networks, offices and the odd disaster we were called in to tidy up.</p><p><a href="/blog/second-post">Cabling mistakes</a></p>'),
            '/blog/wifi-tips.html' => $this->wrap('Wi-Fi tips', '<main><article><h1>Wi-Fi tips</h1><p class="byline">By Asha Rao</p><time datetime="2026-03-04">4 March 2026</time>'
                .'<p>Put the access point high in the room and away from the metal cabinet that everyone keeps in the corner of the office.</p>'
                .'<img src="/img/tip.png" alt="An access point on a ceiling"><p>Then walk the floor with a phone and see where the signal drops, because that is where people will complain.</p></article></main>',
                '<meta name="description" content="Five ways to get better Wi-Fi in a small office."><meta property="og:image" content="https://acme.test/img/cover.png">'
                .'<script type="application/ld+json">{"@context":"https://schema.org","@type":"BlogPosting","headline":"Wi-Fi tips","datePublished":"2026-03-04T10:00:00+05:30","author":{"@type":"Person","name":"Asha Rao"}}</script>'),
            '/blog/second-post' => $this->wrap('Cabling', '<h1>Cabling mistakes</h1><p>The commonest mistake is a cable run beside mains power, which works on the day and fails in the monsoon.</p>'),
            '/products/switch-24' => $this->wrap('24 port switch', '<main><h1>24 port switch</h1><p>SKU: SW-24</p><p>A managed gigabit switch for a small rack, with four fibre uplinks.</p><img src="/img/switch.png" alt="The switch">'.$table.'</main>',
                '<meta name="description" content="A managed 24 port gigabit switch."><meta property="og:image" content="https://acme.test/img/switch-cover.png">'
                .'<script type="application/ld+json">{"@type":"Product","name":"24 port switch","sku":"SW-24"}</script>'),
            '/compare' => $this->wrap('Compare', '<h1>Compare switches</h1><p>Our two current models side by side, so you can decide which one suits the rack you have.</p>'.$table),
            '/pricing' => $this->wrap('Pricing', '<h1>Pricing</h1><h2>Why choose us</h2>'
                .'<h3>Fast</h3><p>We answer in minutes and fix most faults the same day, every day of the week.</p>'
                .'<h3>Fair</h3><p>One price per site with no surprise charges, and a monthly report you can read.</p>'
                .'<h3>Local</h3><p>Engineers who live in the city and can be at your door within two hours.</p>'),
        ];

        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            $path = parse_url($request->url(), PHP_URL_PATH) ?: '/';

            return match (true) {
                $path === '/robots.txt' => Http::response("User-agent: *\nDisallow:\n", 200, ['Content-Type' => 'text/plain']),
                $path === '/sitemap.xml' => Http::response('Not found', 404),
                $path === '/css/site.css' => Http::response(self::CSS, 200, ['Content-Type' => 'text/css']),
                $path === '/fonts/gotham.woff2' => Http::response('wOF2'.str_repeat("\0", 200), 200, ['Content-Type' => 'font/woff2']),
                str_starts_with($path, '/img/') => Http::response(self::PNG, 200, ['Content-Type' => 'image/png']),
                isset($this->pages[$path]) => Http::response($this->pages[$path], 200, ['Content-Type' => 'text/html; charset=utf-8']),
                default => Http::response('Not found', 404),
            };
        });
    }

    private function enableAi(bool $key = true): void
    {
        // `put()` is the write that seals a secret, as the settings screen does.
        Setting::put('seo_ai_enabled', '1');
        Setting::put('openrouter_api_key', $key ? 'sk-test' : null);
        Setting::flushCache();
    }

    /** Fake the model: `$answer` gets the system message and returns the reply text. */
    private function fakeAi(callable $answer): object
    {
        $fake = new class($answer, $this->asked) implements AiProvider
        {
            public int $calls = 0;

            public function __construct(private $answer, public array &$asked) {}

            public function complete(array $messages, int $maxTokens = 500, array $options = []): AiReply
            {
                $this->calls++;
                $this->asked[] = $messages[0]['content']."\n---\n".$messages[1]['content'];

                return AiReply::of(($this->answer)((string) $messages[0]['content'], (string) $messages[1]['content']), 40);
            }

            public function isConfigured(): bool
            {
                return true;
            }

            public function name(): string
            {
                return 'fake';
            }
        };
        $this->app->instance(AiProvider::class, $fake);

        return $fake;
    }

    private const PLACED = '{"type":"features","heading":"Why choose us","columns":3,"items":['
        .'{"title":"Fast","body":"We answer in minutes and fix most faults the same day, every day of the week."},'
        .'{"title":"Fair","body":"One price per site with no surprise charges, and a monthly report you can read."},'
        .'{"title":"Local","body":"Engineers who live in the city and can be at your door within two hours."}]}';

    // ── page, post or product ──────────────────────────────────────────

    public function test_pages_are_sorted_by_the_rules_and_the_commit_writes_what_the_review_counted(): void
    {
        $this->site();
        $import = $this->start();
        $this->assertSame('ready', $import->status, (string) $import->error);
        $review = $this->review($import);

        foreach (['/blog/wifi-tips' => 'post', '/blog/second-post' => 'post', '/products/switch-24' => 'product', '/blog' => 'page', '/about' => 'page', '/' => 'page'] as $path => $kind) {
            $this->assertSame($kind, $this->row($review, $path)['kind'], $path);
        }

        // Rules alone: a table with no SKU is ambiguous and, with no AI, a page.
        $this->assertSame('page', $this->row($review, '/compare')['kind']);
        $this->assertSame('rules', $this->row($review, '/compare')['by']);

        $steps = $this->steps($review);
        $this->assertSame(2, $steps['posts']['create']);
        $this->assertSame(1, $steps['products']['create']);
        $this->assertSame(0, BlogPost::count() + Product::count() + Page::count(), 'a review writes nothing');

        $import = $this->commit($import);
        $this->assertSame('completed', $import->status, (string) $import->error);
        $result = collect($import->counts)->keyBy('key');

        foreach (['pages', 'posts', 'products', 'media', 'menus'] as $key) {
            $this->assertSame($steps[$key]['create'], $result[$key]['create'], "{$key}: the commit made what the review said ".json_encode($result[$key]['reasons'] ?? []));
            $this->assertSame($steps[$key]['skip'], $result[$key]['skip'], "{$key}: skipped");
        }

        $post = BlogPost::where('slug', 'wifi-tips')->firstOrFail();
        $this->assertSame('draft', $post->status->value);
        $this->assertSame('sections', $post->body_layout);
        $this->assertNotEmpty($post->blocks);
        $this->assertSame('2026-03-04', $post->published_at->format('Y-m-d'));
        $this->assertSame('Five ways to get better Wi-Fi in a small office.', $post->excerpt);
        $this->assertNotNull($post->cover_image_path);
        $this->assertTrue(Media::where('path', $post->cover_image_path)->exists());
        $this->assertStringContainsString('access point high', (string) $post->body, 'the written body is kept beside the sections');
        $this->assertSame('/blog/wifi-tips', $post->publicPath());
        $this->assertSame('second-post', BlogPost::where('title', 'Cabling')->value('slug'), 'the blog folder is not part of the slug');

        $product = Product::where('slug', 'switch-24')->firstOrFail();
        $this->assertSame('draft', $product->status->value);
        $this->assertSame('SW-24', $product->sku);
        $this->assertSame(['Ports', 'Uplinks', 'Power', 'Warranty'], array_keys($product->specifications), 'the sheet in the order the page gave');
        $this->assertSame('24 x 1G', $product->specifications['Ports']);
        $this->assertSame('A managed 24 port gigabit switch.', $product->short_description);
        $this->assertGreaterThanOrEqual(2, count($product->images), 'the share image and the page\'s picture');
        $this->assertStringNotContainsString('Limited lifetime', (string) json_encode($product->blocks), 'the sheet is not repeated in the sections');
        $this->assertNull($product->brand_id);

        // Not published, no price anywhere, and nothing became a page twice.
        $this->assertSame(0, BlogPost::where('status', '!=', 'draft')->count() + Product::where('status', '!=', 'draft')->count());
        $this->assertSame(0, Page::whereIn('title', ['Wi-Fi tips', 'Cabling', '24 port switch'])->count());

        // The header's link to the post is a reference to the post.
        $this->assertTrue(MenuItem::where('type', 'blog_post')->where('target_id', $post->id)->exists());

        // The old address of a post (".html") redirects to where it lives now, though /blog is a route here.
        $this->assertSame('/blog/wifi-tips', Redirect::where('from_path', '/blog/wifi-tips.html')->value('to_path'));
    }

    public function test_a_kind_chosen_in_the_review_is_honoured_and_skip_still_works(): void
    {
        $this->site();
        $import = $this->start();

        $import = $this->decide($import, ['kinds' => ['/blog/second-post' => 'page', '/products/switch-24' => 'skip', '/about' => 'post']]);
        $review = $this->review($import);

        $this->assertSame('page', $this->row($review, '/blog/second-post')['kind']);
        $this->assertSame('you', $this->row($review, '/blog/second-post')['by']);
        $this->assertSame('post', $this->row($review, '/blog/second-post')['detected']);
        $this->assertSame('skip', $this->row($review, '/products/switch-24')['kind']);
        $this->assertSame('skip', $this->row($review, '/products/switch-24')['action']);
        $this->assertSame('post', $this->row($review, '/about')['kind']);

        // 0.163.0's `skip` list is the same thing under its old name, and keeps the other choices.
        $import = $this->decide($import, ['skip' => ['/contact']]);
        $review = $this->review($import);
        $this->assertSame('skip', $this->row($review, '/contact')['kind']);
        $this->assertSame('page', $this->row($review, '/blog/second-post')['kind'], 'a kind chosen earlier survives');

        $this->commit($import);
        $this->assertSame(0, Product::count());
        $this->assertTrue(Page::where('title', 'Cabling')->exists());
        $this->assertTrue(BlogPost::where('title', 'About')->exists());
        $this->assertFalse(Page::where('title', 'Contact')->exists());
        $this->asAdmin()->patchJson(self::API.'/'.$import->id, ['decisions' => ['kinds' => ['/x' => 'nonsense']]])->assertStatus(422);
    }

    public function test_importing_the_same_site_again_updates_posts_and_products_instead_of_copying_them(): void
    {
        $this->site();
        $this->commit($this->start());
        $this->assertSame(2, BlogPost::count());
        $this->assertSame(1, Product::count());

        $second = $this->start();
        $steps = $this->steps($this->review($second));
        $this->assertSame(2, $steps['posts']['update']);
        $this->assertSame(0, $steps['posts']['create']);
        $this->assertSame(1, $steps['products']['update']);

        $this->commit($second);
        $this->assertSame(2, BlogPost::count());
        $this->assertSame(1, Product::count());
        $this->assertSame(1, Product::where('slug', 'switch-24')->count());
    }

    // ── the AI fallback ────────────────────────────────────────────────

    public function test_the_ai_places_a_block_the_rules_could_not_and_the_commit_pays_nothing_more(): void
    {
        $this->site();
        $this->enableAi();
        $ai = $this->fakeAi(fn (string $system, string $user) => str_contains($system, 'placing one block')
            ? (str_contains($user, 'Why choose us') ? self::PLACED : '{"type":"none"}')
            : '{"kind":"page"}');

        $import = $this->start();
        $review = $this->review($import);
        $row = $this->row($review, '/pricing');

        $this->assertSame(1, $row['ai'], 'the review shows how many sections the AI placed');
        $this->assertSame(1, $row['types']['features']);
        $this->assertTrue($review['analysis']['decisions']['ai_assist']['value']);
        $this->assertStringContainsString('placed 1 section', implode(' ', $review['analysis']['notices']));

        $fence = collect($this->asked)->first(fn (string $m) => str_contains($m, 'Why choose us'));
        $this->assertNotNull($fence);
        $this->assertStringContainsString('---WEBSITE COPY---', $fence);
        $this->assertStringNotContainsString('<h3>', $fence, 'the model is shown text, never markup');

        $calls = $ai->calls;
        $steps = $this->steps($review);
        $import = $this->commit($import);
        $this->assertSame($calls, $ai->calls, 'the commit used the review\'s answers');

        // With the AI on, the review's counts are still the commit's.
        $result = collect($import->counts)->keyBy('key');
        foreach (['pages', 'posts', 'products', 'media', 'page_parts', 'menus'] as $key) {
            $this->assertSame($steps[$key]['create'] ?? 0, $result[$key]['create'] ?? 0, "{$key}: created");
            $this->assertSame($steps[$key]['skip'] ?? 0, $result[$key]['skip'] ?? 0, "{$key}: skipped");
        }

        $page = Page::where('title', 'Pricing')->firstOrFail();
        $types = array_column($page->blocks, 'type');
        $this->assertContains('features', $types);
        $features = collect($page->blocks)->firstWhere('type', 'features');
        $this->assertSame(['Fast', 'Fair', 'Local'], array_column($features['data']['items'], 'title'));

        // One run for the block used and one for the ambiguous /compare page the model settled; the rejected blocks cost nothing.
        $this->assertSame(2, Cache::get('seo:ai:runs:'.now()->toDateString()));
    }

    public function test_an_answer_that_changes_the_words_is_refused(): void
    {
        $this->site();
        $this->enableAi();
        $this->fakeAi(fn (string $system) => str_contains($system, 'placing one block')
            ? '{"type":"features","heading":"Why choose us","items":[{"title":"Cheapest","body":"Prices from 99 rupees a month, guaranteed for life."},{"title":"Best","body":"Voted the number one provider in the world."},{"title":"Biggest","body":"More engineers than anybody else anywhere."}]}'
            : '{"kind":"page"}');

        $row = $this->row($this->review($this->start()), '/pricing');

        $this->assertSame(0, $row['ai']);
        $this->assertSame([], array_diff(array_keys($row['types']), ['text', 'rich_text']), 'invented copy never becomes a section');
    }

    public function test_the_daily_cap_is_respected_and_the_commit_keeps_the_reviews_decision(): void
    {
        $this->site();
        $this->enableAi();
        Setting::put('seo_ai_daily_cap', '1');
        Setting::flushCache();

        // A second page with a block of its own, and no ambiguous page to spend the one run on.
        $this->pages['/compare'] = $this->wrap('Compare', '<h1>Compare</h1><p>Two models, side by side.</p>');
        $this->pages['/pricing'] = str_replace('</body>', '<a href="/pricing-two">more</a></body>', $this->pages['/pricing']);
        $this->pages['/pricing-two'] = $this->wrap('Pricing two', '<h1>Pricing two</h1><h2>Why we are different</h2>'
            .'<h3>Quick</h3><p>We reply in seconds and repair most faults within the hour, whatever day it happens to be.</p>'
            .'<h3>Honest</h3><p>A flat fee for each site and a plain report each month that says what we did.</p>'
            .'<h3>Near</h3><p>Our engineers live in this town and can reach your office in under two hours.</p>');

        $ai = $this->fakeAi(fn (string $system, string $user) => str_contains($system, 'placing one block')
            ? (str_contains($user, 'Why choose us') ? self::PLACED : (str_contains($user, 'Why we are different') ? self::PLACED_TWO : '{"type":"none"}'))
            : '{"kind":"page"}');

        $import = $this->start();
        $review = $this->review($import);

        $this->assertSame(1, array_sum(array_column($review['analysis']['pages'], 'ai')), 'one run a day, one block placed');
        $both = array_filter($this->asked, fn (string $m) => str_contains($m, 'Why choose us') || str_contains($m, 'Why we are different'));
        $this->assertCount(1, $both, 'the second pricing block was not even asked');
        $calls = $ai->calls;
        $this->assertSame(1, Cache::get('seo:ai:runs:'.now()->toDateString()));

        $this->commit($import);

        $this->assertSame($calls, $ai->calls, 'the commit keeps the review\'s decision, including the block the cap stopped');
        $this->assertSame(1, Page::get()->sum(fn (Page $p) => count(array_filter((array) $p->blocks, fn ($b) => $b['type'] === 'features'))));
    }

    private const PLACED_TWO = '{"type":"features","heading":"Why we are different","columns":3,"items":['
        .'{"title":"Quick","body":"We reply in seconds and repair most faults within the hour, whatever day it happens to be."},'
        .'{"title":"Honest","body":"A flat fee for each site and a plain report each month that says what we did."},'
        .'{"title":"Near","body":"Our engineers live in this town and can reach your office in under two hours."}]}';

    public function test_no_ai_when_it_is_off_has_no_key_or_the_review_turns_it_off(): void
    {
        $this->site();

        // Switched off.
        $ai = $this->fakeAi(fn () => self::PLACED);
        $review = $this->review($this->start());
        $this->assertSame(0, $ai->calls);
        $this->assertFalse($review['analysis']['decisions']['ai_assist']['available']);
        $this->assertFalse($review['analysis']['decisions']['ai_assist']['value']);
        $this->assertNotNull($review['analysis']['decisions']['ai_assist']['reason']);

        // On, but no key.
        $this->enableAi(key: false);
        $review = $this->review($this->start());
        $this->assertSame(0, $ai->calls);
        $this->assertFalse($review['analysis']['decisions']['ai_assist']['available']);

        // On with a key, then switched off in the review.
        $this->enableAi();
        $import = $this->start();
        $this->assertGreaterThan(0, $ai->calls);
        $this->assertTrue($this->review($import)['analysis']['decisions']['ai_assist']['value']);
        $calls = $ai->calls;
        $import = $this->decide($import, ['ai_assist' => false]);
        $review = $this->review($import);

        $this->assertFalse($review['analysis']['decisions']['ai_assist']['value']);
        $this->assertSame(0, array_sum(array_column($review['analysis']['pages'], 'ai')));
        $this->assertSame($calls, $ai->calls, 'turning it off asks nothing');

        $this->commit($import);
        $this->assertSame($calls, $ai->calls);
        $this->assertNotContains('features', array_column(Page::where('title', 'Pricing')->firstOrFail()->blocks, 'type'));
    }

    public function test_an_ambiguous_page_is_put_to_the_ai_within_the_same_cap(): void
    {
        $this->site();
        $this->enableAi();
        $ai = $this->fakeAi(fn (string $system) => str_contains($system, 'sorting the pages') ? '{"kind":"product"}' : '{"type":"none"}');

        $import = $this->start();
        $row = $this->row($this->review($import), '/compare');

        $this->assertSame('product', $row['kind']);
        $this->assertSame('ai', $row['by']);
        $this->assertGreaterThan(0, $ai->calls);

        $calls = $ai->calls;
        $this->commit($import);
        $this->assertSame($calls, $ai->calls, 'the commit does not ask again');
        $this->assertTrue(Product::where('slug', 'compare')->exists());

        // A person's choice beats the model's.
        $import = $this->start();
        $import = $this->decide($import, ['kinds' => ['/compare' => 'page']]);
        $this->assertSame('page', $this->row($this->review($import), '/compare')['kind']);
        $this->assertSame('you', $this->row($this->review($import), '/compare')['by']);
    }

    // ── colours and fonts ──────────────────────────────────────────────

    public function test_the_brand_is_found_shown_and_never_written_unless_accepted(): void
    {
        $this->site();
        $before = Setting::query()->whereIn('key', ['theme', 'theme_primary', 'theme_accent', 'theme_font_display', 'theme_font_body'])->pluck('value', 'key')->all();
        $import = $this->start();
        $brand = $this->review($import)['analysis']['decisions']['brand'];

        $this->assertTrue($brand['found']);
        $this->assertSame(1, $brand['sheets'], 'the site\'s own stylesheet; the one on another host is not read');
        $this->assertSame('#c2410c', $brand['colours']['primary']);
        $this->assertSame('#0ea5e9', $brand['colours']['accent']);
        $this->assertSame('fraunces', $brand['fonts']['display']['id']);
        $this->assertNull($brand['fonts']['body']['id']);
        $this->assertNotNull($brand['fonts']['body']['custom'], 'a WOFF2 file is offered for a custom slot');
        $this->assertFalse($brand['accept'], 'never accepted by default');

        $this->commit($import);
        $this->assertEquals($before, Setting::query()->whereIn('key', array_keys($before))->pluck('value', 'key')->all(), 'nothing written without a tick');
        $this->assertNull(CustomFonts::slot(1)['regular']);
        $this->assertArrayNotHasKey('brand', collect($import->fresh()->counts)->keyBy('key')->all());
    }

    public function test_an_accepted_brand_is_applied_through_the_settings_rules(): void
    {
        $this->site();
        $import = $this->decide($this->start(), ['brand' => ['accept' => true]]);
        $this->assertTrue($this->review($import)['analysis']['decisions']['brand']['accept']);

        $this->commit($import);

        $this->assertSame('custom', Setting::get('theme'));
        $this->assertSame('#c2410c', Setting::get('theme_primary'));
        $this->assertSame('#0ea5e9', Setting::get('theme_accent'));
        $this->assertSame('#ffffff', Setting::get('theme_background'));
        $this->assertSame('#1f2937', Setting::get('theme_text'));
        $this->assertSame('fraunces', Setting::get('theme_font_display'));
        $this->assertSame('custom-1', Setting::get('theme_font_body'));
        $this->assertSame('Gotham', CustomFonts::slot(1)['name']);
        $this->assertNotNull(CustomFonts::slot(1)['regular']);
        $this->assertGreaterThan(0, collect($import->fresh()->counts)->keyBy('key')['brand']['update']);
    }

    public function test_a_custom_slot_that_already_holds_a_font_is_never_replaced(): void
    {
        $this->site();
        CustomFonts::store(1, 'Mine', new UploadedFile($this->woff2(), 'a.woff2', 'font/woff2', null, true), null, false);
        CustomFonts::store(2, 'Also mine', new UploadedFile($this->woff2(), 'b.woff2', 'font/woff2', null, true), null, false);

        $import = $this->decide($this->start(), ['brand' => ['accept' => true, 'colours' => false]]);
        $import = $this->commit($import);

        $this->assertSame('Mine', CustomFonts::slot(1)['name']);
        $this->assertSame('Also mine', CustomFonts::slot(2)['name']);
        $this->assertNotSame('custom-1', Setting::get('theme_font_body'));
        $this->assertNotSame('#c2410c', Setting::get('theme_primary'), 'colours were not ticked');
        $this->assertStringContainsString('both custom font slots', implode(' ', $import->problems ?? []));
    }

    private function woff2(): string
    {
        $path = (string) tempnam(sys_get_temp_dir(), 'w2');
        file_put_contents($path, 'wOF2'.str_repeat("\0", 64));

        return $path;
    }

    public function test_a_zip_s_stylesheet_gives_its_brand(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'zip').'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        $shell = fn (string $t, string $c) => '<html><head><title>'.$t.' - Sunrise</title><link rel="stylesheet" href="css/site.css"></head><body><div id="top"><ul><li><a href="index.html">Home</a></li><li><a href="about.html">About</a></li></ul></div>'.$c.'<div id="bottom"><p>Sunrise Accounting, 12 Park Street, Kolkata. Open Monday to Friday.</p></div></body></html>';
        $zip->addFromString('site/index.html', $shell('Home', '<h1>Welcome</h1><p>We keep the books for small businesses across Kolkata, and have since 1998, for a fixed monthly fee.</p>'));
        $zip->addFromString('site/about.html', $shell('About', '<h1>About us</h1><p>Two chartered accountants who were tired of firms that only answered in March, and started their own.</p>'));
        $zip->addFromString('site/css/site.css', ".btn{background:#7c3aed}a{color:#7c3aed}body{font-family:'Lora',serif}");
        $zip->close();

        $bytes = (string) file_get_contents($path);
        $this->asAdmin()->post(self::API.'/upload', ['name' => 'site.zip', 'index' => 0, 'total' => 1, 'chunk' => UploadedFile::fake()->createWithContent('chunk', $bytes)], ['Accept' => 'application/json'])->assertOk();
        $this->asAdmin()->postJson(self::API, ['source' => 'zip', 'zip' => 'site.zip'])->assertStatus(202);
        $import = SiteImport::latest('id')->firstOrFail();

        $this->assertSame('ready', $import->status, (string) $import->error);
        $brand = $this->review($import)['analysis']['decisions']['brand'];
        $this->assertSame('#7c3aed', $brand['colours']['primary']);
        $this->assertSame('lora', $brand['fonts']['body']['id']);
    }
}
