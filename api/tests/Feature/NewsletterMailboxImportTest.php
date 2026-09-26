<?php

namespace Tests\Feature;

use App\Enums\InboundMailProvider;
use App\Enums\Role as RoleEnum;
use App\Enums\SuppressionReason;
use App\Jobs\ScanMailboxForSubscribers;
use App\Models\NewsletterGroup;
use App\Models\NewsletterImport;
use App\Models\NewsletterSubscriber;
use App\Models\NewsletterSuppression;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\InboundMail\MailboxScanner;
use App\Support\Net\PublicHost;
use App\Support\Newsletter\HarvestState;
use App\Support\Newsletter\MailboxHarvester;
use App\Support\Newsletter\ScanCredentials;
use App\Support\OAuth\OAuthConnection;
use App\Support\QueueHealth;
use Carbon\CarbonImmutable;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\Support\FakeMailboxScanner;
use Tests\TestCase;

/**
 * Subscribers from a mailbox.
 *
 * The scan is driven through `FakeMailboxScanner` bound in the container,
 * so every decision from "a folder was listed" to "a CSV is ready to
 * review" and on to "these addresses are on the list" runs for real against
 * the database, with only the IMAP socket faked — the standing every
 * mailbox test here has.
 */
class NewsletterMailboxImportTest extends TestCase
{
    use RefreshDatabase;

    private const STATUS = '/api/v1/admin/newsletter/imports/mailbox';

    private FakeMailboxScanner $scanner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        Storage::fake('local');

        $this->scanner = new FakeMailboxScanner;
        // bind(), not instance(): the job resolves with parameters, which skips a bound instance.
        $this->app->bind(MailboxScanner::class, fn () => $this->scanner);

        Setting::put('support_email', 'support@technoware.in');
        Setting::put('mail_from_address', 'noreply@technoware.in');
        Setting::put('inbound_oauth_client_id', 'client-id');
        Setting::put('inbound_oauth_client_secret', 'client-secret');
    }

    /* --------------------------------------------------------------- helpers */

    private function manager(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'campaigns@technoware.in'],
            ['name' => 'Campaign Manager', 'password' => 'password-for-tests', 'is_active' => true],
        );
        $role = Role::firstOrCreate(['slug' => RoleEnum::CampaignManager->value], ['name' => RoleEnum::CampaignManager->label()]);
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user->load('roles');
    }

    /** A real bearer token, so the middleware is tested and not staged. */
    private function as(User $user): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$user->createToken('admin')->plainTextToken);
    }

    private function draining(): void
    {
        Cache::put(QueueHealth::HEARTBEAT_KEY, time());
    }

    /** A pending mailbox import with one-off credentials, the way scan() makes one. */
    private function pendingScan(array $progress = []): array
    {
        $import = NewsletterImport::create([
            'uploaded_by' => $this->manager()->id,
            'filename' => 'desk@example.test (mailbox, all dates)',
            'source' => NewsletterImport::SOURCE_MAILBOX,
            'status' => 'pending',
            'progress' => $progress + ['since' => null, 'until' => null, 'include_junk' => false, 'source' => 'imap'],
        ]);
        $key = ScanCredentials::put($import->id, [
            'source' => 'imap', 'host' => 'imap.example.test', 'port' => 993, 'encryption' => 'ssl',
            'username' => 'desk@example.test', 'password' => 'hunter2',
        ]);

        return [$import, $key];
    }

    /** A realistic small mailbox: Inbox, Sent, a project folder, and the folders that must be skipped. */
    private function fillMailbox(): void
    {
        // A colleague copied on customer mail: staff, so never harvested.
        User::firstOrCreate(['email' => 'engineer@technoware.in'], ['name' => 'Engineer', 'password' => 'password-for-tests', 'is_active' => true]);

        $this->scanner->folders = [
            FakeMailboxScanner::folder('INBOX', 3),
            FakeMailboxScanner::folder('[Gmail]', 0, ['\\Noselect', '\\HasChildren'], noSelect: true),
            FakeMailboxScanner::folder('[Gmail]/Sent Mail', 2, ['\\Sent']),
            FakeMailboxScanner::folder('[Gmail]/All Mail', 99, ['\\All']),
            FakeMailboxScanner::folder('[Gmail]/Spam', 1, ['\\Junk']),
            FakeMailboxScanner::folder('Deleted Items', 1),
            FakeMailboxScanner::folder('Clients/Meridian', 1),
        ];
        $this->scanner->rows = [
            'INBOX' => [
                // Somebody wrote to us and copied a colleague of theirs: From is never taken, the Cc is.
                FakeMailboxScanner::row(1, to: ['desk@example.test'], cc: ['Priya Nair <priya@meridian.example>'], from: 'vendor@supplier.example', date: '2026-03-01 09:00:00'),
                FakeMailboxScanner::row(2, to: ['Desk <desk@example.test>', 'noreply@bounces.crm.example'], cc: [], from: 'ops@supplier.example', date: '2026-04-01 09:00:00'),
                FakeMailboxScanner::row(3, to: ['engineer@technoware.in'], cc: ['Priya <priya@meridian.example>'], from: 'priya@meridian.example', messageId: '<shared@example.test>', date: '2026-05-01 09:00:00'),
            ],
            '[Gmail]/Sent Mail' => [
                FakeMailboxScanner::row(10, to: ['Priya Nair <priya@meridian.example>', 'Arjun Rao <arjun@meridian.example>'], from: 'desk@example.test', date: '2026-05-02 09:00:00'),
                FakeMailboxScanner::row(11, to: ['postmaster@meridian.example', 'not an address'], from: 'desk@example.test', date: '2026-05-03 09:00:00'),
            ],
            '[Gmail]/All Mail' => [
                FakeMailboxScanner::row(50, to: ['everyone@doubled.example'], from: 'x@y.example'),
            ],
            '[Gmail]/Spam' => [
                FakeMailboxScanner::row(60, to: ['victim@spammed.example'], from: 'x@y.example'),
            ],
            'Deleted Items' => [
                FakeMailboxScanner::row(70, to: ['gone@trashed.example'], from: 'x@y.example'),
            ],
            'Clients/Meridian' => [
                // The same message as INBOX uid 3, filed under a label: counted once.
                FakeMailboxScanner::row(80, to: ['engineer@technoware.in'], cc: ['Priya <priya@meridian.example>'], from: 'priya@meridian.example', messageId: '<shared@example.test>', date: '2026-05-01 09:00:00'),
                FakeMailboxScanner::row(81, to: ['Sunita Rao <sunita@meridian.example>'], from: 'desk@example.test', date: '2026-01-15 09:00:00'),
            ],
        ];
    }

    /* ---------------------------------------------------------------- status */

    public function test_the_screen_gets_the_providers_and_never_a_token(): void
    {
        Setting::put('newsletter_oauth_refresh_token', 'secret-token');
        Setting::put('newsletter_oauth_provider', 'google');

        $response = $this->as($this->manager())->getJson(self::STATUS)->assertOk();

        $this->assertSame(['google', 'microsoft'], collect($response->json('data.providers'))->pluck('value')->all());
        $this->assertTrue($response->json('data.is_connected'));
        $this->assertTrue($response->json('data.client_configured'));
        $this->assertSame('/admin/newsletter/subscribers/import/mailbox/callback', $response->json('data.callback_path'));
        $this->assertIsBool($response->json('data.delivering'));
        $this->assertNull($response->json('data.active'));
        $this->assertStringNotContainsString('secret-token', $response->getContent());
    }

    public function test_a_content_manager_cannot_reach_it(): void
    {
        $user = User::create(['name' => 'Editor', 'email' => 'editor@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]));

        $this->as($user)->getJson(self::STATUS)->assertForbidden();
        $this->as($user)->postJson(self::STATUS.'/scan', ['source' => 'imap'])->assertForbidden();
    }

    /* --------------------------------------------------------------- consent */

    public function test_the_consent_uses_the_ticketing_client_on_its_own_callback(): void
    {
        $url = $this->as($this->manager())->postJson(self::STATUS.'/authorize', [
            'provider' => 'google', 'redirect_uri' => 'http://localhost:3000/admin/newsletter/subscribers/import/mailbox/callback',
        ])->assertOk()->json('data.url');

        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
        $this->assertSame('client-id', $q['client_id']);
        $this->assertSame('https://mail.google.com/ openid email', $q['scope']);
        $this->assertNotNull(Cache::get("newsletter-oauth-state:{$q['state']}"));

        foreach ([
            'http://localhost:3000/admin/settings/tickets/callback',
            'http://localhost:3000/admin/settings/mail/callback',
            'https://www.technoware.in.attacker.test/admin/newsletter/subscribers/import/mailbox/callback',
        ] as $uri) {
            $this->as($this->manager())->postJson(self::STATUS.'/authorize', ['provider' => 'google', 'redirect_uri' => $uri])->assertStatus(422);
        }
    }

    public function test_without_a_client_the_consent_says_where_to_save_one(): void
    {
        Setting::put('inbound_oauth_client_id', null);

        $this->as($this->manager())->postJson(self::STATUS.'/authorize', [
            'provider' => 'microsoft', 'redirect_uri' => 'http://localhost:3000/admin/newsletter/subscribers/import/mailbox/callback',
        ])->assertStatus(422)->assertJsonFragment(['message' => 'No OAuth client is saved. An administrator saves the client ID and secret under Settings → Ticketing; this screen only adds its own callback address to it.']);
    }

    public function test_a_state_minted_here_cannot_be_spent_at_the_other_callbacks_and_theirs_not_here(): void
    {
        Http::fake();
        $admin = User::firstOrCreate(['email' => 'admin@example.test'], ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true]);
        $admin->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()])->id]);

        $ours = OAuthConnection::newsletter(InboundMailProvider::Google)
            ->authorizeUrl('http://localhost:3000/admin/newsletter/subscribers/import/mailbox/callback', ['provider' => 'google'])['state'];
        $theirs = OAuthConnection::inbound(InboundMailProvider::Google)
            ->authorizeUrl('http://localhost:3000/admin/settings/tickets/callback')['state'];

        $this->as($admin)->postJson('/api/v1/admin/settings/tickets/inbound/callback', ['code' => 'x', 'state' => $ours])->assertStatus(422);
        $this->as($admin)->postJson('/api/v1/admin/settings/mail/callback', ['code' => 'x', 'state' => $ours])->assertStatus(422);
        $this->as($this->manager())->postJson(self::STATUS.'/callback', ['code' => 'x', 'state' => $theirs])->assertStatus(422);

        $this->assertNotNull(Cache::get("newsletter-oauth-state:{$ours}"));
        $this->assertNotNull(Cache::get("inbound-oauth-state:{$theirs}"));
    }

    public function test_the_exchange_writes_the_newsletter_rows_and_only_those(): void
    {
        Setting::put('inbound_oauth_refresh_token', 'tickets-token-stays');
        $state = OAuthConnection::newsletter(InboundMailProvider::Microsoft)
            ->authorizeUrl('http://localhost:3000/admin/newsletter/subscribers/import/mailbox/callback', ['provider' => 'microsoft'])['state'];

        $claims = rtrim(strtr(base64_encode(json_encode(['email' => 'marketing@contoso.example'])), '+/', '-_'), '=');
        Http::fake(['login.microsoftonline.com/*' => Http::response([
            'access_token' => 'access', 'refresh_token' => 'refresh', 'expires_in' => 3600, 'id_token' => "h.{$claims}.s",
        ])]);

        $this->as($this->manager())->postJson(self::STATUS.'/callback', ['code' => 'the-code', 'state' => $state])
            ->assertOk()->assertJsonPath('data.account', 'marketing@contoso.example')->assertJsonPath('data.provider', 'microsoft');

        Http::assertSent(fn ($request) => $request['client_id'] === 'client-id' && $request['client_secret'] === 'client-secret');
        $this->assertSame('refresh', Setting::get('newsletter_oauth_refresh_token'));
        $this->assertSame('microsoft', Setting::get('newsletter_oauth_provider'));
        $this->assertSame('tickets-token-stays', Setting::get('inbound_oauth_refresh_token'));
        $this->assertNull(Setting::get('inbound_oauth_account'));

        $this->as($this->manager())->postJson(self::STATUS.'/disconnect')->assertOk()->assertJsonPath('data.is_connected', false);
        $this->assertNull(Setting::get('newsletter_oauth_refresh_token'));
        $this->assertSame('tickets-token-stays', Setting::get('inbound_oauth_refresh_token'));
    }

    /* --------------------------------------------------------- starting a scan */

    public function test_a_scan_is_queued_and_the_password_is_stored_nowhere_readable(): void
    {
        Queue::fake();
        $this->draining();
        $before = Setting::query()->count();

        $response = $this->as($this->manager())->postJson(self::STATUS.'/scan', [
            'source' => 'imap', 'since' => '2026-01-01', 'until' => '2026-06-30', 'include_junk' => false,
            'imap' => ['host' => 'imap.example.test', 'port' => 993, 'encryption' => 'ssl', 'username' => 'desk@example.test', 'password' => 'hunter2'],
        ])->assertStatus(202);

        $this->assertSame('pending', $response->json('data.status'));
        $import = NewsletterImport::sole();
        $this->assertSame('mailbox', $import->source);
        $this->assertSame('desk@example.test (mailbox, 2026-01-01 to 2026-06-30)', $import->filename);
        $this->assertSame('2026-01-01', $import->progress['since']);

        Queue::assertPushed(ScanMailboxForSubscribers::class, function (ScanMailboxForSubscribers $job) use ($import) {
            $this->assertStringNotContainsString('hunter2', serialize($job));
            $sealed = Cache::get($job->credentialsKey);
            $this->assertIsString($sealed);
            $this->assertStringNotContainsString('hunter2', $sealed);
            $this->assertSame('hunter2', json_decode(Crypt::decryptString($sealed), true)['password']);

            return $job->importId === $import->id;
        });

        $this->assertSame($before, Setting::query()->count());
        $this->assertNull(Setting::get('inbound_imap_password'));
    }

    public function test_a_scan_is_refused_when_nothing_drains_the_queue(): void
    {
        config(['queue.default' => 'database']);
        Cache::forget(QueueHealth::HEARTBEAT_KEY);
        Cache::forget(QueueHealth::WORKER_KEY);

        $this->as($this->manager())->postJson(self::STATUS.'/scan', [
            'source' => 'imap',
            'imap' => ['host' => 'imap.example.test', 'port' => 993, 'encryption' => 'ssl', 'username' => 'desk@example.test', 'password' => 'x'],
        ])->assertStatus(422)->assertJsonValidationErrors(['queue']);

        $this->assertSame(0, NewsletterImport::count());
    }

    public function test_a_scan_is_refused_while_one_is_running_and_without_a_connection_and_on_a_backwards_range(): void
    {
        Queue::fake();
        $this->draining();
        $manager = $this->manager();

        $this->as($manager)->postJson(self::STATUS.'/scan', ['source' => 'connected'])
            ->assertStatus(422)->assertJsonValidationErrors(['source']);

        $this->as($manager)->postJson(self::STATUS.'/scan', [
            'source' => 'imap', 'since' => '2026-06-01', 'until' => '2026-01-01',
            'imap' => ['host' => 'h', 'port' => 993, 'encryption' => 'ssl', 'username' => 'u', 'password' => 'p'],
        ])->assertStatus(422)->assertJsonValidationErrors(['until']);

        [$import] = $this->pendingScan();
        $this->as($manager)->postJson(self::STATUS.'/scan', [
            'source' => 'imap', 'imap' => ['host' => 'h', 'port' => 993, 'encryption' => 'ssl', 'username' => 'u', 'password' => 'p'],
        ])->assertStatus(422)->assertJsonValidationErrors(['source']);

        $this->assertSame($import->id, $this->as($manager)->getJson(self::STATUS)->json('data.active.id'));
    }

    /**
     * A scan is not a port scanner.
     *
     * The server connects to whatever host and port the form names, from
     * inside the network; with any of each, and the socket's own error on the
     * screen, a campaign manager could map what answers on the LAN. IMAP's
     * two ports, a public host, and nothing queued otherwise.
     */
    public function test_a_scan_refuses_a_private_host_and_a_port_imap_is_not_served_on(): void
    {
        Queue::fake();
        $this->draining();
        $manager = $this->manager();

        // Three, not five: the scan endpoint allows six requests a minute.
        foreach (['127.0.0.1', '169.254.169.254', '0x7f.0.0.1'] as $host) {
            $this->as($manager)->postJson(self::STATUS.'/scan', [
                'source' => 'imap',
                'imap' => ['host' => $host, 'port' => 993, 'encryption' => 'ssl', 'username' => 'u', 'password' => 'p'],
            ])->assertStatus(422)->assertJsonValidationErrors(['imap.host']);
        }

        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['192.168.1.20']);
        $this->as($manager)->postJson(self::STATUS.'/scan', [
            'source' => 'imap',
            'imap' => ['host' => 'mail.example.test', 'port' => 993, 'encryption' => 'ssl', 'username' => 'u', 'password' => 'p'],
        ])->assertStatus(422)->assertJsonValidationErrors(['imap.host']);

        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => []);
        $this->as($manager)->postJson(self::STATUS.'/scan', [
            'source' => 'imap',
            'imap' => ['host' => 'mail.example.test', 'port' => 6379, 'encryption' => 'none', 'username' => 'u', 'password' => 'p'],
        ])->assertStatus(422)->assertJsonValidationErrors(['imap.port']);

        $this->assertSame(0, NewsletterImport::count());
        Queue::assertNothingPushed();
    }

    /* --------------------------------------------------------------- the scan */

    public function test_the_scan_collects_to_and_cc_from_every_folder_the_policy_allows(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan();

        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $import->refresh();
        $this->assertSame('ready', $import->status, (string) $import->error);
        $this->assertNotNull($import->file);
        Storage::disk('local')->assertExists($import->file);

        $rows = array_map('str_getcsv', array_slice(array_filter(explode("\n", trim(ltrim((string) Storage::disk('local')->get($import->file), "\xEF\xBB\xBF")))), 1));
        $byEmail = collect($rows)->keyBy(fn ($r) => $r[0]);

        // Collected: the Cc in the Inbox, the To in Sent and in the project folder.
        $this->assertEqualsCanonicalizing(
            ['priya@meridian.example', 'arjun@meridian.example', 'postmaster@meridian.example', 'noreply@bounces.crm.example', 'sunita@meridian.example'],
            $byEmail->keys()->all(),
        );
        // Never: From, the account, staff, the doubled All Mail, junk, trash, an invalid address.
        foreach (['vendor@supplier.example', 'ops@supplier.example', 'desk@example.test', 'engineer@technoware.in', 'everyone@doubled.example', 'victim@spammed.example', 'gone@trashed.example'] as $never) {
            $this->assertArrayNotHasKey($never, $byEmail->all());
        }

        // Priya: seen three times across Inbox, Sent and the label — the labelled copy of the same
        // message counted once — with the fullest name winning, once written to directly.
        $priya = $byEmail['priya@meridian.example'];
        $this->assertSame(['Priya', 'Nair', 'Priya Nair'], [$priya[1], $priya[2], $priya[3]]);
        $this->assertSame('3', $priya[5], 'occurrences');
        $this->assertSame('1', $priya[6], 'sent_to');
        $this->assertSame(['2026-03-01', '2026-05-02'], [$priya[7], $priya[8]]);

        $this->assertSame(['Sunita', 'Rao'], [$byEmail['sunita@meridian.example'][1], $byEmail['sunita@meridian.example'][2]]);

        // The review block: per-domain counts, the machine domain unticked, the role address counted.
        $analysis = $import->analysis;
        $domains = collect($analysis['domains'])->keyBy('domain');
        $this->assertSame(4, $domains['meridian.example']['addresses']);
        $this->assertTrue($domains['meridian.example']['default']);
        $this->assertSame('machine', $domains['bounces.crm.example']['kind']);
        $this->assertFalse($domains['bounces.crm.example']['default']);
        $this->assertSame(2, $analysis['roles']['addresses']);
        $this->assertSame(5, $analysis['counts']['valid']);
        $this->assertEquals(ScanMailboxForSubscribers::MAPPING, $analysis['mapping']);
        $this->assertFalse($analysis['capped']);

        // The progress column says what was skipped and why.
        $skipped = collect($import->progress['skipped'])->pluck('skip', 'name');
        $this->assertSame('virtual', $skipped['All Mail']);
        $this->assertSame('junk', $skipped['Spam']);
        $this->assertSame('trash', $skipped['Deleted Items']);
        $this->assertSame('noselect', $skipped['[Gmail]']);
        $this->assertSame(6, $import->progress['messages_total'], 'the folders read: 3 inbox + 2 sent + 1 project');
        $this->assertSame(6, $import->progress['messages'], 'the labelled copy of one message counted once');

        // Everything a finished scan held is gone.
        $this->assertNull(Cache::get($key));
        Storage::disk('local')->assertMissing(HarvestState::path($import));
        Queue::assertNothingPushed();
    }

    public function test_the_date_range_reaches_the_server_and_is_checked_again_on_the_way_in(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan(['since' => '2026-04-01', 'until' => '2026-05-02']);

        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $this->assertSame('ready', $import->fresh()->status);
        $this->assertSame(['since' => '2026-04-01', 'until' => '2026-05-02'], collect($this->scanner->asked[0])->only(['since', 'until'])->all());

        $emails = collect(array_slice(explode("\n", trim((string) Storage::disk('local')->get($import->fresh()->file))), 1))->map(fn ($l) => str_getcsv($l)[0]);
        // Sunita (January) and postmaster (3 May) fall outside the window even though the fake returned them.
        $this->assertNotContains('sunita@meridian.example', $emails->all());
        $this->assertNotContains('postmaster@meridian.example', $emails->all());
        $this->assertContains('arjun@meridian.example', $emails->all());
    }

    public function test_junk_trash_and_drafts_come_back_when_asked_for(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan(['include_junk' => true]);

        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $emails = collect(array_slice(explode("\n", trim((string) Storage::disk('local')->get($import->fresh()->file))), 1))->map(fn ($l) => str_getcsv($l)[0]);
        $this->assertContains('victim@spammed.example', $emails->all());
        $this->assertContains('gone@trashed.example', $emails->all());
        $this->assertNotContains('everyone@doubled.example', $emails->all(), 'All Mail is virtual whatever the switch says');
    }

    public function test_a_scan_out_of_time_pauses_and_the_next_slice_resumes_from_its_cursor(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan();

        // Zero budget: the first row is taken and the slice stops.
        $state = HarvestState::load($import);
        $outcome = (new MailboxHarvester)->run($this->scanner, $state, [], false, null, null, CarbonImmutable::now()->subSecond());
        $state->save($import);

        $this->assertSame(MailboxHarvester::PAUSED, $outcome);
        $this->assertSame(['index' => 0, 'after_uid' => 1], $state->cursor);
        $this->assertSame(1, $import->fresh()->progress['messages']);
        $this->assertSame('INBOX', $import->fresh()->progress['folder']);

        // The job picks the state up and asks the mailbox for what comes after.
        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $this->assertSame('ready', $import->fresh()->status);
        $this->assertSame(['path' => 'INBOX', 'after_uid' => 1], collect($this->scanner->asked[1])->only(['path', 'after_uid'])->all());
        $this->assertSame(6, $import->fresh()->progress['messages'], 'the paused row was not counted twice');
    }

    public function test_a_cancelled_scan_stops_the_chain_and_a_refusal_is_recorded(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan();
        $import->update(['status' => 'cancelled']);

        (new ScanMailboxForSubscribers($import->id, $key))->handle();
        $this->assertSame([], $this->scanner->asked);
        $this->assertNull(Cache::get($key));

        [$import, $key] = $this->pendingScan();
        $this->scanner->refuse = 'NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)';

        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $import->refresh();
        $this->assertSame('failed', $import->status);
        // One sentence for a typed IMAP source, never the socket's words: those
        // tell a campaign manager which hosts and ports answer inside the network.
        $this->assertStringStartsWith('The mailbox could not be read.', (string) $import->error);
        $this->assertStringNotContainsString('AUTHENTICATIONFAILED', (string) $import->error);
        $this->assertNull($import->file);
        $this->assertNull(Cache::get($key));
    }

    public function test_a_consent_is_spent_by_the_scan_and_forgotten_when_it_ends(): void
    {
        Queue::fake();
        $this->fillMailbox();
        Setting::put('newsletter_oauth_provider', 'google');
        Setting::put('newsletter_oauth_refresh_token', 'refresh');
        Setting::put('newsletter_oauth_account', 'desk@example.test');
        Cache::put('newsletter-oauth-access-token', ['token' => 'access', 'expires' => time() + 3600], 3600);
        Http::fake();

        $import = NewsletterImport::create([
            'filename' => 'desk@example.test (mailbox, all dates)', 'source' => 'mailbox', 'status' => 'pending',
            'progress' => ['since' => null, 'until' => null, 'include_junk' => false, 'source' => 'connected'],
        ]);
        $key = ScanCredentials::put($import->id, ['source' => 'google']);

        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $this->assertSame('ready', $import->fresh()->status, (string) $import->fresh()->error);
        $this->assertNull(Setting::get('newsletter_oauth_refresh_token'));
        $this->assertNull(Setting::get('newsletter_oauth_provider'));
        $this->assertFalse($this->as($this->manager())->getJson(self::STATUS)->json('data.is_connected'));
    }

    /* ---------------------------------------------------------------- commit */

    public function test_the_review_is_committed_with_the_domain_and_role_decisions(): void
    {
        Queue::fake();
        $this->fillMailbox();
        NewsletterSuppression::add('arjun@meridian.example', SuppressionReason::Unsubscribed);
        $group = NewsletterGroup::create(['name' => 'Customers 2026', 'slug' => 'customers-2026', 'is_active' => true]);
        [$import, $key] = $this->pendingScan();
        (new ScanMailboxForSubscribers($import->id, $key))->handle();

        $manager = $this->manager();

        $response = $this->as($manager)->postJson('/api/v1/admin/newsletter/imports', [
            'import_id' => $import->id,
            'file' => '../../.env',                      // ignored: the server knows where the file is
            'group_ids' => [$group->id],
            'domains' => ['Meridian.example'],
            'include_roles' => false,
        ])->assertCreated();

        $this->assertSame(2, $response->json('data.imported'), 'priya and sunita');
        $this->assertSame(1, $response->json('data.suppressed'), 'arjun asked not to be contacted');
        $this->assertSame(2, $response->json('data.excluded'), 'the bounces domain and the postmaster role');
        $this->assertSame('completed', $response->json('data.status'));

        $priya = NewsletterSubscriber::where('email', 'priya@meridian.example')->sole();
        $this->assertSame('mailbox', $priya->source);
        $this->assertSame(['Priya', 'Nair'], [$priya->first_name, $priya->last_name]);
        $this->assertTrue($priya->groups->contains($group));
        $this->assertNull(NewsletterSubscriber::where('email', 'noreply@bounces.crm.example')->first());
        $this->assertNull(NewsletterSubscriber::where('email', 'postmaster@meridian.example')->first());

        $import->refresh();
        $this->assertNull($import->file);
        $this->assertNull($import->expires_at);
        $this->assertSame([], Storage::disk('local')->files('newsletter-imports'), 'the CSV and the scratch state are gone');

        // Twice is refused: the row is no longer ready.
        $this->as($manager)->postJson('/api/v1/admin/newsletter/imports', ['import_id' => $import->id])->assertStatus(422);
    }

    public function test_a_second_mailbox_reports_the_first_one_s_addresses_as_already_on_the_list(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan();
        (new ScanMailboxForSubscribers($import->id, $key))->handle();
        $this->as($this->manager())->postJson('/api/v1/admin/newsletter/imports', ['import_id' => $import->id])->assertCreated();

        // The same people turn up in another mailbox.
        [$second, $key2] = $this->pendingScan();
        (new ScanMailboxForSubscribers($second->id, $key2))->handle();

        $analysis = $second->fresh()->analysis;
        $this->assertSame(5, $analysis['counts']['already_subscribed']);
        $this->assertSame(0, $analysis['counts']['valid']);
    }

    public function test_a_scan_can_be_discarded_and_a_stale_result_expires(): void
    {
        Queue::fake();
        $this->fillMailbox();
        [$import, $key] = $this->pendingScan();
        (new ScanMailboxForSubscribers($import->id, $key))->handle();
        $file = $import->fresh()->file;
        $this->assertNotNull($file, (string) $import->fresh()->error);

        $this->as($this->manager())->deleteJson("/api/v1/admin/newsletter/imports/{$import->id}")->assertOk()->assertJsonPath('data.status', 'cancelled');
        Storage::disk('local')->assertMissing($file);

        // A completed file import cannot be "discarded".
        $done = NewsletterImport::create(['filename' => 'list.csv', 'status' => 'completed']);
        $this->as($this->manager())->deleteJson("/api/v1/admin/newsletter/imports/{$done->id}")->assertStatus(422);

        // The prune: a ready result past its day, and a scan whose chain died.
        [$stale, $key] = $this->pendingScan();
        (new ScanMailboxForSubscribers($stale->id, $key))->handle();
        $staleFile = (string) $stale->fresh()->file;
        NewsletterImport::whereKey($stale->id)->update(['expires_at' => now()->subHour()]);
        [$stuck] = $this->pendingScan();
        NewsletterImport::whereKey($stuck->id)->update(['status' => 'scanning', 'updated_at' => now()->subHours(3)]);

        $this->artisan('technoware:prune-newsletter-scans')->assertExitCode(0);

        $this->assertSame('expired', $stale->fresh()->status);
        Storage::disk('local')->assertMissing($staleFile);
        $this->assertSame('failed', $stuck->fresh()->status);
    }

    public function test_the_csv_wizard_still_works_and_now_reports_domains(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'nl').'.csv';
        file_put_contents($path, "email,first name\npriya@meridian.example,Priya\nnoreply@bounces.crm.example,Robot\n");

        $manager = $this->manager();
        $analysis = $this->as($manager)->post('/api/v1/admin/newsletter/imports/analyse', [
            'file' => new UploadedFile($path, 'list.csv', 'text/csv', null, true),
        ], ['Accept' => 'application/json'])->assertOk()->json('data');

        $this->assertSame(2, $analysis['counts']['valid']);
        $this->assertEqualsCanonicalizing(['meridian.example', 'bounces.crm.example'], array_column($analysis['domains'], 'domain'));

        $this->as($manager)->postJson('/api/v1/admin/newsletter/imports', [
            'file' => $analysis['file'], 'original_name' => 'list.csv', 'mapping' => $analysis['mapping'],
        ])->assertCreated()->assertJsonPath('data.imported', 2)->assertJsonPath('data.excluded', 0);
    }
}
