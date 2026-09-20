<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\SignInAudience;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\SignInCode;
use App\Models\User;
use App\Notifications\CustomerRegistered;
use App\Notifications\SignInCodeIssued;
use App\Support\SignInCodes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Signing in with a one-time code, both principals.
 *
 * Four properties carry the security of this feature, and each is asserted on
 * its own rather than being implied by a happy path:
 *
 *   1. **A code belongs to one audience.** A portal code must be worthless at
 *      the console and the reverse. This is the exact shape of the bug the
 *      shared `password_reset_tokens` table produced — a token issued to a
 *      customer resetting the staff account at the same address — and the
 *      reason `sign_in_codes` is keyed on the audience rather than filtered by
 *      it afterwards.
 *   2. **Neither endpoint is a membership oracle.** An address with no account
 *      must answer identically to one with an account, and every way a code
 *      can be no good must answer identically to every other way.
 *   3. **A code is spent once, and guessing it ends.** Single use, and five
 *      wrong entries burn it — six digits is not a space a rate limit closes.
 *   4. **The account's own status still decides.** A code proves an address; it
 *      does not approve an account, un-suspend one, or reactivate a staff
 *      login.
 */
class SignInCodeTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery-staple-9';

    protected function setUp(): void
    {
        parent::setUp();

        Setting::create(['group' => 'auth', 'key' => 'otp_login_enabled', 'value' => '1', 'type' => 'boolean']);
        Setting::create(['group' => 'auth', 'key' => 'otp_admin_login_enabled', 'value' => '1', 'type' => 'boolean']);
        Setting::create(['group' => 'mail', 'key' => 'mail_error', 'value' => null, 'type' => 'string']);

        Notification::fake();
    }

    /* ------------------------------------------------------------ helpers */

    private function customer(array $overrides = []): Customer
    {
        // `email_verified_at` is not fillable — deliberately, since confirming
        // an address is something the verification flow does and not something
        // a create call should be able to assert in passing.
        $verified = array_key_exists('email_verified_at', $overrides)
            ? $overrides['email_verified_at']
            : now();

        unset($overrides['email_verified_at']);

        $customer = Customer::create(array_merge([
            'name' => 'Priya Raman',
            'email' => 'priya@example.test',
            'password' => self::PASSWORD,
            'status' => CustomerStatus::Active,
        ], $overrides));

        $customer->forceFill(['email_verified_at' => $verified])->save();

        return $customer;
    }

    private function staff(array $overrides = []): User
    {
        return User::create(array_merge([
            'name' => 'Support Engineer',
            'email' => 'engineer@example.test',
            'password' => self::PASSWORD,
            'is_active' => true,
        ], $overrides));
    }

    private function requestCode(string $email, SignInAudience $audience = SignInAudience::Portal): TestResponse
    {
        return $this->postJson($this->base($audience).'/request-code', ['email' => $email]);
    }

    private function verifyCode(string $email, string $code, SignInAudience $audience = SignInAudience::Portal): TestResponse
    {
        return $this->postJson($this->base($audience).'/verify-code', ['email' => $email, 'code' => $code]);
    }

    private function base(SignInAudience $audience): string
    {
        return $audience === SignInAudience::Admin ? '/api/v1/admin/auth' : '/api/v1/auth';
    }

    /** The plain code as it was actually posted, read off the notification. */
    private function sentCode(string $email): string
    {
        $code = null;

        Notification::assertSentOnDemand(
            SignInCodeIssued::class,
            function (SignInCodeIssued $notification, array $channels, object $notifiable) use ($email, &$code) {
                if (($notifiable->routes['mail'] ?? null) !== $email) {
                    return false;
                }

                $code = $notification->code;

                return true;
            },
        );

        return (string) $code;
    }

    /* -------------------------------------------------------- happy paths */

    public function test_a_customer_signs_in_with_a_code(): void
    {
        $customer = $this->customer();

        $this->requestCode($customer->email)->assertStatus(202);

        $response = $this->verifyCode($customer->email, $this->sentCode($customer->email));

        $response->assertOk()->assertJsonStructure(['token', 'customer' => ['id', 'email']]);
        $this->assertSame($customer->id, $response->json('customer.id'));

        // The token it hands back is a working portal token.
        $this->withToken($response->json('token'))
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', $customer->email);
    }

    public function test_a_staff_member_signs_in_with_a_code(): void
    {
        $user = $this->staff();

        $this->requestCode($user->email, SignInAudience::Admin)->assertStatus(202);

        $response = $this->verifyCode(
            $user->email,
            $this->sentCode($user->email),
            SignInAudience::Admin,
        );

        $response->assertOk()->assertJsonStructure(['token', 'staff' => ['id', 'email']]);

        $this->withToken($response->json('token'))
            ->getJson('/api/v1/admin/auth/me')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);

        // Recorded like any other sign-in, plus the request that preceded it.
        $this->assertDatabaseHas('activity_log', ['action' => 'login', 'user_id' => $user->id]);
        $this->assertDatabaseHas('activity_log', ['action' => 'login_code_requested', 'actor_email' => $user->email]);
    }

    public function test_a_code_survives_the_spacing_people_paste_it_with(): void
    {
        $customer = $this->customer();
        $this->requestCode($customer->email);
        $code = $this->sentCode($customer->email);

        $spaced = substr($code, 0, 3).' '.substr($code, 3);

        $this->verifyCode($customer->email, $spaced)->assertOk();
    }

    /* ------------------------------------------------- the audience split */

    public function test_a_portal_code_is_worthless_at_the_console(): void
    {
        // One address, both principals — which is legitimate and is exactly
        // when this goes wrong.
        $this->customer(['email' => 'both@example.test']);
        $this->staff(['email' => 'both@example.test']);

        $this->requestCode('both@example.test', SignInAudience::Portal);
        $portalCode = $this->sentCode('both@example.test');

        $this->verifyCode('both@example.test', $portalCode, SignInAudience::Admin)
            ->assertStatus(422)
            ->assertJsonPath('errors.code.0', 'That code is not valid any more. Ask for a new one.');

        // And it is still good at the door it was issued for.
        $this->verifyCode('both@example.test', $portalCode, SignInAudience::Portal)->assertOk();
    }

    public function test_a_console_code_is_worthless_at_the_portal(): void
    {
        $this->customer(['email' => 'both@example.test']);
        $this->staff(['email' => 'both@example.test']);

        $this->requestCode('both@example.test', SignInAudience::Admin);
        $adminCode = $this->sentCode('both@example.test');

        $this->verifyCode('both@example.test', $adminCode, SignInAudience::Portal)->assertStatus(422);
        $this->verifyCode('both@example.test', $adminCode, SignInAudience::Admin)->assertOk();
    }

    /* ------------------------------------------------ the identical answers */

    public function test_an_unknown_address_answers_exactly_like_a_known_one(): void
    {
        $customer = $this->customer();

        $known = $this->requestCode($customer->email);
        $unknown = $this->requestCode('nobody@example.test');

        $known->assertStatus(202);
        $unknown->assertStatus(202);

        // Byte-identical, not merely both successful.
        $this->assertSame($known->getContent(), $unknown->getContent());

        /*
         * Two requests, one code — and it went to the address that has an
         * account. Counted rather than asserted with `assertNotSentTo`: an
         * on-demand notifiable carries a route and no key, so every anonymous
         * recipient looks like every other one to that assertion and it passes
         * whatever happened.
         */
        Notification::assertSentOnDemandTimes(SignInCodeIssued::class, 1);
        $this->assertNotSame('', $this->sentCode($customer->email));
    }

    public function test_every_way_a_code_can_be_no_good_gives_one_answer(): void
    {
        $customer = $this->customer();

        // 1. Never issued at all.
        $neverIssued = $this->verifyCode($customer->email, '000000');

        // 2. Wrong.
        $this->requestCode($customer->email);
        $real = $this->sentCode($customer->email);
        $wrong = $this->verifyCode($customer->email, $this->otherThan($real));

        // 3. Expired.
        SignInCode::query()->update(['expires_at' => now()->subMinute()]);
        $expired = $this->verifyCode($customer->email, $real);

        // 4. Already spent.
        SignInCode::query()->update(['expires_at' => now()->addMinutes(10), 'attempts' => 0]);
        $this->verifyCode($customer->email, $real)->assertOk();
        $spent = $this->verifyCode($customer->email, $real);

        foreach ([$neverIssued, $wrong, $expired, $spent] as $response) {
            $response->assertStatus(422);
            $this->assertSame($neverIssued->getContent(), $response->getContent());
        }
    }

    public function test_the_resend_cooldown_does_not_change_the_answer(): void
    {
        $customer = $this->customer();

        $first = $this->requestCode($customer->email);
        $second = $this->requestCode($customer->email);

        $this->assertSame($first->getContent(), $second->getContent());

        // One code went out, not two — and the first one still works.
        Notification::assertSentOnDemandTimes(SignInCodeIssued::class, 1);
    }

    /* ---------------------------------------------------- spending a code */

    public function test_a_code_is_single_use(): void
    {
        $customer = $this->customer();
        $this->requestCode($customer->email);
        $code = $this->sentCode($customer->email);

        $this->verifyCode($customer->email, $code)->assertOk();
        $this->verifyCode($customer->email, $code)->assertStatus(422);
    }

    public function test_five_wrong_attempts_burn_the_code(): void
    {
        $customer = $this->customer();
        $this->requestCode($customer->email);
        $code = $this->sentCode($customer->email);
        $wrong = $this->otherThan($code);

        for ($i = 0; $i < SignInCodes::MAX_ATTEMPTS; $i++) {
            $this->verifyCode($customer->email, $wrong)->assertStatus(422);
        }

        // The right code, inside its ten minutes, and it is gone.
        $this->verifyCode($customer->email, $code)->assertStatus(422);
    }

    public function test_a_new_code_retires_the_previous_one(): void
    {
        $customer = $this->customer();

        $this->requestCode($customer->email);
        $first = $this->sentCode($customer->email);

        // Past the cooldown, so a second code is genuinely issued.
        $this->travel(SignInCodes::RESEND_COOLDOWN_SECONDS + 5)->seconds();
        Notification::fake();
        $this->requestCode($customer->email);
        $second = $this->sentCode($customer->email);

        $this->assertNotSame($first, $second);
        $this->verifyCode($customer->email, $first)->assertStatus(422);
        $this->verifyCode($customer->email, $second)->assertOk();
    }

    /* ------------------------------------------------------- still gated */

    public function test_a_pending_account_is_refused_with_its_reason(): void
    {
        $customer = $this->customer(['status' => CustomerStatus::Pending]);

        $this->requestCode($customer->email);

        $this->verifyCode($customer->email, $this->sentCode($customer->email))
            ->assertStatus(403)
            ->assertJsonPath('reason', 'pending_approval');
    }

    public function test_a_suspended_account_is_refused(): void
    {
        $customer = $this->customer(['status' => CustomerStatus::Suspended]);

        $this->requestCode($customer->email);

        $this->verifyCode($customer->email, $this->sentCode($customer->email))
            ->assertStatus(403)
            ->assertJsonPath('reason', 'suspended');
    }

    public function test_an_inactive_staff_account_is_refused_and_recorded(): void
    {
        $user = $this->staff(['is_active' => false]);

        $this->requestCode($user->email, SignInAudience::Admin);

        $this->verifyCode($user->email, $this->sentCode($user->email), SignInAudience::Admin)
            ->assertStatus(403);

        $this->assertDatabaseHas('activity_log', [
            'action' => 'login_failed',
            'actor_email' => $user->email,
        ]);
    }

    /**
     * A code delivered and typed back is the proof `verify-email` asks for.
     *
     * And the desk has to be told, or the person is confirmed, waiting for an
     * approval, and in nobody's queue.
     */
    public function test_a_code_confirms_an_unverified_address_and_tells_the_desk(): void
    {
        $customer = $this->customer([
            'status' => CustomerStatus::Pending,
            'email_verified_at' => null,
        ]);

        $this->requestCode($customer->email);

        // Still pending, so still refused — but the address is now confirmed.
        $this->verifyCode($customer->email, $this->sentCode($customer->email))
            ->assertStatus(403)
            ->assertJsonPath('reason', 'pending_approval');

        $this->assertNotNull($customer->fresh()->email_verified_at);
        Notification::assertSentOnDemand(CustomerRegistered::class);
    }

    public function test_an_unverified_active_account_signs_straight_in(): void
    {
        $customer = $this->customer(['email_verified_at' => null]);

        $this->requestCode($customer->email);

        $this->verifyCode($customer->email, $this->sentCode($customer->email))->assertOk();
        $this->assertNotNull($customer->fresh()->email_verified_at);
    }

    /* ------------------------------------------------------- the switches */

    public function test_codes_can_be_switched_off_per_audience(): void
    {
        Setting::put('otp_login_enabled', '0');

        $this->requestCode($this->customer()->email)->assertStatus(403);

        // The console is a separate decision and is still on.
        $this->requestCode($this->staff()->email, SignInAudience::Admin)->assertStatus(202);
    }

    /** Any six digits that are not the ones we were given. */
    private function otherThan(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }

    /**
     * The default is offered to the sign-in screens, and it is public.
     *
     * Both forms render before anybody is authenticated, so a setting they
     * cannot read is a setting that does nothing — which is exactly what
     * `portal_enabled` was until something read it.
     */
    public function test_the_default_sign_in_method_is_published(): void
    {
        Setting::updateOrCreate(
            ['key' => 'default_login_method'],
            ['group' => 'auth', 'value' => 'password', 'type' => 'string'],
        );
        Setting::flushCache();

        $this->getJson('/api/v1/settings')
            ->assertOk()
            ->assertJsonPath('data.default_login_method', 'password');
    }
}
