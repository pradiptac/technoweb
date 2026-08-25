<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Models\Customer;
use App\Models\User;
use App\Notifications\ResetPassword;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

/**
 * Password reset, for both principals.
 *
 * The test that matters most is the cross-principal one. Both brokers
 * originally shared `password_reset_tokens`, whose primary key is the email
 * address — so a token issued to a *customer* reset the *staff* account at the
 * same address. That is privilege escalation into the admin console, and it
 * was verified working before the fix. This is the regression guard.
 */
class PasswordResetTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $email = 'neil@example.test'): Customer
    {
        return Customer::create([
            'name' => 'Neil Basu',
            'email' => $email,
            'password' => 'customer-password-12345',
            'status' => CustomerStatus::Active,
        ]);
    }

    private function staff(string $email = 'engineer@example.test'): User
    {
        return User::create([
            'name' => 'Support Engineer',
            'email' => $email,
            'password' => 'staff-password-12345',
            'is_active' => true,
        ]);
    }

    /** The one that would be privilege escalation. */
    public function test_a_customer_token_cannot_reset_a_staff_account(): void
    {
        $shared = 'shared@example.test';
        $customer = $this->customer($shared);
        $staff = $this->staff($shared);
        $originalStaffHash = $staff->password;

        $token = Password::broker('customers')->createToken($customer);

        $this->postJson('/api/v1/admin/auth/reset-password', [
            'token' => $token,
            'email' => $shared,
            'password' => 'attacker-chosen-password',
            'password_confirmation' => 'attacker-chosen-password',
        ])->assertStatus(422);

        $this->assertSame($originalStaffHash, $staff->fresh()->password);
        $this->assertFalse(Hash::check('attacker-chosen-password', $staff->fresh()->password));
    }

    /** And the reverse, for completeness. */
    public function test_a_staff_token_cannot_reset_a_customer_account(): void
    {
        $shared = 'shared@example.test';
        $customer = $this->customer($shared);
        $staff = $this->staff($shared);
        $originalCustomerHash = $customer->password;

        $token = Password::broker('users')->createToken($staff);

        $this->postJson('/api/v1/auth/reset-password', [
            'token' => $token,
            'email' => $shared,
            'password' => 'attacker-chosen-password',
            'password_confirmation' => 'attacker-chosen-password',
        ])->assertStatus(422);

        $this->assertSame($originalCustomerHash, $customer->fresh()->password);
    }

    public function test_a_staff_reset_works_end_to_end(): void
    {
        Notification::fake();
        $staff = $this->staff();

        $this->postJson('/api/v1/admin/auth/forgot-password', ['email' => $staff->email])
            ->assertOk();

        Notification::assertSentTo($staff, ResetPassword::class, function (ResetPassword $n) use ($staff) {
            // The link must open the admin form, not the portal one.
            $this->assertSame('admin', $n->audience);

            $this->postJson('/api/v1/admin/auth/reset-password', [
                'token' => $n->token,
                'email' => $staff->email,
                'password' => 'a-brand-new-password-1',
                'password_confirmation' => 'a-brand-new-password-1',
            ])->assertOk();

            return true;
        });

        $this->assertTrue(Hash::check('a-brand-new-password-1', $staff->fresh()->password));
    }

    public function test_a_customer_reset_links_to_the_portal_form(): void
    {
        Notification::fake();
        $customer = $this->customer();

        $this->postJson('/api/v1/auth/forgot-password', ['email' => $customer->email])->assertOk();

        Notification::assertSentTo(
            $customer,
            ResetPassword::class,
            fn (ResetPassword $n) => $n->audience === 'portal',
        );
    }

    /**
     * An unknown address must look exactly like a known one, or the endpoint
     * becomes a way to discover who has an account.
     */
    public function test_an_unknown_address_is_indistinguishable_from_a_known_one(): void
    {
        Notification::fake();
        $staff = $this->staff();

        $known = $this->postJson('/api/v1/admin/auth/forgot-password', ['email' => $staff->email]);
        $unknown = $this->postJson('/api/v1/admin/auth/forgot-password', ['email' => 'nobody@example.test']);

        $known->assertOk();
        $unknown->assertOk();
        $this->assertSame($known->json('message'), $unknown->json('message'));

        Notification::assertSentTo($staff, ResetPassword::class);
        Notification::assertCount(1);
    }

    public function test_a_token_cannot_be_used_twice(): void
    {
        Notification::fake();
        $staff = $this->staff();
        $token = Password::broker('users')->createToken($staff);

        $payload = [
            'token' => $token,
            'email' => $staff->email,
            'password' => 'first-new-password-12',
            'password_confirmation' => 'first-new-password-12',
        ];

        $this->postJson('/api/v1/admin/auth/reset-password', $payload)->assertOk();
        $this->postJson('/api/v1/admin/auth/reset-password', [
            ...$payload,
            'password' => 'second-new-password-1',
            'password_confirmation' => 'second-new-password-1',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('first-new-password-12', $staff->fresh()->password));
    }

    public function test_a_reset_signs_out_every_existing_session(): void
    {
        $staff = $this->staff();
        $staff->createToken('admin');
        $this->assertSame(1, $staff->tokens()->count());

        $token = Password::broker('users')->createToken($staff);

        $this->postJson('/api/v1/admin/auth/reset-password', [
            'token' => $token,
            'email' => $staff->email,
            'password' => 'a-brand-new-password-1',
            'password_confirmation' => 'a-brand-new-password-1',
        ])->assertOk();

        $this->assertSame(0, $staff->fresh()->tokens()->count());
    }

    public function test_a_short_password_is_refused(): void
    {
        $staff = $this->staff();
        $token = Password::broker('users')->createToken($staff);

        $this->postJson('/api/v1/admin/auth/reset-password', [
            'token' => $token,
            'email' => $staff->email,
            'password' => 'short',
            'password_confirmation' => 'short',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    /* ---------------------------------------------- changing it while signed in */

    public function test_any_staff_role_can_change_their_own_password(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->patchJson('/api/v1/admin/auth/password', [
                'current_password' => 'staff-password-12345',
                'password' => 'a-brand-new-password-1',
                'password_confirmation' => 'a-brand-new-password-1',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('a-brand-new-password-1', $staff->fresh()->password));
    }

    public function test_changing_a_password_requires_the_current_one(): void
    {
        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->patchJson('/api/v1/admin/auth/password', [
                'current_password' => 'not-the-right-password',
                'password' => 'a-brand-new-password-1',
                'password_confirmation' => 'a-brand-new-password-1',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertTrue(Hash::check('staff-password-12345', $staff->fresh()->password));
    }

    public function test_a_customer_token_cannot_change_a_staff_password(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'sanctum')
            ->patchJson('/api/v1/admin/auth/password', [
                'current_password' => 'customer-password-12345',
                'password' => 'a-brand-new-password-1',
                'password_confirmation' => 'a-brand-new-password-1',
            ])
            ->assertForbidden();
    }
}
