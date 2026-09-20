<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\Setting;
use App\Notifications\CustomerRegistered;
use App\Notifications\VerifyCustomerEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * `customer_approval_required`: whether a self-registered account needs a
 * human to approve it, or goes straight to `Active` the moment its address is
 * confirmed.
 *
 * `CustomerRegistrationTest` covers the approval workflow itself with the
 * setting seeded **on**, since that is what those tests are named for. This
 * file is the setting's own behaviour, both ways — including the one thing
 * that has to keep being true regardless: an unconfirmed address still
 * cannot sign in, whichever way the setting is pointed.
 */
class CustomerApprovalSettingTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery-staple-9';

    protected function setUp(): void
    {
        parent::setUp();

        Setting::create(['group' => 'portal', 'key' => 'registration_enabled', 'value' => '1', 'type' => 'boolean']);
    }

    private function register(): Customer
    {
        Notification::fake();

        $this->postJson('/api/v1/auth/register', [
            'name' => 'Priya Raman',
            'email' => 'priya@example.test',
            'password' => self::PASSWORD,
            'password_confirmation' => self::PASSWORD,
            'company' => 'Meridian Foods',
            'phone' => '+91 98311 00758',
        ])->assertStatus(202);

        return Customer::where('email', 'priya@example.test')->firstOrFail();
    }

    /**
     * No row at all, not just `'0'`. `Setting::get()`'s own default of
     * `false` is what a fresh install runs on before the seeder's row ever
     * reaches this database — the same reasoning `otp_login_enabled` and
     * `registration_enabled` document for their own absence.
     */
    public function test_with_no_setting_row_at_all_registration_still_auto_activates(): void
    {
        $customer = $this->register();

        $this->assertSame(CustomerStatus::Active, $customer->status);
    }

    public function test_with_approval_off_a_confirmed_address_can_sign_in_with_no_staff_action(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean']);

        $customer = $this->register();
        $this->assertSame(CustomerStatus::Active, $customer->status);

        $customer->markEmailVerified();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonStructure(['token', 'customer']);
    }

    /**
     * The one thing that must not change either way: confirming the address
     * is still what verification is for, and being `Active` early does not
     * skip it.
     */
    public function test_with_approval_off_an_unconfirmed_address_still_cannot_sign_in(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean']);

        $this->register();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertStatus(403)
            ->assertJson(['reason' => 'email_unverified']);
    }

    public function test_with_approval_on_registration_is_pending_as_before(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '1', 'type' => 'boolean']);

        $customer = $this->register();

        $this->assertSame(CustomerStatus::Pending, $customer->status);
    }

    /**
     * `verify()` already read `$customer->status->canSignIn()` for its own
     * response message before this setting existed — this pins that it keeps
     * doing so now that the status it reads can differ at registration.
     */
    public function test_verifying_an_auto_activated_address_says_you_can_sign_in_now(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean']);

        $customer = $this->register();
        $token = $customer->issueVerificationToken();

        $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => $token])
            ->assertOk()
            ->assertJson(['message' => 'Your address is confirmed. You can sign in now.', 'status' => 'active']);
    }

    public function test_verifying_a_pending_address_says_a_human_will_activate_it(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '1', 'type' => 'boolean']);

        $customer = $this->register();
        $token = $customer->issueVerificationToken();

        $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => $token])
            ->assertOk()
            ->assertJson([
                'message' => 'Your address is confirmed. A member of our team will activate your account shortly.',
                'status' => 'pending',
            ]);
    }

    /**
     * The desk notification must not tell staff to review an account there
     * is nothing left to decide about — the wording this file exists to pin,
     * since `CustomerRegistered` used to say "waiting for approval"
     * unconditionally.
     */
    public function test_the_desk_notification_does_not_ask_for_review_when_nothing_needs_it(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean']);

        $customer = $this->register();
        // The notification fires from the *controller* action, not the model
        // method — going through the real endpoint is what dispatches it.
        $token = $customer->issueVerificationToken();
        $this->postJson('/api/v1/auth/verify-email', ['email' => $customer->email, 'token' => $token])->assertOk();

        Notification::assertSentOnDemand(
            CustomerRegistered::class,
            function (CustomerRegistered $notification) {
                $mail = $notification->toMail($notification->customer);

                $this->assertStringContainsString('already active', implode(' ', $mail->introLines));
                $this->assertStringNotContainsString('waiting for approval', implode(' ', $mail->introLines));
                $this->assertSame('View the account', $mail->actionText);

                return true;
            },
        );
    }

    public function test_the_desk_notification_still_asks_for_review_when_approval_is_required(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '1', 'type' => 'boolean']);

        $customer = $this->register();
        $token = $customer->issueVerificationToken();
        $this->postJson('/api/v1/auth/verify-email', ['email' => $customer->email, 'token' => $token])->assertOk();

        Notification::assertSentOnDemand(
            CustomerRegistered::class,
            function (CustomerRegistered $notification) {
                $mail = $notification->toMail($notification->customer);

                $this->assertStringContainsString('waiting for approval', implode(' ', $mail->introLines));
                $this->assertSame('Review the account', $mail->actionText);

                return true;
            },
        );
    }

    /**
     * Registering does not itself confirm the address — that is still what
     * `VerifyCustomerEmail` is for, whichever way the setting points.
     */
    public function test_approval_being_off_does_not_skip_sending_the_confirmation_email(): void
    {
        Setting::create(['group' => 'portal', 'key' => 'customer_approval_required', 'value' => '0', 'type' => 'boolean']);

        $customer = $this->register();

        Notification::assertSentTo($customer, VerifyCustomerEmail::class);
        $this->assertNull($customer->email_verified_at);
    }
}
