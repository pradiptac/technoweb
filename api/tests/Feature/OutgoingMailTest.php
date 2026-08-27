<?php

namespace Tests\Feature;

use App\Enums\MailTransport;
use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Providers\MailSettingsProvider;
use App\Support\MailOAuth;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Transport\SesTransport;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoApiTransport;
use Symfony\Component\Mailer\Bridge\Mailgun\Transport\MailgunHttpTransport;
use Tests\TestCase;

/**
 * Choosing a transport, connecting a mailbox, and failing usefully.
 *
 * The live consent handshake cannot be tested without a real Google project,
 * so everything around it is: the guards on the redirect, the single-use
 * state, the refresh against a faked token endpoint, and the rule that a
 * failure has to leave a mark somebody sees. What is left untested is one HTTP
 * round trip to accounts.google.com — and these are the tests that make its
 * first real run diagnosable.
 */
class OutgoingMailTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::create([
            'name' => 'Administrator',
            'email' => 'admin@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value],
            ['name' => RoleEnum::Admin->label()],
        );
        $user->roles()->attach($role);

        return $user->load('roles');
    }

    private function seedSettings(): void
    {
        $this->seed(SettingsSeeder::class);
    }

    /* ------------------------------------------------------------ the list */

    public function test_every_transport_reports_whether_its_package_is_on_this_server(): void
    {
        $this->seedSettings();

        $response = $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/settings/mail')
            ->assertOk();

        $byValue = collect($response->json('data.transports'))->keyBy('value');

        // Always here: Symfony Mailer ships with Laravel.
        $this->assertTrue($byValue['smtp']['available']);
        $this->assertTrue($byValue['log']['available']);
        $this->assertTrue($byValue['google']['available']);
        $this->assertNull($byValue['smtp']['install']);

        // Asserted against `class_exists` rather than against `true`, because
        // this is a fact about the server and not about composer.json. The
        // bridges are required now, so a passing `false` here means a vendor
        // directory that disagrees with the lock file — which is exactly the
        // state the console has to be able to describe.
        $this->assertSame(
            class_exists('Aws\\Ses\\SesClient'),
            $byValue['ses']['available'],
        );
        $this->assertSame('composer require aws/aws-sdk-php', $byValue['ses']['install']);
    }

    public function test_each_transport_declares_only_its_own_fields(): void
    {
        $this->assertSame(
            ['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_encryption'],
            MailTransport::Smtp->fields(),
        );
        $this->assertSame(['oauth_client_id', 'oauth_client_secret'], MailTransport::Google->fields());
        $this->assertSame([], MailTransport::Log->fields());

        // The shared pair belongs to no transport, so nothing may claim it.
        foreach (MailTransport::cases() as $transport) {
            $this->assertNotContains('mail_from_address', $transport->fields());
        }
    }

    public function test_an_unknown_stored_transport_falls_back_to_smtp(): void
    {
        $this->seedSettings();
        Setting::put('mail_transport', 'carrier-pigeon');

        $this->assertSame(MailTransport::Smtp, MailTransport::current());
    }

    /* ------------------------------------------------------ what it builds */

    /**
     * Each API transport is actually constructible from its settings.
     *
     * This is not a formality. Laravel's Mailgun factory reads
     * `$config['secret']` with no default while Brevo's own transport takes
     * `key`, so the obvious name for "the API key" is right for one and an
     * "Undefined array key" for the other — a PHP notice at send time, from a
     * screen that had just said the settings were saved. Nothing static can
     * see it: both are strings in an array. Building the transport is the only
     * thing that catches it, so that is what this does.
     */
    #[DataProvider('apiTransports')]
    public function test_an_api_transport_builds_from_its_settings(string $transport, array $settings, string $expect): void
    {
        $this->seedSettings();

        if (! MailTransport::from($transport)->isAvailable()) {
            $this->markTestSkipped("{$transport} needs ".MailTransport::from($transport)->installCommand());
        }

        Setting::put('mail_transport', $transport);
        foreach ($settings as $key => $value) {
            Setting::put($key, $value);
        }
        $this->rebootMail();

        $built = Mail::mailer()->getSymfonyTransport();

        $this->assertSame($transport, config('mail.default'));
        $this->assertInstanceOf($expect, $built);
    }

    public static function apiTransports(): array
    {
        return [
            'brevo' => ['brevo', ['mail_api_key' => 'xkeysib-test'],
                BrevoApiTransport::class],
            'mailgun' => ['mailgun', ['mail_api_key' => 'key-test', 'mailgun_domain' => 'mg.technoware.in'],
                MailgunHttpTransport::class],
            'ses' => ['ses', ['ses_key' => 'AKIATEST', 'ses_secret' => 'test-secret', 'ses_region' => 'ap-south-1'],
                SesTransport::class],
        ];
    }

    /**
     * The EU endpoint reaches the EU, and the region is not silently dropped.
     *
     * Mailgun's regions are separate hosts holding separate accounts, and a US
     * endpoint with EU credentials fails as an authentication error — so the
     * one setting most likely to be wrong is also the one whose error points
     * furthest from the cause.
     */
    public function test_the_mailgun_region_reaches_the_transport(): void
    {
        $this->seedSettings();

        if (! MailTransport::Mailgun->isAvailable()) {
            $this->markTestSkipped('needs '.MailTransport::Mailgun->installCommand());
        }

        Setting::put('mail_transport', 'mailgun');
        Setting::put('mail_api_key', 'key-test');
        Setting::put('mailgun_domain', 'mg.technoware.in');
        Setting::put('mailgun_endpoint', 'api.eu.mailgun.net');
        $this->rebootMail();

        $this->assertStringContainsString(
            'api.eu.mailgun.net',
            (string) Mail::mailer()->getSymfonyTransport(),
        );
    }

    /**
     * A transport whose package is absent refuses with the command to fix it.
     *
     * Live rather than hypothetical: `aws/aws-sdk-php` is around 50MB of vendor
     * on every deploy and SES was deferred, so it is not installed and this is
     * the path an administrator reaches by choosing it. Two things have to
     * happen and neither is a class-not-found — the provider leaves `.env` in
     * charge instead of half-applying a transport it cannot build, and the test
     * button says what to run.
     */
    public function test_choosing_a_transport_this_server_lacks_is_refused_with_the_command(): void
    {
        $missing = collect(MailTransport::cases())->first(fn (MailTransport $t) => ! $t->isAvailable());

        if (! $missing) {
            $this->markTestSkipped('every transport is installed on this machine');
        }

        $this->seedSettings();
        Setting::put('mail_transport', $missing->value);
        $this->rebootMail();

        // Not applied, so mail keeps working through whatever .env says.
        $this->assertNotSame($missing->value, config('mail.default'));

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/test')
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $m) => str_contains($m, (string) $missing->installCommand()));
    }

    /**
     * An incomplete transport leaves .env in charge rather than half-applying.
     *
     * Mailgun needs a domain as well as a key, and a transport configured with
     * one of the two is not a working transport — it is one that throws on the
     * next send. Falling back is what keeps a half-filled settings screen from
     * taking mail down.
     */
    public function test_a_half_configured_transport_is_not_applied(): void
    {
        $this->seedSettings();
        Setting::put('mail_transport', 'mailgun');
        Setting::put('mail_api_key', 'key-test');   // and no domain
        $this->rebootMail();

        $this->assertNotSame('mailgun', config('mail.default'));
    }

    /* --------------------------------------------------------- the guards */

    public function test_the_callback_address_must_be_this_site(): void
    {
        $this->seedSettings();
        Setting::put('oauth_client_id', 'test-client.apps.googleusercontent.com');
        $admin = $this->admin();

        foreach ([
            // The lookalike the exact-host comparison exists for.
            'https://www.technoware.in.attacker.test/admin/settings/mail/callback',
            // Right host, wrong path — still somewhere to send a code.
            'https://www.technoware.in/anything-else',
            'https://accounts.google.com/admin/settings/mail/callback',
        ] as $uri) {
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/v1/admin/settings/mail/authorize', [
                    'transport' => 'google', 'redirect_uri' => $uri,
                ])
                ->assertStatus(422);
        }
    }

    public function test_connecting_needs_a_client_id_first(): void
    {
        $this->seedSettings();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/authorize', [
                'transport' => 'google',
                'redirect_uri' => 'http://localhost:3000/admin/settings/mail/callback',
            ])
            ->assertStatus(422);
    }

    public function test_the_state_is_single_use(): void
    {
        $this->seedSettings();
        Setting::put('oauth_client_id', 'test-client.apps.googleusercontent.com');

        $result = MailOAuth::authorizeUrl(
            MailTransport::Google,
            'http://localhost:3000/admin/settings/mail/callback',
        );

        $this->assertStringContainsString('accounts.google.com', $result['url']);
        // Without this Google returns no refresh token on a second consent,
        // and the connection dies an hour later for no visible reason.
        $this->assertStringContainsString('access_type=offline', $result['url']);
        $this->assertStringContainsString('prompt=consent', $result['url']);

        // Spent on first use...
        $this->assertSame(
            MailTransport::Google,
            MailOAuth::consumeState($result['state'])['transport'],
        );

        // ...and worthless afterwards, so a replayed callback is refused.
        $this->expectException(\RuntimeException::class);
        MailOAuth::consumeState($result['state']);
    }

    public function test_a_forged_state_is_refused(): void
    {
        $this->seedSettings();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/callback', [
                'code' => '4/not-a-real-code', 'state' => 'invented',
            ])
            ->assertStatus(422);
    }

    public function test_a_content_manager_cannot_touch_outgoing_mail(): void
    {
        $this->seedSettings();

        $user = User::create([
            'name' => 'Editor', 'email' => 'editor@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        $this->actingAs($user->load('roles'), 'sanctum')
            ->getJson('/api/v1/admin/settings/mail')
            ->assertForbidden();
    }

    /* ----------------------------------------------------------- the token */

    public function test_the_access_token_is_cached_and_reused(): void
    {
        $this->seedSettings();
        $this->connectFakeMailbox();

        Http::fake([
            'oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'first-token', 'expires_in' => 3600,
            ]),
        ]);

        $this->assertSame('first-token', MailOAuth::accessToken(MailTransport::Google));
        $this->assertSame('first-token', MailOAuth::accessToken(MailTransport::Google));

        // One round trip, not two: an access token good for an hour must not
        // cost a request to Google on every notification the desk sends.
        Http::assertSentCount(1);
    }

    public function test_a_rotated_refresh_token_is_stored(): void
    {
        $this->seedSettings();
        $this->connectFakeMailbox();

        Http::fake([
            'oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'new-access',
                'refresh_token' => 'rotated-refresh',
                'expires_in' => 3600,
            ]),
        ]);

        MailOAuth::refresh(MailTransport::Google);

        // Google rotates on some accounts and not others. Missing the new one
        // means the connection works until the next rotation and then dies.
        $this->assertSame('rotated-refresh', Setting::get('oauth_refresh_token'));
    }

    public function test_a_refused_refresh_records_why_where_somebody_will_see_it(): void
    {
        $this->seedSettings();
        $this->connectFakeMailbox();

        Http::fake([
            'oauth2.googleapis.com/token' => Http::response([
                'error' => 'invalid_grant',
                'error_description' => 'Token has been expired or revoked.',
            ], 400),
        ]);

        try {
            MailOAuth::refresh(MailTransport::Google);
            $this->fail('a refused refresh should throw');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('revoked', $e->getMessage());
        }

        // The point of the whole design: Notifier swallows the failure, so
        // this is the only thing standing between "mail stopped" and nobody
        // finding out until a customer complains.
        $this->assertStringContainsString('revoked', (string) Setting::get('mail_error'));

        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/settings/mail')
            ->assertOk()
            ->assertJsonPath('data.is_connected', true)
            ->assertJsonFragment(['error' => Setting::get('mail_error')]);
    }

    public function test_disconnecting_forgets_the_token(): void
    {
        $this->seedSettings();
        $this->connectFakeMailbox();
        Http::fake();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/disconnect')
            ->assertOk();

        $this->assertNull(Setting::get('oauth_refresh_token'));
        $this->assertNull(Setting::get('oauth_account'));
    }

    /* ------------------------------------------------------------ sending */

    public function test_the_test_message_goes_to_the_signed_in_administrator(): void
    {
        $this->seedSettings();
        Setting::put('mail_transport', 'log');
        Mail::fake();

        $admin = $this->admin();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/test')
            ->assertOk()
            ->assertJsonPath('data.sent_to', $admin->email);
    }

    /**
     * Every other path in this application swallows a mail failure on purpose.
     * This one must not: it is the screen asking the question directly, and an
     * answer of "sent" when nothing was sent is worse than no button at all.
     */
    public function test_a_send_failure_is_reported_rather_than_swallowed(): void
    {
        $this->seedSettings();
        Setting::put('mail_transport', 'smtp');
        Setting::put('smtp_host', '127.0.0.1');
        // Port 2 refuses immediately, so this does not wait out a timeout.
        Setting::put('smtp_port', '2');
        $this->rebootMail();

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/settings/mail/test')
            ->assertStatus(422);

        $this->assertNotNull(Setting::get('mail_error'));
    }

    /**
     * Re-read the settings into the mail configuration.
     *
     * `MailSettingsProvider` runs at application boot, which is *before* a
     * test writes anything — so a transport chosen mid-test is not the one the
     * mailer is holding. That is also true in production and is the right
     * behaviour: a settings change takes effect on the next request, and the
     * request that saves it is not the one that sends anything.
     *
     * `Mail::purge` matters as much as the re-boot: the manager caches a built
     * mailer per name, so new configuration reaches nothing until the old
     * instance is dropped.
     */
    private function rebootMail(): void
    {
        (new MailSettingsProvider($this->app))->boot();
        Mail::purge(config('mail.default'));
    }

    private function connectFakeMailbox(): void
    {
        Cache::flush();
        Setting::put('mail_transport', 'google');
        Setting::put('oauth_client_id', 'test-client.apps.googleusercontent.com');
        Setting::put('oauth_client_secret', 'test-secret');
        Setting::put('oauth_refresh_token', 'stored-refresh-token');
        Setting::put('oauth_account', 'support@technoware.in');
    }
}
