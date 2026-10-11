<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\Menu;
use App\Models\Page;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\SiteImport;
use App\Models\User;
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
 * Importing a website with no API (0.163.0, `docs/site-import.md`), end to
 * end: a live address read through a faked network and an uploaded ZIP.
 *
 * The queue runs synchronously in tests, so starting a scan runs the whole
 * chain — scan, chrome, analysis — inside the request, and committing runs
 * the whole commit. Every request goes through `SafeHttp`; `Http::fake()` with
 * `preventStrayRequests()` means none reaches a network.
 */
class SiteImportTest extends TestCase
{
    use RefreshDatabase;

    private const API = '/api/v1/admin/imports/site';

    private const PNG = "\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82";

    /** @var array<string, string> path => html, what the faked site answers */
    private array $pages = [];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('public');
        Storage::fake('local');
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        config(['site_import.delay_ms' => 0]);
        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => $host === 'acme.test' ? ['93.184.216.34'] : []);
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

    private function start(array $overrides = []): SiteImport
    {
        $this->asAdmin()->postJson(self::API, $overrides + ['source' => 'url', 'start_url' => 'acme.test/'])->assertStatus(202);

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

    /** A page of the faked site: the same header and footer around different content. */
    private function wrap(string $title, string $content): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><title>'.$title.' | Acme Networks</title>'
            .'<meta name="description" content="About '.$title.'"><script>var x = 1;</script></head><body>'
            .'<header><a href="/">Acme Networks</a><nav><ul>'
            .'<li><a href="/">Home</a></li><li><a href="/about">About</a></li>'
            .'<li><a href="/services">Services</a><ul><li><a href="/company/team">Team</a></li></ul></li>'
            .'<li><a href="/contact">Contact</a></li></ul></nav></header>'
            .$content
            .'<footer><p>&copy; 2026 Acme Networks. All rights reserved.</p><ul><li><a href="/privacy">Privacy</a></li><li><a href="/terms">Terms</a></li></ul></footer>'
            .'</body></html>';
    }

    private function site(): void
    {
        $this->pages = [
            '/' => $this->wrap('Home', '<div class="hero" style="background-image:url(/img/hero.png)"><h1>Managed IT that works</h1><p>We run the network so you can run the business.</p><a class="btn btn-primary" href="/contact">Get a quote</a></div>'
                .'<div class="row"><div class="col"><h3>Wi-Fi</h3><p>Surveys, design and installs.</p></div><div class="col"><h3>Cabling</h3><p>Cat6 and fibre.</p></div><div class="col"><h3>Support</h3><p>A named engineer.</p></div></div>'
                .'<h2>Why us</h2><p>Read <a href="old-page.html">our old page</a> or the <a href="/files/brochure.pdf">brochure</a> or <a href="/about#team">the team</a>.</p><img src="/img/office.png" alt="The office">'),
            '/about' => $this->wrap('About', '<h1>About us</h1><p>We started in 2012 and now look after three hundred sites across eastern India with a team of twenty engineers.</p><img src="/img/team.png" alt="The team"><p>Back to <a href="/">home</a>.</p>'),
            '/services' => $this->wrap('Services', '<h1>Services</h1><h2>Do you cover Kolkata?</h2><p>Yes.</p><h2>Is there a contract?</h2><p>Annual.</p><h2>Do you do cabling?</h2><p>Yes, Cat6 and fibre.</p>'),
            '/contact' => $this->wrap('Contact', '<h1>Contact</h1><p>Write to us and we will answer within a day.</p><form action="/send" method="post"><label for="n">Name</label><input id="n" name="name" type="text" required><label for="e">Email</label><input id="e" name="email" type="email" required><textarea name="message"></textarea><button type="submit">Send</button></form>'),
            '/company/team' => $this->wrap('Team', '<h1>The team</h1><p>Twenty engineers, four of whom have been with us from the start and know every site by heart.</p>'),
            '/old-page.html' => $this->wrap('Old page', '<h1>An old page</h1><p>This page was written years ago and still has readers who arrive from search.</p>'),
            '/private/secret' => $this->wrap('Secret', '<h1>Secret</h1><p>Not for crawlers.</p>'),
            '/privacy' => $this->wrap('Privacy', '<h1>Privacy</h1><p>We keep very little about you and we keep it only as long as the law makes us.</p>'),
            '/terms' => $this->wrap('Terms', '<h1>Terms</h1><p>The usual terms apply to everything we sell, and they are short enough to read.</p>'),
        ];

        Http::preventStrayRequests();
        Http::fake(function (Request $request) {
            $path = parse_url($request->url(), PHP_URL_PATH) ?: '/';

            if ($path === '/robots.txt') {
                return Http::response("User-agent: *\nDisallow: /private/\n", 200, ['Content-Type' => 'text/plain']);
            }

            if ($path === '/sitemap.xml') {
                return Http::response('<urlset><url><loc>https://acme.test/about</loc></url><url><loc>https://acme.test/private/secret</loc></url><url><loc>https://acme.test/gone</loc></url></urlset>', 200, ['Content-Type' => 'application/xml']);
            }

            if (str_starts_with($path, '/img/')) {
                return Http::response(self::PNG, 200, ['Content-Type' => 'image/png']);
            }

            if ($path === '/files/brochure.pdf') {
                return Http::response("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF", 200, ['Content-Type' => 'application/pdf']);
            }

            if (isset($this->pages[$path])) {
                return Http::response($this->pages[$path], 200, ['Content-Type' => 'text/html; charset=utf-8']);
            }

            return Http::response('Not found', 404);
        });
    }

    public function test_a_scan_reads_the_site_and_the_review_counts_without_writing(): void
    {
        $this->site();
        $import = $this->start();

        $this->assertSame('ready', $import->status, (string) $import->error);

        $data = $this->asAdmin()->getJson(self::API.'/'.$import->id)->assertOk()->json('data');
        $steps = collect($data['analysis']['steps'])->keyBy('key');

        // The privacy and terms pages are linked from the footer, so they are read; the secret one is robots.txt's.
        $this->assertSame(8, $data['site']['pages']);
        $this->assertSame(8, $steps['pages']['create']);
        $this->assertSame('Acme Networks', $data['site']['name']);
        $this->assertGreaterThan(0, $data['site']['chrome_blocks']);
        $this->assertEquals(['primary' => 4, 'footer' => 2], $data['site']['menus']);

        $reasons = collect($data['site']['skipped'])->pluck('reason')->implode(' | ');
        $this->assertStringContainsString('robots.txt', $reasons);
        $this->assertStringContainsString('answered 404', $reasons);

        // A review writes nothing.
        $this->assertSame(0, Page::count());
        $this->assertSame(0, Media::count());
        $this->assertSame(0, Menu::count());
        $this->assertSame(0, Redirect::count());
        $this->assertSame(0, Form::count());
        $this->assertCount(8, $data['analysis']['pages']);
    }

    public function test_the_commit_writes_what_the_review_counted_as_drafts_with_menus_unassigned(): void
    {
        $this->site();
        $import = $this->start();
        $review = collect($this->asAdmin()->getJson(self::API.'/'.$import->id)->json('data.analysis.steps'))->keyBy('key');

        $import = $this->commit($import);
        $this->assertSame('completed', $import->status, (string) $import->error);
        $result = collect($import->counts)->keyBy('key');

        foreach (['pages', 'media', 'menus', 'page_parts'] as $key) {
            $this->assertSame($review[$key]['create'], $result[$key]['create'], "{$key}: the commit made what the review said");
            $this->assertSame($review[$key]['skip'], $result[$key]['skip'], "{$key}: skipped");
        }

        // Everything is a draft, built from sections; nothing is the live site's.
        $this->assertSame(8, Page::count());
        $this->assertSame(0, Page::where('status', '!=', 'draft')->count());
        $this->assertSame(0, Page::where('template', '!=', 'builder')->count());

        $home = Page::where('slug', 'home-page')->firstOrFail();
        $types = collect($home->blocks)->pluck('type')->all();
        $this->assertSame('hero', $types[0]);
        $this->assertContains('features', $types);

        // The site's header and footer are not in any page.
        $this->assertStringNotContainsString('All rights reserved', (string) json_encode(Page::pluck('blocks')));
        $this->assertStringNotContainsString('<script', (string) json_encode(Page::pluck('blocks')));

        // The page's own words: title without the site's name, description, no canonical.
        $about = Page::where('title', 'About')->firstOrFail();
        $this->assertSame('about-2', $about->slug, 'an address this site already routes gets the next free one');
        $this->assertSame('About', $about->title);
        $this->assertSame('About About', $about->seo->description);
        $this->assertNull($about->seo->canonical_url);

        // Menus come across unassigned, with pages as record references.
        $this->assertSame(2, Menu::count());
        $this->assertSame(0, Menu::whereNotNull('location')->count());
        $header = Menu::where('name', 'like', 'Header menu%')->firstOrFail();
        $this->assertSame(5, $header->items()->count());
        $this->assertSame('page', $header->items()->where('label', 'About')->firstOrFail()->type->value);
        $team = $header->items()->where('label', 'Team')->firstOrFail();
        $this->assertSame($header->items()->where('label', 'Services')->value('id'), $team->parent_id);

        // Pictures and the brochure are in the library, in their folder.
        $this->assertGreaterThanOrEqual(3, Media::count());
        $this->assertSame('Site import', Media::first()->folder?->name);

        // The contact form became a form of its own, placed as a section.
        $this->assertSame(1, Form::count());
        $contact = Page::where('title', 'Contact')->firstOrFail();
        $this->assertContains('form', collect($contact->blocks)->pluck('type')->all());
    }

    public function test_links_are_rewritten_and_old_addresses_are_redirected(): void
    {
        $this->site();
        $this->commit($this->start());

        $home = Page::where('slug', 'home-page')->firstOrFail();
        $json = (string) json_encode($home->blocks, JSON_UNESCAPED_SLASHES);

        // A relative link to a page, an anchor into another, and the brochure in the library.
        $this->assertStringContainsString('href=\"/old-page\"', $json);
        $this->assertStringContainsString('href=\"/about-2#team\"', $json);
        $this->assertStringNotContainsString('acme.test', $json);
        $this->assertStringContainsString('/storage/', $json);

        // Nested and ".html" addresses are answered; ones that are already the page's own are not.
        $this->assertSame('/company-team', Redirect::where('from_path', '/company/team')->value('to_path'));
        $this->assertSame('/old-page', Redirect::where('from_path', '/old-page.html')->value('to_path'));
        $this->assertSame(0, Redirect::where('from_path', '/about')->count(), 'never over an address this site serves');
        $this->assertSame(0, Redirect::where('from_path', '/')->count());
        $this->assertSame(301, Redirect::where('from_path', '/company/team')->value('status_code'));
    }

    public function test_the_homepage_is_set_only_when_ticked(): void
    {
        $this->seed(SettingsSeeder::class);
        $this->site();
        $import = $this->start();
        $before = Setting::get('homepage_page_id');
        $this->commit($import);

        $this->assertSame($before, Setting::get('homepage_page_id'));

        // Ticked in the review of a second reading: the home page becomes the site's.
        $second = $this->start();
        $second = $this->decide($second, ['set_homepage' => true]);
        $this->assertTrue($second->analysis['decisions']['set_homepage']['value']);
        $this->commit($second);

        $this->assertSame((string) Page::where('slug', 'home-page')->value('id'), (string) Setting::get('homepage_page_id'));
    }

    public function test_a_page_can_be_left_out_and_a_menu_too(): void
    {
        $this->site();
        $import = $this->decide($this->start(), ['skip' => ['/contact', '/privacy'], 'menus' => ['primary']]);
        $steps = collect($this->asAdmin()->getJson(self::API.'/'.$import->id)->json('data.analysis.steps'))->keyBy('key');

        $this->assertSame(6, $steps['pages']['create']);
        $this->assertSame(2, $steps['pages']['skip']);
        $this->assertSame(1, $steps['menus']['create']);
        $this->assertArrayNotHasKey('page_parts', $steps->all());

        $this->commit($import);
        $this->assertSame(0, Page::where('title', 'Contact')->count());
        $this->assertSame(0, Form::count());
        $this->assertSame(1, Menu::count());
    }

    public function test_a_second_import_updates_in_place_and_leaves_edited_pages_alone(): void
    {
        $this->site();
        $this->commit($this->start());
        $slugs = Page::orderBy('id')->pluck('slug')->all();
        $count = Page::count();
        $media = Media::count();

        // Somebody edits a page here; the old site changes another.
        Page::where('title', 'About')->update(['title' => 'Our story']);
        $this->pages['/company/team'] = $this->wrap('Team', '<h1>The team</h1><p>Now thirty engineers, and the founders still know every site by heart and answer the phone.</p>');

        $second = $this->start();
        $steps = collect($this->asAdmin()->getJson(self::API.'/'.$second->id)->json('data.analysis.steps'))->keyBy('key');

        $this->assertSame(0, $steps['pages']['create']);
        $this->assertSame(8, $steps['pages']['update']);
        $this->assertSame(1, $steps['pages']['warn']);

        $this->commit($second);

        $this->assertSame($count, Page::count());
        $this->assertSame($slugs, Page::orderBy('id')->pluck('slug')->all());
        $this->assertSame($media, Media::count());
        $this->assertSame('Our story', Page::where('slug', 'about-2')->value('title'));
        $this->assertStringContainsString('thirty engineers', (string) json_encode(Page::where('slug', 'company-team')->value('blocks')));
        $this->assertSame(1, Form::count());
    }

    public function test_an_address_that_must_not_be_read_is_refused_and_only_an_administrator_may_import(): void
    {
        $this->asAdmin()->postJson(self::API, ['source' => 'url', 'start_url' => 'http://127.0.0.1/'])
            ->assertStatus(422)->assertJsonValidationErrors('start_url');
        $this->asAdmin()->postJson(self::API, ['source' => 'url', 'start_url' => 'http://localhost:8000'])
            ->assertStatus(422)->assertJsonValidationErrors('start_url');
        $this->asAdmin()->postJson(self::API, ['source' => 'url'])->assertStatus(422);

        $this->assertSame(0, SiteImport::count());

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$this->makeEditor())
            ->postJson(self::API, ['source' => 'url', 'start_url' => 'acme.test'])->assertForbidden();
    }

    private function makeEditor(): string
    {
        $user = User::create(['name' => 'Editor', 'email' => 'editor@technoware.in', 'password' => 'password-for-tests', 'is_active' => true]);
        $role = Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]);
        $user->roles()->sync([$role->id]);

        return $user->createToken('admin')->plainTextToken;
    }

    public function test_nothing_draining_the_queue_refuses_the_scan(): void
    {
        $this->site();
        config(['queue.default' => 'database']);
        Cache::forget(QueueHealth::HEARTBEAT_KEY);

        $this->asAdmin()->postJson(self::API, ['source' => 'url', 'start_url' => 'acme.test'])
            ->assertStatus(422)->assertJsonValidationErrors('queue');
    }

    public function test_a_site_that_answers_nothing_fails_with_a_sentence(): void
    {
        Http::preventStrayRequests();
        Http::fake(fn () => Http::response('Not found', 404));

        $import = $this->start();

        $this->assertSame('failed', $import->status);
        $this->assertStringContainsString('No page could be read', (string) $import->error);
    }

    // ── a ZIP ──────────────────────────────────────────────────────────

    /** @param  array<string, string>  $files */
    private function zip(array $files): string
    {
        $path = tempnam(sys_get_temp_dir(), 'zip').'.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);

        foreach ($files as $name => $bytes) {
            $zip->addFromString($name, $bytes);
        }

        $zip->close();

        return $path;
    }

    /**
     * Upload a file in two pieces, as the console does, and return the name it is started with.
     * The fields are strings because a browser's multipart body carries nothing else.
     */
    private function upload(string $path, string $name = 'site.zip'): string
    {
        $bytes = (string) file_get_contents($path);
        $half = intdiv(strlen($bytes), 2);

        foreach ([substr($bytes, 0, $half), substr($bytes, $half)] as $i => $piece) {
            $chunk = UploadedFile::fake()->createWithContent('chunk', $piece);
            $this->asAdmin()->post(self::API.'/upload', ['name' => $name, 'index' => (string) $i, 'total' => '2', 'chunk' => $chunk], ['Accept' => 'application/json'])
                ->assertOk()->assertJsonPath('data.complete', $i === 1);
        }

        return $name;
    }

    private function siteZip(): string
    {
        $shell = fn (string $title, string $content) => '<html><head><title>'.$title.' - Sunrise</title></head><body>'
            .'<div id="top"><ul id="menu"><li><a href="index.html">Home</a></li><li><a href="company/">About</a></li><li><a href="reach-us.html">Contact</a></li></ul></div>'
            .$content.'<div id="bottom"><p>Sunrise Accounting, 12 Park Street, Kolkata. Open Monday to Friday.</p></div></body></html>';

        return $this->zip([
            'site/index.html' => $shell('Home', '<h1>Welcome</h1><p>We keep the books for small businesses across Kolkata, and have since 1998, for a fixed monthly fee.</p><img src="images/shop.png" alt="Our office"><p><a href="company/">About</a> <a href="missing.html">missing</a></p>'),
            'site/company/index.html' => $shell('About', '<h1>About us</h1><p>Two chartered accountants who were tired of firms that only answered in March, and started their own.</p>'),
            'site/reach-us.html' => $shell('Contact', '<h1>Contact</h1><p>Ring us any weekday between ten and five, or write to the address below.</p>'),
            'site/images/shop.png' => self::PNG,
            'site/js/app.js' => 'alert(1)',
            'site/run.php' => '<?php echo 1;',
            'site/404.html' => '<html><body><h1>Not found</h1></body></html>',
            '../evil.html' => '<html><body>escape</body></html>',
        ]);
    }

    public function test_an_uploaded_zip_is_read_checked_and_imported_without_ever_being_executed(): void
    {
        $name = $this->upload($this->siteZip());
        $this->asAdmin()->postJson(self::API, ['source' => 'zip', 'zip' => $name])->assertStatus(202);
        $import = SiteImport::latest('id')->firstOrFail();

        $this->assertSame('ready', $import->status, (string) $import->error);
        $data = $this->asAdmin()->getJson(self::API.'/'.$import->id)->assertOk()->json('data');
        $reasons = collect($data['site']['skipped'])->pluck('reason')->implode(' | ');

        $this->assertSame(3, $data['site']['pages']);
        $this->assertStringContainsString('unsafe path', $reasons);
        $this->assertStringContainsString('(.php)', $reasons);
        $this->assertStringContainsString('(.js)', $reasons);
        $this->assertStringContainsString('error page', $reasons);
        $this->assertFalse(Storage::disk('local')->exists('evil.html'));

        $this->commit($import);
        $this->assertSame(3, Page::count());
        $this->assertSame(1, Media::count());
        $this->assertSame('/company', Page::where('title', 'About')->firstOrFail()->publicPath());
        $this->assertSame('home-page', Page::where('title', 'Home')->value('slug'), 'index.html is the home page, not a page called index');

        $json = (string) json_encode(Page::pluck('blocks'), JSON_UNESCAPED_SLASHES);
        $this->assertStringNotContainsString('zip.import', $json);
        $this->assertStringContainsString('href=\"/company\"', $json);
        // A link to something the ZIP does not hold is the bare path, not a dead host.
        $this->assertStringContainsString('href=\"/missing\"', $json);
        $this->assertSame('/company', Redirect::where('from_path', '/company/index.html')->value('to_path'));

        // The upload and the harvest are gone once it has been imported.
        $this->assertSame([], Storage::disk('local')->allFiles('site-imports'));
    }

    public function test_a_zip_over_its_file_cap_or_not_a_zip_is_refused(): void
    {
        config(['site_import.zip.max_files' => 2]);
        $name = $this->upload($this->siteZip());
        $this->asAdmin()->postJson(self::API, ['source' => 'zip', 'zip' => $name])->assertStatus(202);

        $import = SiteImport::latest('id')->firstOrFail();
        $this->assertSame('failed', $import->status);
        $this->assertStringContainsString('the limit is 2', (string) $import->error);

        $chunk = UploadedFile::fake()->createWithContent('chunk', 'this is not a zip at all');
        $this->asAdmin()->post(self::API.'/upload', ['name' => 'fake.zip', 'index' => 0, 'total' => 1, 'chunk' => $chunk], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('chunk');
    }

    public function test_a_gallery_is_made_from_a_strip_of_logos(): void
    {
        $this->site();
        $this->pages['/'] = $this->wrap('Home', '<h1>Hello</h1><p>We work with a number of well known companies across the region and have for years.</p>'
            .'<div class="clients"><img src="/img/a.png" alt="A"><img src="/img/b.png" alt="B"><img src="/img/c.png" alt="C"><img src="/img/d.png" alt="D"></div>');

        $this->commit($this->start());

        $this->assertSame(1, Gallery::count());
        $this->assertSame(4, Gallery::first()->items()->count());
        $this->assertContains('gallery', collect(Page::where('slug', 'home-page')->value('blocks'))->pluck('type')->all());
    }

    public function test_a_zip_that_unpacks_to_more_than_the_cap_is_refused_before_anything_is_written(): void
    {
        config(['site_import.zip.max_unpacked_bytes' => 200]);
        $name = $this->upload($this->siteZip());
        $this->asAdmin()->postJson(self::API, ['source' => 'zip', 'zip' => $name])->assertStatus(202);

        $import = SiteImport::latest('id')->firstOrFail();
        $this->assertSame('failed', $import->status);
        $this->assertStringContainsString('unpacks to', (string) $import->error);
        $this->assertSame(0, Page::count());
    }

    public function test_a_cancelled_import_leaves_no_files_behind(): void
    {
        $this->site();
        $import = $this->start();
        $this->assertNotEmpty(Storage::disk('local')->allFiles('site-imports'));

        $this->asAdmin()->deleteJson(self::API.'/'.$import->id)->assertOk();

        $this->assertSame('cancelled', $import->fresh()->status);
        $this->assertSame([], Storage::disk('local')->allFiles('site-imports'));
        $this->assertSame(0, Page::count());
    }

    public function test_the_prune_command_expires_a_review_nobody_finished(): void
    {
        $this->site();
        $import = $this->start();
        $import->update(['expires_at' => now()->subHour()]);

        $this->artisan('technoware:prune-site-imports')->assertSuccessful();

        $this->assertSame('expired', $import->fresh()->status);
        $this->assertSame([], Storage::disk('local')->allFiles('site-imports'));
    }
}
