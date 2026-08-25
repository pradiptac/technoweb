<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Http\Resources\CustomerResource;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\CustomerApproved;
use App\Notifications\CustomerRegistered;
use App\Notifications\CustomerRejected;
use App\Notifications\RegistrationAttempted;
use App\Notifications\VerifyCustomerEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Self-registration, confirmation and approval.
 *
 * Three properties are worth more than the happy path and are each asserted
 * on their own:
 *
 *   1. **The endpoint is not a membership oracle.** Registering with a known
 *      address must be indistinguishable from registering with an unknown one.
 *      This audience's addresses are worth phishing, and "already taken" is
 *      the whole leak.
 *   2. **An unapproved account cannot sign in**, and neither can an
 *      unconfirmed one — with different, actionable reasons.
 *   3. **Turning an account off ends its live sessions.** A suspension that
 *      leaves a token working is a suspension in name only.
 */
class CustomerRegistrationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'correct-horse-battery-staple-9';

    protected function setUp(): void
    {
        parent::setUp();

        Setting::create(['group' => 'portal', 'key' => 'registration_enabled', 'value' => '1', 'type' => 'boolean']);
    }

    private function register(array $overrides = []): TestResponse
    {
        return $this->postJson('/api/v1/auth/register', array_merge([
            'name' => 'Priya Raman',
            'email' => 'priya@example.test',
            'password' => self::PASSWORD,
            'password_confirmation' => self::PASSWORD,
            'company' => 'Meridian Foods',
        ], $overrides));
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Support Engineer',
            'email' => 'engineer@example.test',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $role = Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value],
            ['name' => RoleEnum::SupportEngineer->label()],
        );
        $user->roles()->attach($role);

        return $user;
    }

    /* ------------------------------------------------------- registration */

    public function test_registration_creates_a_pending_unverified_account(): void
    {
        Notification::fake();

        $this->register()->assertStatus(202);

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();

        $this->assertSame(CustomerStatus::Pending, $customer->status);
        $this->assertNull($customer->email_verified_at);
        $this->assertNull($customer->approved_at);

        Notification::assertSentTo($customer, VerifyCustomerEmail::class);
    }

    public function test_the_address_is_stored_lowercased(): void
    {
        Notification::fake();

        $this->register(['email' => '  PRIYA@Example.Test '])->assertStatus(202);

        $this->assertDatabaseHas('customers', ['email' => 'priya@example.test']);
    }

    /**
     * The one that matters. Every branch of `register` must be byte-identical
     * on the wire, or the form tells a stranger which addresses have accounts.
     */
    public function test_a_duplicate_address_is_indistinguishable_from_a_new_one(): void
    {
        Notification::fake();

        $first = $this->register();
        $second = $this->register(['name' => 'Somebody Else']);

        $this->assertSame($first->status(), $second->status());
        $this->assertSame($first->json(), $second->json());

        // Nothing was created, nothing was overwritten.
        $this->assertSame(1, Customer::where('email', 'priya@example.test')->count());
        $this->assertSame('Priya Raman', Customer::where('email', 'priya@example.test')->value('name'));
    }

    public function test_a_duplicate_registration_warns_the_real_account_holder(): void
    {
        Notification::fake();

        $this->register();
        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();

        $this->register(['name' => 'Somebody Else']);

        // The stranger at the form learns nothing; the person who owns the
        // address learns everything.
        Notification::assertSentTo($customer, RegistrationAttempted::class);
    }

    public function test_the_honeypot_stores_nothing_and_says_so_to_nobody(): void
    {
        Notification::fake();

        $clean = $this->register(['email' => 'clean@example.test']);
        $trapped = $this->register(['email' => 'bot@example.test', 'website' => 'http://spam.test']);

        $this->assertSame($clean->status(), $trapped->status());
        $this->assertSame($clean->json(), $trapped->json());
        $this->assertDatabaseMissing('customers', ['email' => 'bot@example.test']);
    }

    public function test_registration_can_be_closed(): void
    {
        Setting::where('key', 'registration_enabled')->update(['value' => '0']);
        Setting::flushCache();

        $this->register()->assertStatus(403);
        $this->assertDatabaseMissing('customers', ['email' => 'priya@example.test']);
    }

    public function test_a_short_password_is_refused(): void
    {
        $this->register(['password' => 'short', 'password_confirmation' => 'short'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    /* ------------------------------------------------------- verification */

    public function test_confirming_the_address_marks_it_verified_and_tells_the_desk(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $token = $customer->issueVerificationToken();

        $this->postJson('/api/v1/auth/verify-email', [
            'email' => 'priya@example.test',
            'token' => $token,
        ])->assertOk()->assertJson(['status' => 'pending', 'already_verified' => false]);

        $this->assertNotNull($customer->fresh()->email_verified_at);

        // Announced on confirmation rather than on submission: an unconfirmed
        // row is noise, and a public form would otherwise fill the support
        // inbox with it.
        Notification::assertSentOnDemand(CustomerRegistered::class);
    }

    public function test_a_confirmation_token_works_once(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $token = $customer->issueVerificationToken();

        $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => $token])->assertOk();

        $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => $token])
            ->assertOk()
            ->assertJson(['already_verified' => true]);
    }

    public function test_an_expired_token_is_refused(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $token = $customer->issueVerificationToken();

        $customer->forceFill([
            'email_verification_sent_at' => now()->subHours(Customer::VERIFICATION_HOURS + 1),
        ])->save();

        $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => $token])
            ->assertStatus(422);

        $this->assertNull($customer->fresh()->email_verified_at);
    }

    public function test_a_wrong_token_and_an_unknown_address_answer_the_same(): void
    {
        Notification::fake();
        $this->register();

        $wrong = $this->postJson('/api/v1/auth/verify-email', ['email' => 'priya@example.test', 'token' => 'nope']);
        $unknown = $this->postJson('/api/v1/auth/verify-email', ['email' => 'nobody@example.test', 'token' => 'nope']);

        $this->assertSame($wrong->status(), $unknown->status());
        $this->assertSame($wrong->json(), $unknown->json());
    }

    /* -------------------------------------------------------------- login */

    public function test_an_unconfirmed_account_cannot_sign_in(): void
    {
        Notification::fake();
        $this->register();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertStatus(403)
            ->assertJson(['reason' => 'email_unverified']);
    }

    public function test_a_confirmed_but_unapproved_account_cannot_sign_in(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->markEmailVerified();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertStatus(403)
            ->assertJson(['reason' => 'pending_approval']);
    }

    /**
     * A rejected account is told it is not active and nothing else. Asking
     * somebody to confirm an address they can never sign in with is busywork.
     */
    public function test_a_rejected_account_is_not_asked_to_confirm_its_address(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->forceFill(['status' => CustomerStatus::Rejected])->save();

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertStatus(403)
            ->assertJson(['reason' => 'rejected']);
    }

    public function test_a_wrong_password_still_answers_401_whatever_the_status(): void
    {
        Notification::fake();
        $this->register();

        // The status of an account is not something a wrong password earns.
        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => 'not-the-password'])
            ->assertStatus(401);
    }

    /* ----------------------------------------------------------- approval */

    public function test_staff_can_approve_a_pending_account_and_it_can_then_sign_in(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->markEmailVerified();

        $staff = $this->staff();

        $this->actingAs($staff, 'sanctum')
            ->postJson("/api/v1/admin/customers/{$customer->id}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.approved_by', $staff->name);

        Notification::assertSentTo($customer, CustomerApproved::class);

        $this->postJson('/api/v1/auth/login', ['email' => 'priya@example.test', 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonStructure(['token', 'customer']);
    }

    public function test_rejecting_an_account_emails_them_and_kills_their_sessions(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->markEmailVerified();
        $customer->forceFill(['status' => CustomerStatus::Active])->save();
        $customer->createToken('portal', ['portal']);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/customers/{$customer->id}/reject", ['note' => 'No contract on file'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected')
            ->assertJsonPath('data.status_note', 'No contract on file');

        $this->assertSame(0, $customer->tokens()->count());
        Notification::assertSentTo($customer, CustomerRejected::class);
    }

    public function test_suspending_an_account_kills_its_sessions(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->forceFill(['status' => CustomerStatus::Active, 'email_verified_at' => now()])->save();
        $customer->createToken('portal', ['portal']);

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/customers/{$customer->id}/status", ['status' => 'suspended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'suspended');

        $this->assertSame(0, $customer->tokens()->count());
    }

    public function test_a_note_is_staff_only_and_never_reaches_the_customer(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();

        $this->actingAs($this->staff(), 'sanctum')
            ->postJson("/api/v1/admin/customers/{$customer->id}/reject", ['note' => 'Competitor fishing for pricing'])
            ->assertOk();

        // CustomerResource is what a customer sees of themselves. The note is
        // an internal judgement about them and has no business in it.
        $resource = (new CustomerResource($customer->fresh()))
            ->toArray(request());

        $this->assertArrayNotHasKey('status_note', $resource);
    }

    /**
     * Changing the address invalidates the confirmation. Otherwise editing an
     * approved account is a way to point it at any inbox at all.
     */
    public function test_changing_a_customers_address_requires_reconfirmation(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->markEmailVerified();

        $this->actingAs($this->staff(), 'sanctum')
            ->patchJson("/api/v1/admin/customers/{$customer->id}", ['email' => 'someone.else@example.test'])
            ->assertOk()
            ->assertJsonPath('data.email_verified', false);

        Notification::assertSentTo($customer->fresh(), VerifyCustomerEmail::class);
    }

    /* --------------------------------------------------------- boundaries */

    public function test_a_customer_token_cannot_reach_the_approval_queue(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->forceFill(['status' => CustomerStatus::Active, 'email_verified_at' => now()])->save();

        $this->actingAs($customer, 'sanctum')
            ->getJson('/api/v1/admin/customers')
            ->assertStatus(403);
    }

    public function test_the_queue_needs_authentication(): void
    {
        $this->getJson('/api/v1/admin/customers')->assertStatus(401);
    }

    /**
     * The regression guard for the day `is_active` was dropped: the middleware
     * still read it, the missing attribute evaluated as false, and every
     * authenticated portal request 403'd. The whole customer portal was down.
     */
    public function test_an_active_customer_can_use_the_portal(): void
    {
        Notification::fake();
        $this->register();

        $customer = Customer::where('email', 'priya@example.test')->firstOrFail();
        $customer->forceFill(['status' => CustomerStatus::Active, 'email_verified_at' => now()])->save();

        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/auth/me')->assertOk();
        $this->actingAs($customer, 'sanctum')->getJson('/api/v1/tickets')->assertOk();
    }
}
