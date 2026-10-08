<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\CustomerRegistered;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * "Continue with Google" for customers (docs/auth.md "Signing in with
 * Google").
 *
 * What carries the feature, each asserted on its own:
 *
 *   1. **A round trip is single-use and belongs to one browser.** A state is
 *      spent by its first callback, and a callback carrying another browser's
 *      binding is refused before Google is asked anything.
 *   2. **Only what Google vouches for is believed.** The audience, the issuer,
 *      the nonce and the expiry of the ID token, and an address Google has
 *      verified — an unverified one finds and makes no account.
 *   3. **The account's own status still decides**, exactly as it does for a
 *      password or a code: pending waits, suspended is refused.
 *   4. **A first confirmation retires a password nobody proved**, the rule
 *      `Customer::markEmailVerified()` keeps for every other way in.
 *
 * Google is `Http::fake()`d: the token endpoint answers the ID token each
 * test builds. Nothing here reaches the network.
 */
class GoogleSignInTest extends TestCase
{
    use RefreshDatabase;

    private const CLIENT = '1234567890-abcdefghij.apps.googleusercontent.com';

    private const REDIRECT = 'http://localhost:3000/portal/auth/google/callback';

    private const BINDING = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

    /**
     * What Google's token endpoint answers next: `[body, status]`.
     *
     * One fake reading this, set up once — `Http::fake()` called again does
     * not replace an earlier stub for the same address, so a second sign-in
     * in one test would be answered with the first one's token.
     *
     * @var array{0: array<string, mixed>, 1: int}
     */
    private array $google = [[], 500];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);

        Setting::put('google_login_enabled', '1');
        Setting::put('google_login_client_id', self::CLIENT);
        Setting::put('google_login_client_secret', 'GOCSPX-test-secret');
        Setting::put('registration_enabled', '1');
        Setting::put('customer_approval_required', '0');

        Notification::fake();
        Http::fake(['oauth2.googleapis.com/token' => fn () => Http::response(...$this->google)]);
    }

    /* ------------------------------------------------------------ helpers */

    /** Start a round trip and hand back what Google would be sent. */
    private function begin(string $binding = self::BINDING): array
    {
        $url = $this->postJson('/api/v1/auth/google/authorize', ['redirect_uri' => self::REDIRECT, 'binding' => $binding])
            ->assertOk()->json('data.url');

        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        return $query;
    }

    /** An ID token as Google's token endpoint would return it. Unsigned: see `GoogleSignIn`. */
    private function idToken(array $claims): string
    {
        $encode = fn (array $part) => rtrim(strtr(base64_encode((string) json_encode($part)), '+/', '-_'), '=');

        return $encode(['alg' => 'RS256', 'typ' => 'JWT']).'.'.$encode($claims).'.signature';
    }

    /** The callback, with Google answering `$claims` (merged over a good set). */
    private function finish(array $query, array $claims = [], string $binding = self::BINDING): TestResponse
    {
        $this->google = [['id_token' => $this->idToken($claims + [
            'iss' => 'https://accounts.google.com',
            'aud' => self::CLIENT,
            'exp' => now()->addHour()->timestamp,
            'nonce' => $query['nonce'],
            'sub' => '110169484474386276334',
            'email' => 'Asha.Rao@Example.in',
            'email_verified' => true,
            'name' => 'Asha Rao',
        ])], 200];

        return $this->postJson('/api/v1/auth/google/callback', [
            'code' => '4/0AfakeCode',
            'state' => $query['state'],
            'redirect_uri' => self::REDIRECT,
            'binding' => $binding,
        ]);
    }

    private function customer(array $overrides = []): Customer
    {
        $verified = array_key_exists('email_verified_at', $overrides) ? $overrides['email_verified_at'] : now();
        $sub = $overrides['google_sub'] ?? null;
        unset($overrides['email_verified_at'], $overrides['google_sub']);

        $customer = Customer::create($overrides + [
            'name' => 'Asha Rao',
            'email' => 'asha.rao@example.in',
            'password' => 'a-password-somebody-chose-9',
            'status' => CustomerStatus::Active,
        ]);

        $customer->forceFill(['email_verified_at' => $verified, 'google_sub' => $sub])->save();

        return $customer;
    }

    /* ------------------------------------------------------- the first leg */

    public function test_the_consent_address_names_this_client_and_this_sites_callback(): void
    {
        $query = $this->begin();

        $this->assertSame(self::CLIENT, $query['client_id']);
        $this->assertSame(self::REDIRECT, $query['redirect_uri']);
        $this->assertSame('code', $query['response_type']);
        $this->assertSame('openid email profile', $query['scope']);
        $this->assertSame(48, strlen($query['state']));
        $this->assertNotEmpty($query['nonce']);
    }

    public function test_it_is_refused_while_switched_off_or_half_configured(): void
    {
        Setting::put('google_login_enabled', '0');
        $this->postJson('/api/v1/auth/google/authorize', ['redirect_uri' => self::REDIRECT, 'binding' => self::BINDING])
            ->assertForbidden()->assertJsonPath('reason', 'google_login_disabled');

        Setting::put('google_login_enabled', '1');
        Setting::put('google_login_client_secret', null);
        $this->postJson('/api/v1/auth/google/authorize', ['redirect_uri' => self::REDIRECT, 'binding' => self::BINDING])
            ->assertForbidden()->assertJsonPath('reason', 'google_login_disabled');
        $this->postJson('/api/v1/auth/google/callback', ['code' => 'x', 'state' => 'y', 'redirect_uri' => self::REDIRECT, 'binding' => self::BINDING])
            ->assertForbidden()->assertJsonPath('reason', 'google_login_disabled');
    }

    public function test_only_this_sites_own_callback_address_is_accepted(): void
    {
        foreach ([
            'https://technoware.in.attacker.test/portal/auth/google/callback',
            'http://localhost:3000/portal/login',
            'http://localhost:3000/admin/settings/mail/callback',
        ] as $elsewhere) {
            $this->postJson('/api/v1/auth/google/authorize', ['redirect_uri' => $elsewhere, 'binding' => self::BINDING])
                ->assertStatus(422);
        }
    }

    /* ------------------------------------------------------ a new customer */

    public function test_a_new_address_gets_a_confirmed_active_account_and_is_signed_in(): void
    {
        $response = $this->finish($this->begin())->assertOk();

        $customer = Customer::where('email', 'asha.rao@example.in')->firstOrFail();
        $this->assertSame('Asha Rao', $customer->name);
        $this->assertSame(CustomerStatus::Active, $customer->status);
        $this->assertNotNull($customer->email_verified_at);
        $this->assertSame('110169484474386276334', $customer->google_sub);
        $response->assertJsonPath('customer.google_linked', true);

        // The desk hears of every new confirmed account, however it arrived.
        Notification::assertSentOnDemand(CustomerRegistered::class);

        // The token is a real portal session: a Bearer header, not `actingAs`.
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$response->json('token'))
            ->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.email', 'asha.rao@example.in');
    }

    public function test_with_approval_required_the_new_account_waits(): void
    {
        Setting::put('customer_approval_required', '1');

        $this->finish($this->begin())->assertForbidden()->assertJsonPath('reason', 'pending_approval');

        $customer = Customer::where('email', 'asha.rao@example.in')->firstOrFail();
        $this->assertSame(CustomerStatus::Pending, $customer->status);
        $this->assertNotNull($customer->email_verified_at);
        $this->assertSame(0, $customer->tokens()->count());
        Notification::assertSentOnDemand(CustomerRegistered::class);
    }

    public function test_with_registration_closed_no_account_is_made_but_an_existing_one_signs_in(): void
    {
        Setting::put('registration_enabled', '0');

        $this->finish($this->begin())->assertForbidden()->assertJsonPath('reason', 'registration_closed');
        $this->assertSame(0, Customer::count());

        $this->customer();
        $this->finish($this->begin())->assertOk()->assertJsonStructure(['token', 'customer']);
    }

    /* ------------------------------------------------ an existing customer */

    public function test_a_confirmed_account_at_that_address_is_linked_and_keeps_its_password(): void
    {
        $customer = $this->customer();

        $this->finish($this->begin())->assertOk()->assertJsonPath('customer.id', $customer->id);

        $customer->refresh();
        $this->assertSame('110169484474386276334', $customer->google_sub);
        $this->assertTrue(Hash::check('a-password-somebody-chose-9', $customer->password));
        $this->assertSame(1, Customer::count());
        // Nothing was confirmed here, so there is nothing to tell the desk.
        Notification::assertNothingSent();
    }

    public function test_an_unconfirmed_account_is_confirmed_and_its_unproved_password_retired(): void
    {
        // Anybody can register anybody's address and choose its password.
        $customer = $this->customer(['email_verified_at' => null]);
        $stale = $customer->createToken('portal')->plainTextToken;

        $response = $this->finish($this->begin())->assertOk();

        $customer->refresh();
        $this->assertNotNull($customer->email_verified_at);
        $this->assertFalse(Hash::check('a-password-somebody-chose-9', $customer->password));
        // Every session from before the confirmation is gone; only the new one is left.
        $this->assertSame(1, $customer->tokens()->count());
        $this->assertNotSame($stale, $response->json('token'));
        Notification::assertSentOnDemand(CustomerRegistered::class);
    }

    public function test_a_linked_customer_is_found_by_googles_id_after_moving_address(): void
    {
        $customer = $this->customer(['email' => 'asha@newcompany.example', 'google_sub' => '110169484474386276334']);

        $this->finish($this->begin())->assertOk()->assertJsonPath('customer.id', $customer->id);

        $this->assertSame('asha@newcompany.example', $customer->fresh()->email);
        $this->assertSame(1, Customer::count());
    }

    public function test_google_does_not_confirm_an_address_it_did_not_vouch_for(): void
    {
        // Linked earlier; since moved here to an address nobody has confirmed.
        $customer = $this->customer(['email' => 'unproved@elsewhere.example', 'google_sub' => '110169484474386276334', 'email_verified_at' => null]);

        $this->finish($this->begin())->assertForbidden()->assertJsonPath('reason', 'email_unverified');

        $this->assertNull($customer->fresh()->email_verified_at);
        $this->assertTrue(Hash::check('a-password-somebody-chose-9', $customer->fresh()->password));
    }

    public function test_a_suspended_account_is_refused_like_any_other_sign_in(): void
    {
        $this->customer(['status' => CustomerStatus::Suspended]);

        $this->finish($this->begin())->assertForbidden()->assertJsonPath('reason', 'suspended');
    }

    public function test_the_portal_switched_off_closes_this_door_too(): void
    {
        Setting::put('portal_enabled', '0');

        $this->postJson('/api/v1/auth/google/authorize', ['redirect_uri' => self::REDIRECT, 'binding' => self::BINDING])
            ->assertForbidden()->assertJsonPath('reason', 'portal_disabled');
    }

    /* ------------------------------------------------- what is not believed */

    public function test_an_address_google_has_not_verified_finds_and_makes_nothing(): void
    {
        $existing = $this->customer();

        $this->finish($this->begin(), ['email_verified' => false])
            ->assertStatus(422)->assertJsonPath('reason', 'google_unverified');

        $this->assertNull($existing->fresh()->google_sub);
        $this->assertSame(1, Customer::count());
    }

    public static function untrustworthyTokens(): array
    {
        return [
            'another client\'s token' => [['aud' => '999-other.apps.googleusercontent.com']],
            'not from Google' => [['iss' => 'https://accounts.example.test']],
            'a nonce from another attempt' => [['nonce' => 'not-the-one-we-minted']],
            'expired an hour ago' => [['exp' => 1_000_000_000]],
            'no subject' => [['sub' => '']],
        ];
    }

    #[DataProvider('untrustworthyTokens')]
    public function test_an_id_token_that_does_not_check_out_signs_nobody_in(array $claims): void
    {
        $this->finish($this->begin(), $claims)->assertStatus(422)->assertJsonPath('reason', 'google_failed');

        $this->assertSame(0, Customer::count());
    }

    public function test_a_state_is_spent_by_its_first_callback(): void
    {
        $query = $this->begin();

        $this->finish($query)->assertOk();
        $this->finish($query)->assertStatus(422)->assertJsonPath('reason', 'google_expired');
    }

    public function test_a_callback_from_another_browser_is_refused_before_google_is_asked(): void
    {
        $query = $this->begin();

        $this->postJson('/api/v1/auth/google/callback', [
            'code' => '4/0AfakeCode',
            'state' => $query['state'],
            'redirect_uri' => self::REDIRECT,
            // The attacker finished the consent; the victim's browser holds a different cookie.
            'binding' => str_repeat('f', 64),
        ])->assertStatus(422)->assertJsonPath('reason', 'google_expired');

        Http::assertNothingSent();
        $this->assertSame(0, Customer::count());

        // And the attempt is spent: the right browser cannot finish it either.
        $this->finish($query)->assertStatus(422)->assertJsonPath('reason', 'google_expired');
    }

    public function test_googles_refusal_is_one_plain_sentence_and_not_its_own_words(): void
    {
        $query = $this->begin();
        $this->google = [['error' => 'invalid_client', 'error_description' => 'The OAuth client was not found.'], 401];

        $response = $this->postJson('/api/v1/auth/google/callback', [
            'code' => '4/0AfakeCode', 'state' => $query['state'], 'redirect_uri' => self::REDIRECT, 'binding' => self::BINDING,
        ])->assertStatus(422)->assertJsonPath('reason', 'google_failed');

        $this->assertStringNotContainsString('OAuth client', (string) $response->getContent());
        $this->assertStringNotContainsString('invalid_client', (string) $response->getContent());
    }

    /* ------------------------------------------------------------ settings */

    public function test_the_site_learns_one_bit_and_never_the_client(): void
    {
        $settings = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('1', $settings['google_login_live']);
        $this->assertArrayNotHasKey('google_login_client_id', $settings);
        $this->assertArrayNotHasKey('google_login_client_secret', $settings);
        $this->assertArrayNotHasKey('google_login_enabled', $settings);

        Setting::put('google_login_enabled', '0');
        $this->assertSame('0', $this->getJson('/api/v1/settings')->json('data.google_login_live'));
    }

    public function test_a_client_id_of_the_wrong_shape_is_refused_on_save(): void
    {
        $admin = User::create(['name' => 'Admin', 'email' => 'admin@technoware.in', 'phone' => '9800000001', 'password' => 'password-for-tests', 'is_active' => true]);
        $admin->roles()->sync([Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()])->id]);

        $save = fn (string $value) => $this->withHeader('Authorization', 'Bearer '.$admin->createToken('admin')->plainTextToken)
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'google_login_client_id', 'value' => $value]]]);

        // The secret pasted into the wrong box, which is the mistake people make.
        $save('GOCSPX-abcdefghijklmnop')->assertStatus(422);
        $save('555-zzz999.apps.googleusercontent.com')->assertOk();

        $this->assertSame('555-zzz999.apps.googleusercontent.com', Setting::get('google_login_client_id'));
    }
}
