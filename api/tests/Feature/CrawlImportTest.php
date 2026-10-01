<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Enums\SuppressionReason;
use App\Jobs\CrawlWebsiteForSubscribers;
use App\Models\NewsletterGroup;
use App\Models\NewsletterImport;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Net\PublicHost;
use App\Support\Newsletter\CrawlState;
use App\Support\Newsletter\WebsiteCrawler;
use App\Support\QueueHealth;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Subscribers from a website (docs/newsletter.md "Crawling a website"), end
 * to end against a faked directory: an association's site whose member page
 * lists three businesses as cards, two of which have sites of their own with
 * a contact page. The queue runs synchronously here, so starting a crawl runs
 * every slice inside the request and the row comes back `ready`.
 */
class CrawlImportTest extends TestCase
{
    use RefreshDatabase;

    private const API = '/api/v1/admin/newsletter/imports';

    /** @var array<string, array{0: int, 1: string, 2?: array<string, string>}> url => [status, body, headers] */
    private array $site = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        Storage::fake('local');
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
        config(['crawl.delay_ms' => 0, 'crawl.allow_private_hosts' => false]);

        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => str_ends_with($host, '.internal') ? ['10.0.0.5'] : ['93.184.216.34']);

        $this->site = $this->directory();
        Http::fake(function (Request $request) {
            $url = $request->url();

            if (str_starts_with($url, 'https://api.hunter.io/')) {
                return $this->hunter($request);
            }

            $key = strtok($url, '?');
            [$status, $body, $headers] = ($this->site[$key] ?? [404, 'Not found']) + [2 => ['Content-Type' => 'text/html; charset=utf-8']];

            return Http::response($body, $status, $headers);
        });
    }

    /* --------------------------------------------------------------- the site */

    /** @return array<string, array{0: int, 1: string, 2?: array<string, string>}> */
    private function directory(): array
    {
        $page = fn (string $title, string $body) => [200, "<html><head><title>{$title}</title></head><body>{$body}</body></html>"];

        return [
            'https://hooghlytraders.in/robots.txt' => [200, "User-agent: *\nDisallow: /private/\n", ['Content-Type' => 'text/plain']],
            'https://hooghlytraders.in/' => $page('Hooghly Traders Association', '<a href="/members">Members</a> <a href="/private/list">Private</a> <a href="/brochure.pdf">Brochure</a> <p>secretary@hooghlytraders.in</p>'),
            'https://hooghlytraders.in/members' => $page('Members — Hooghly Traders Association',
                '<div class="card"><h3>Anand Hardware</h3><a href="https://www.anandhardware.in/">Website</a> <a href="mailto:anand@anandhardware.in">Email</a></div>'
                .'<div class="card"><h3>Bose Electricals</h3><p>bose.electricals@gmail.com</p><a href="https://boseelectricals.in/">Website</a></div>'
                .'<div class="card"><h3>Chatterjee &amp; Sons</h3><p>office [at] chatterjeesons [dot] in</p></div>'
                .'<a href="https://facebook.com/hooghlytraders">Facebook</a> <a href="/members/page-2">Next</a>'),
            'https://hooghlytraders.in/members/page-2' => $page('Members, page 2', '<div><h3>Das Paints</h3><p>das@daspaints.in</p></div>'),
            'https://hooghlytraders.in/private/list' => $page('Private', '<p>hidden@hooghlytraders.in</p>'),
            'https://www.anandhardware.in/' => $page('Anand Hardware | Tools since 1972', '<a href="/contact-us">Contact us</a> <a href="/products">Products</a>'),
            'https://www.anandhardware.in/contact-us' => $page('Contact — Anand Hardware', '<p><a href="mailto:rahul@anandhardware.in">Rahul Anand</a>, proprietor</p>'),
            'https://www.anandhardware.in/products' => $page('Products', '<p>catalogue@anandhardware.in</p>'),
            'https://boseelectricals.in/' => $page('Bose Electricals', '<p>Nothing to see.</p>'),
        ];
    }

    private int $searchesLeft = 5;

    private function hunter(Request $request)
    {
        if (str_contains($request->url(), '/account')) {
            return Http::response(['data' => ['plan_name' => 'Starter', 'requests' => [
                'searches' => ['used' => 0, 'available' => $this->searchesLeft],
                'verifications' => ['used' => 0, 'available' => 100],
            ]]]);
        }

        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

        return Http::response(['data' => ['organization' => ucfirst(explode('.', (string) $query['domain'])[0]), 'emails' => [
            ['value' => 'accounts@'.$query['domain'], 'first_name' => 'Mita', 'last_name' => 'Sen', 'position' => 'Accounts'],
        ]]]);
    }

    /* ------------------------------------------------------------------ helpers */

    private function manager(string $role = RoleEnum::CampaignManager->value): User
    {
        $user = User::firstOrCreate(['email' => $role.'@technoware.in'], ['name' => 'Staff', 'password' => 'password-for-tests', 'is_active' => true]);
        $model = Role::firstOrCreate(['slug' => $role], ['name' => $role]);
        $user->roles()->syncWithoutDetaching([$model->id]);

        return $user->load('roles');
    }

    private function as(?User $user = null): static
    {
        return $this->withHeader('Authorization', 'Bearer '.($user ?? $this->manager())->createToken('admin')->plainTextToken);
    }

    /** Start a crawl through the endpoint and return the row, finished (the queue is synchronous). */
    private function crawl(array $overrides = []): NewsletterImport
    {
        $this->as()->postJson(self::API.'/crawl', $overrides + [
            'start_url' => 'hooghlytraders.in/',
            'depth' => 1,
            'max_pages' => 50,
            'industry' => 'Hardware retail',
            'location' => 'Howrah',
        ])->assertStatus(202);

        return NewsletterImport::query()->crawl()->latest('id')->firstOrFail();
    }

    /** @return list<string> the page URLs requested, robots.txt and Hunter left out */
    private function fetched(): array
    {
        return collect(Http::recorded())
            ->map(fn (array $pair) => strtok($pair[0]->url(), '?'))
            ->reject(fn (string $url) => str_ends_with($url, '/robots.txt') || str_starts_with($url, 'https://api.hunter.io/'))
            ->values()->all();
    }

    /** @return list<string> */
    private function found(NewsletterImport $import): array
    {
        $rows = array_map('str_getcsv', array_slice(file(Storage::disk('local')->path((string) $import->file), FILE_IGNORE_NEW_LINES), 1));

        return array_column($rows, 0);
    }

    /* -------------------------------------------------------------------- tests */

    public function test_depth_zero_reads_the_start_page_and_nothing_else(): void
    {
        $import = $this->crawl(['depth' => 0]);

        $this->assertSame('ready', $import->status);
        $this->assertSame(['https://hooghlytraders.in/'], $this->fetched());
        $this->assertSame(['secretary@hooghlytraders.in'], $this->found($import));
    }

    public function test_the_depth_is_followed_to_the_level_asked_and_no_further(): void
    {
        $one = $this->crawl(['depth' => 1]);
        $this->assertNotContains('https://hooghlytraders.in/members/page-2', $this->fetched());
        $this->assertContains('office@chatterjeesons.in', $this->found($one));
        $this->assertNotContains('das@daspaints.in', $this->found($one));

        $two = $this->crawl(['depth' => 2]);
        $this->assertContains('das@daspaints.in', $this->found($two));
    }

    public function test_robots_txt_files_and_other_hosts_are_left_alone_without_directory_mode(): void
    {
        $import = $this->crawl(['depth' => 2]);
        $fetched = $this->fetched();

        $this->assertNotContains('https://hooghlytraders.in/private/list', $fetched, 'robots.txt disallows it');
        $this->assertNotContains('https://hooghlytraders.in/brochure.pdf', $fetched);
        $this->assertEmpty(array_filter($fetched, fn ($u) => ! str_starts_with($u, 'https://hooghlytraders.in/')));
        $this->assertNotContains('hidden@hooghlytraders.in', $this->found($import));
        $this->assertGreaterThanOrEqual(1, $import->progress['refused']);
    }

    public function test_the_page_limit_caps_the_run_and_says_so(): void
    {
        $import = $this->crawl(['depth' => 2, 'max_pages' => 1]);

        $this->assertSame(['https://hooghlytraders.in/'], $this->fetched());
        $this->assertTrue($import->analysis['capped']);
        $this->assertSame(1, $import->analysis['pages']);
    }

    public function test_directory_mode_opens_each_business_and_its_contact_page_never_a_platform(): void
    {
        $import = $this->crawl(['visit_linked_sites' => true, 'linked_sites_max' => 10]);
        $fetched = $this->fetched();

        $this->assertContains('https://www.anandhardware.in/contact-us', $fetched);
        $this->assertNotContains('https://www.anandhardware.in/products', $fetched, 'only contact-like pages');
        $this->assertContains('https://boseelectricals.in/', $fetched);
        $this->assertEmpty(array_filter($fetched, fn ($u) => str_contains($u, 'facebook.com')));

        $csv = array_map('str_getcsv', array_slice(file(Storage::disk('local')->path((string) $import->file), FILE_IGNORE_NEW_LINES), 1));
        $rahul = collect($csv)->firstWhere(0, 'rahul@anandhardware.in');
        $this->assertSame(['Rahul', 'Anand', 'Anand Hardware', 'https://www.anandhardware.in', 'https://www.anandhardware.in/contact-us'], array_slice($rahul, 1, 5));
        $this->assertSame('Bose Electricals', collect($csv)->firstWhere(0, 'bose.electricals@gmail.com')[3]);
        $this->assertSame(2, $import->analysis['sites']);
    }

    public function test_a_crawl_out_of_time_pauses_and_the_next_slice_resumes(): void
    {
        $import = NewsletterImport::create([
            'filename' => 'hooghlytraders.in', 'source' => NewsletterImport::SOURCE_CRAWL, 'status' => 'scanning',
            'progress' => ['start_url' => 'https://hooghlytraders.in/', 'depth' => 2, 'max_pages' => 50, 'industry' => 'Hardware retail'],
        ]);
        $crawler = new WebsiteCrawler;
        $past = CarbonImmutable::now()->subSecond();

        $state = CrawlState::load($import);
        $this->assertSame(WebsiteCrawler::PAUSED, $crawler->run($state, $import->progress, [], $past));
        $this->assertSame(1, $state->pages, 'one unit of work before the deadline is read');
        $state->save($import);

        $state = CrawlState::load($import->fresh());
        $this->assertNotEmpty($state->frontier);
        $this->assertSame(WebsiteCrawler::PAUSED, $crawler->run($state, $import->progress, [], $past));
        $this->assertSame(2, $state->pages);
        $this->assertSame(WebsiteCrawler::DONE, $crawler->run($state, $import->progress, [], CarbonImmutable::now()->addMinute()));
        $this->assertSame(3, $state->pages, 'home, members, page 2 — each once; the page robots.txt refuses is not one');
        $this->assertSame(1, $state->refused);
    }

    public function test_hunter_is_asked_about_as_many_domains_as_allowed_and_no_more(): void
    {
        Setting::put('hunter_api_key', 'hunter-key');

        $import = $this->crawl(['visit_linked_sites' => true, 'linked_sites_max' => 10, 'hunter_domains' => 2]);
        $searches = collect(Http::recorded())->filter(fn (array $p) => str_contains($p[0]->url(), '/domain-search'));

        $this->assertCount(2, $searches);
        $this->assertSame(2, $import->analysis['hunter_used']);
        $this->assertNotEmpty(array_filter($this->found($import), fn ($e) => str_starts_with($e, 'accounts@')));
    }

    public function test_hunter_is_not_asked_when_the_plan_has_no_searches_left(): void
    {
        Setting::put('hunter_api_key', 'hunter-key');
        $this->searchesLeft = 0;

        $import = $this->crawl(['hunter_domains' => 5]);

        $this->assertCount(0, collect(Http::recorded())->filter(fn (array $p) => str_contains($p[0]->url(), '/domain-search')));
        $this->assertSame(0, $import->analysis['hunter_used']);
        $this->assertStringContainsString('no domain searches left', implode(' ', $import->analysis['notes']));
    }

    public function test_hunter_needs_a_key(): void
    {
        $this->as()->postJson(self::API.'/crawl', [
            'start_url' => 'https://hooghlytraders.in/', 'depth' => 0, 'max_pages' => 5, 'industry' => 'Retail', 'hunter_domains' => 3,
        ])->assertStatus(422)->assertJsonValidationErrors(['hunter_domains']);
    }

    public function test_a_private_start_address_is_refused_and_a_redirect_into_the_network_is_never_followed(): void
    {
        foreach (['https://127.0.0.1/', 'https://127.1/', 'https://router.internal/', 'ftp://hooghlytraders.in/'] as $url) {
            $this->as()->postJson(self::API.'/crawl', ['start_url' => $url, 'depth' => 0, 'max_pages' => 5, 'industry' => 'Retail'])
                ->assertStatus(422)->assertJsonValidationErrors(['start_url']);
        }
        $this->assertSame(0, NewsletterImport::query()->crawl()->count());

        $this->site['https://hooghlytraders.in/'] = [302, '', ['Location' => 'https://metadata.internal/latest/']];
        $import = $this->crawl(['depth' => 0]);

        $this->assertSame('ready', $import->status);
        $this->assertEmpty(array_filter($this->fetched(), fn ($u) => str_contains($u, '.internal')));
        $this->assertSame([], $this->found($import));
    }

    public function test_a_crawl_is_refused_while_one_runs_when_nothing_drains_the_queue_and_for_a_content_manager(): void
    {
        NewsletterImport::create(['filename' => 'x', 'source' => NewsletterImport::SOURCE_CRAWL, 'status' => 'scanning', 'progress' => []]);
        $body = ['start_url' => 'https://hooghlytraders.in/', 'depth' => 0, 'max_pages' => 5, 'industry' => 'Retail'];

        $this->as()->postJson(self::API.'/crawl', $body)->assertStatus(422)->assertJsonValidationErrors(['start_url']);

        NewsletterImport::query()->update(['status' => 'cancelled']);
        config(['queue.default' => 'database']);
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        Cache::forget(QueueHealth::WORKER_KEY);
        $this->as()->postJson(self::API.'/crawl', $body)->assertStatus(422)->assertJsonValidationErrors(['queue']);

        // Sanctum remembers the last principal inside one test; forget it before switching.
        $this->app['auth']->forgetGuards();
        $this->as($this->manager(RoleEnum::ContentManager->value))->postJson(self::API.'/crawl', $body)->assertForbidden();
    }

    public function test_the_status_endpoint_reports_hunter_and_the_industries_on_file(): void
    {
        NewsletterSubscriber::create(['email' => 'a@b.in', 'status' => 'active', 'industry' => 'Clinics']);

        $this->as()->getJson(self::API.'/crawl')->assertOk()
            ->assertJsonPath('data.hunter_configured', false)
            ->assertJsonPath('data.industries', ['Clinics'])
            ->assertJsonPath('data.limits.depth', 4)
            ->assertJsonPath('data.active', null);
    }

    public function test_the_review_commits_into_the_industry_group_and_never_overwrites_or_resurrects(): void
    {
        NewsletterSuppression::add('office@chatterjeesons.in', SuppressionReason::Unsubscribed);
        NewsletterSubscriber::create(['email' => 'anand@anandhardware.in', 'status' => 'active', 'company' => 'Anand & Co', 'industry' => 'Tools']);
        $picked = NewsletterGroup::create(['name' => 'Howrah 2026', 'is_active' => true]);

        $import = $this->crawl();
        $this->assertSame('Hardware retail', $import->analysis['industry']);

        $response = $this->as()->postJson(self::API, [
            'import_id' => $import->id,
            // What the console sends back: the analysis's own mapping. It must change nothing.
            'mapping' => $import->analysis['mapping'],
            'group_ids' => [$picked->id],
        ])->assertCreated();

        $this->assertSame('completed', $response->json('data.status'));
        $this->assertSame(1, $response->json('data.suppressed'));

        $bose = NewsletterSubscriber::where('email', 'bose.electricals@gmail.com')->sole();
        $this->assertSame('crawl', $bose->source);
        $this->assertSame(['Bose Electricals', 'Hardware retail', 'Howrah', 'https://hooghlytraders.in/members'], [$bose->company, $bose->industry, $bose->location, $bose->source_url]);
        $this->assertNull($bose->website, 'a gmail address has no website of its own');
        $this->assertEqualsCanonicalizing(['Howrah 2026', 'Hardware retail'], $bose->groups->pluck('name')->all());

        $anand = NewsletterSubscriber::where('email', 'anand@anandhardware.in')->sole();
        $this->assertSame(['Anand & Co', 'Tools'], [$anand->company, $anand->industry], 'filled blanks only');
        $this->assertSame('https://anandhardware.in', $anand->website);

        $this->assertNull(NewsletterSubscriber::where('email', 'office@chatterjeesons.in')->first());
        $this->assertSame(1, NewsletterGroup::where('name', 'Hardware retail')->count());
        Storage::disk('local')->assertMissing((string) $import->file);
    }

    public function test_the_industry_group_can_be_declined(): void
    {
        $import = $this->crawl();

        $this->as()->postJson(self::API, ['import_id' => $import->id, 'industry_group' => false])->assertCreated();

        $this->assertSame(0, NewsletterGroup::where('name', 'Hardware retail')->count());
        $this->assertSame('Hardware retail', NewsletterSubscriber::where('email', 'bose.electricals@gmail.com')->sole()->industry);
    }

    public function test_a_discarded_crawl_deletes_its_file_and_an_unreviewed_one_expires(): void
    {
        $import = $this->crawl();
        $file = (string) $import->file;
        Storage::disk('local')->assertExists($file);

        $this->as()->deleteJson(self::API.'/'.$import->id)->assertOk()->assertJsonPath('data.status', 'cancelled');
        Storage::disk('local')->assertMissing($file);

        $late = $this->crawl();
        $late->update(['expires_at' => now()->subMinute()]);
        Artisan::call('technoware:prune-newsletter-scans');

        $this->assertSame('expired', $late->fresh()->status);
        Storage::disk('local')->assertMissing((string) $late->file);
    }

    public function test_a_crawl_row_is_never_run_by_the_mailbox_job_and_the_crawl_job_ignores_a_mailbox_row(): void
    {
        $mailbox = NewsletterImport::create(['filename' => 'm', 'source' => NewsletterImport::SOURCE_MAILBOX, 'status' => 'pending', 'progress' => []]);

        (new CrawlWebsiteForSubscribers($mailbox->id))->handle();

        $this->assertSame('pending', $mailbox->fresh()->status);
        $this->assertCount(0, Http::recorded());
    }
}
