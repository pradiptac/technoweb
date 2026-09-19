<?php

namespace Tests\Feature;

use App\Enums\InboundMailProvider;
use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\InboundMail\Mailbox;
use App\Support\OAuth\OAuthConnection;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakeMailbox;
use Tests\TestCase;

/**
 * Connecting the support mailbox from the console, and proving it reads.
 *
 * The consent handshake itself cannot run here — the same standing the
 * outgoing mailbox's has — so what is pinned is everything around it: the
 * exact-path rule on the redirect, the state that one slot mints and the
 * other cannot spend, the exchange writing the inbound rows and only those,
 * and the test button reporting the server's own words.
 */
class InboundMailSettingsTest extends TestCase
{
    use RefreshDatabase;

    private const STATUS = '/api/v1/admin/settings/tickets/inbound';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'admin@example.test'],
            ['name' => 'Administrator', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $role = Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]);
        $user->roles()->syncWithoutDetaching([$role->id]);

        return $user->load('roles');
    }

    /* ---------------------------------------------------------------- status */

    public function test_the_panel_gets_every_provider_and_no_secret(): void
    {
        Setting::put('inbound_imap_password', 'hunter2');

        $response = $this->actingAs($this->admin(), 'sanctum')->getJson(self::STATUS)->assertOk();

        $this->assertSame(['imap', 'google', 'microsoft'], collect($response->json('data.providers'))->pluck('value')->all());
        $this->assertFalse($response->json('data.enabled'));
        $this->assertSame('INBOX', $response->json('data.folder'));
        $this->assertTrue($response->json('data.moves_processed'));
        $this->assertSame('/admin/settings/tickets/callback', $response->json('data.callback_path'));
        // The IMAP library's requirements, so the panel can say before a
        // password is saved whether this PHP can read a mailbox at all.
        $this->assertIsBool($response->json('data.php.zip'));
        $this->assertTrue($response->json('data.php.openssl'));
        $this->assertStringNotContainsString('hunter2', $response->getContent());
    }

    public function test_a_content_manager_cannot_touch_the_mailbox(): void
    {
        $user = User::create(['name' => 'Editor', 'email' => 'editor@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()]));

        $this->actingAs($user->load('roles'), 'sanctum')->getJson(self::STATUS)->assertForbidden();
    }

    public function test_the_tickets_group_is_not_public(): void
    {
        Setting::put('inbound_imap_host', 'imap.example.test');

        $this->getJson('/api/v1/settings')->assertOk()
            ->assertJsonMissingPath('data.inbound_imap_host')
            ->assertJsonMissingPath('data.inbound_mail_enabled');
    }

    public function test_the_settings_screen_offers_the_choices_and_refuses_others(): void
    {
        $admin = $this->admin();

        $rows = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings')->assertOk()->json('data.tickets'));
        $this->assertSame(['move', 'seen'], collect($rows->firstWhere('key', 'inbound_mail_after')['options'])->pluck('value')->all());
        $this->assertSame(['imap', 'google', 'microsoft'], collect($rows->firstWhere('key', 'inbound_mail_provider')['options'])->pluck('value')->all());
        $this->assertContains('high', collect($rows->firstWhere('key', 'inbound_mail_priority')['options'])->pluck('value')->all());

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'inbound_mail_unknown_sender', 'value' => 'shrug']]])
            ->assertStatus(422);

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'inbound_mail_unknown_sender', 'value' => 'ignore']]])
            ->assertOk();
        $this->assertSame('ignore', Setting::get('inbound_mail_unknown_sender'));
    }

    /* ---------------------------------------------------------------- consent */

    public function test_the_consent_url_asks_for_the_inbound_scope(): void
    {
        Setting::put('inbound_oauth_client_id', 'client-id');
        $admin = $this->admin();

        $google = $this->actingAs($admin, 'sanctum')->postJson(self::STATUS.'/authorize', [
            'provider' => 'google', 'redirect_uri' => 'http://localhost:3000/admin/settings/tickets/callback',
        ])->assertOk()->json('data.url');

        $this->assertStringStartsWith('https://accounts.google.com/o/oauth2/v2/auth?', $google);
        parse_str((string) parse_url($google, PHP_URL_QUERY), $q);
        $this->assertSame('https://mail.google.com/ openid email', $q['scope']);
        $this->assertSame('offline', $q['access_type']);
        $this->assertSame('consent', $q['prompt']);

        Setting::put('inbound_oauth_tenant', 'contoso.onmicrosoft.com');
        $microsoft = $this->actingAs($admin, 'sanctum')->postJson(self::STATUS.'/authorize', [
            'provider' => 'microsoft', 'redirect_uri' => 'http://localhost:3000/admin/settings/tickets/callback',
        ])->assertOk()->json('data.url');

        $this->assertStringStartsWith('https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/authorize?', $microsoft);
        parse_str((string) parse_url($microsoft, PHP_URL_QUERY), $q);
        $this->assertSame('https://outlook.office365.com/IMAP.AccessAsUser.All offline_access openid email', $q['scope']);
        $this->assertSame('query', $q['response_mode']);
    }

    public function test_the_redirect_must_be_this_sites_own_callback(): void
    {
        Setting::put('inbound_oauth_client_id', 'client-id');
        $admin = $this->admin();

        foreach ([
            'https://www.technoware.in.attacker.test/admin/settings/tickets/callback',
            'https://www.technoware.in/anything-else',
            // The *mail* callback is this site's, and still the wrong door.
            'http://localhost:3000/admin/settings/mail/callback',
        ] as $uri) {
            $this->actingAs($admin, 'sanctum')
                ->postJson(self::STATUS.'/authorize', ['provider' => 'google', 'redirect_uri' => $uri])
                ->assertStatus(422);
        }
    }

    public function test_connecting_needs_a_client_id_first(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/authorize', ['provider' => 'google', 'redirect_uri' => 'http://localhost:3000/admin/settings/tickets/callback'])
            ->assertStatus(422);
    }

    public function test_a_state_minted_for_one_mailbox_cannot_be_spent_by_the_other(): void
    {
        Setting::put('inbound_oauth_client_id', 'client-id');
        Setting::put('oauth_client_id', 'client-id');
        Http::fake();

        $inbound = OAuthConnection::inbound(InboundMailProvider::Google)
            ->authorizeUrl('http://localhost:3000/admin/settings/tickets/callback');

        // The outgoing callback refuses it...
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/callback', ['code' => 'x', 'state' => $inbound['state']])
            ->assertStatus(422);

        // ...and it is still there for the inbound one afterwards.
        $this->assertNotNull(Cache::get("inbound-oauth-state:{$inbound['state']}"));
    }

    public function test_the_exchange_writes_the_inbound_rows_and_only_those(): void
    {
        Setting::put('inbound_oauth_client_id', 'client-id');
        Setting::put('inbound_oauth_client_secret', 'client-secret');
        Setting::put('oauth_refresh_token', 'outgoing-token-stays');

        $state = OAuthConnection::inbound(InboundMailProvider::Microsoft)
            ->authorizeUrl('http://localhost:3000/admin/settings/tickets/callback', ['provider' => 'microsoft'])['state'];

        $claims = rtrim(strtr(base64_encode(json_encode(['email' => 'Desk@Contoso.example'])), '+/', '-_'), '=');
        Http::fake([
            'login.microsoftonline.com/*' => Http::response([
                'access_token' => 'access', 'refresh_token' => 'refresh', 'expires_in' => 3600,
                'id_token' => "header.{$claims}.signature",
            ]),
        ]);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/callback', ['code' => 'the-code', 'state' => $state])
            ->assertOk()
            ->assertJsonPath('data.account', 'Desk@Contoso.example')
            ->assertJsonPath('data.provider', 'microsoft');

        $this->assertSame('refresh', Setting::get('inbound_oauth_refresh_token'));
        $this->assertSame('Desk@Contoso.example', Setting::get('inbound_oauth_account'));
        $this->assertSame('microsoft', Setting::get('inbound_mail_provider'));
        $this->assertSame('desk@contoso.example', Setting::get('inbound_mail_address'));
        $this->assertSame('outgoing-token-stays', Setting::get('oauth_refresh_token'));
        $this->assertNull(Setting::get('oauth_account'));

        Http::assertSent(fn ($request) => $request['grant_type'] === 'authorization_code'
            && $request['redirect_uri'] === 'http://localhost:3000/admin/settings/tickets/callback');

        // And the panel now reports it connected.
        $this->actingAs($this->admin(), 'sanctum')->getJson(self::STATUS)->assertOk()
            ->assertJsonPath('data.is_connected', true)
            ->assertJsonPath('data.account', 'Desk@Contoso.example');
    }

    public function test_disconnecting_forgets_the_inbound_token_only(): void
    {
        Setting::put('inbound_mail_provider', 'google');
        Setting::put('inbound_oauth_refresh_token', 'inbound');
        Setting::put('inbound_oauth_account', 'desk@example.test');
        Setting::put('oauth_refresh_token', 'outgoing');
        Http::fake();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/disconnect')
            ->assertOk()
            ->assertJsonPath('data.is_connected', false);

        $this->assertNull(Setting::get('inbound_oauth_refresh_token'));
        $this->assertNull(Setting::get('inbound_oauth_account'));
        $this->assertSame('outgoing', Setting::get('oauth_refresh_token'));
    }

    /* -------------------------------------------------------------- the test */

    public function test_the_check_refuses_until_something_is_configured(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Choose how the mailbox is reached and save first.');

        Setting::put('inbound_mail_provider', 'imap');

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'Fill in the host, username and password and save first.');
    }

    public function test_the_check_reports_what_is_waiting_and_clears_the_last_error(): void
    {
        $this->configureImap();
        Setting::put('inbound_mail_error', 'earlier trouble');

        $fake = new FakeMailbox([FakeMailbox::message(), FakeMailbox::message()]);
        $this->app->instance(Mailbox::class, $fake);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/test')
            ->assertOk()
            ->assertJsonPath('data.unseen', 2)
            ->assertJsonPath('data.folder', 'INBOX');

        $this->assertNull(Setting::get('inbound_mail_error'));
        // Reads only: nothing was flagged.
        $this->assertSame([], $fake->processed);
    }

    public function test_the_check_reports_the_servers_own_words(): void
    {
        $this->configureImap();

        $fake = new FakeMailbox;
        $fake->refuse = '[AUTHENTICATIONFAILED] Invalid credentials (Failure)';
        $this->app->instance(Mailbox::class, $fake);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson(self::STATUS.'/test')
            ->assertStatus(422)
            ->assertJsonPath('message', '[AUTHENTICATIONFAILED] Invalid credentials (Failure)');

        $this->assertStringContainsString('Invalid credentials', (string) Setting::get('inbound_mail_error'));
    }

    private function configureImap(): void
    {
        Setting::put('inbound_mail_provider', 'imap');
        Setting::put('inbound_imap_host', 'imap.example.test');
        Setting::put('inbound_imap_username', 'desk@example.test');
        Setting::put('inbound_imap_password', 'secret');
    }
}
