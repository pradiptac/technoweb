<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Net\PublicHost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The mail servers are public hosts on mail ports, and a stored secret only
 * goes where it was saved for.
 *
 * The server connects to `smtp_host` and `inbound_imap_host` from inside the
 * network, and the connection tests report what answered — so any host and
 * port made the settings screen a LAN scanner. And the stored secrets were
 * one edit from leaving: point `mailgun_endpoint`, `smtp_host` or
 * `inbound_imap_host` at a server of your own, press Test, and the key or
 * password the console never shows arrives there.
 */
class MailServerHardeningTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['smtp_host', 'smtp_port', 'inbound_imap_host', 'inbound_imap_port', 'mailgun_endpoint'] as $key) {
            Setting::create(['group' => 'mail', 'key' => $key, 'value' => null, 'type' => 'string']);
        }

        foreach (['smtp_password', 'inbound_imap_password'] as $key) {
            Setting::create(['group' => 'mail', 'key' => $key, 'value' => null, 'type' => 'string', 'is_secret' => true]);
        }
    }

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'admin-mail@example.test'],
            ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $user->roles()->sync([Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value],
            ['name' => RoleEnum::Admin->label()],
        )->id]);

        return $user->load('roles');
    }

    private function save(array $rows)
    {
        return $this->actingAs($this->admin(), 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($rows)->map(fn ($value, $key) => ['key' => $key, 'value' => $value])->values()->all(),
        ]);
    }

    public function test_a_mail_server_on_a_private_host_is_refused(): void
    {
        foreach (['127.0.0.1', '10.0.0.5', '169.254.169.254', '127.1'] as $host) {
            $this->save(['smtp_host' => $host])->assertStatus(422);
            $this->save(['inbound_imap_host' => $host])->assertStatus(422);
        }

        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['192.168.1.20']);
        $this->save(['smtp_host' => 'relay.example.test'])->assertStatus(422);

        $this->app->instance(PublicHost::RESOLVER, fn (string $host): array => ['93.184.216.34']);
        $this->save(['smtp_host' => 'relay.example.test', 'smtp_port' => '587'])->assertOk();
    }

    public function test_a_mail_server_on_a_port_the_protocol_is_not_served_on_is_refused(): void
    {
        $this->save(['smtp_port' => '6379'])->assertStatus(422);
        $this->save(['inbound_imap_port' => '22'])->assertStatus(422);

        $this->save(['smtp_port' => '465', 'inbound_imap_port' => '993'])->assertOk();
    }

    public function test_mailgun_is_one_of_mailguns_hosts(): void
    {
        $this->save(['mailgun_endpoint' => 'collector.evil.example'])->assertStatus(422);

        $this->save(['mailgun_endpoint' => 'api.eu.mailgun.net'])->assertOk();
    }

    /**
     * Moving a stored password to a new server needs the password.
     *
     * Otherwise an administrator's session — or whoever holds it — changes
     * the host, keeps the stored password, presses Test, and reads the
     * password off the first AUTH their own server receives.
     */
    public function test_a_new_host_needs_the_stored_password_typed_again(): void
    {
        Setting::where('key', 'smtp_host')->update(['value' => 'smtp.example.test']);
        Setting::put('smtp_password', 'the-real-password');

        $this->save(['smtp_host' => 'smtp.elsewhere.example'])->assertStatus(422);
        $this->assertSame('smtp.example.test', Setting::where('key', 'smtp_host')->value('value'));

        $this->save(['smtp_host' => 'smtp.elsewhere.example', 'smtp_password' => 'typed-again'])->assertOk();

        // The same host saved again with the rest of the form needs nothing.
        $this->save(['smtp_host' => 'smtp.elsewhere.example', 'smtp_port' => '587'])->assertOk();
    }
}
