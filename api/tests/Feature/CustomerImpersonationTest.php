<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Activity;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * "View as": a staff member opening the portal as a customer.
 *
 * Four properties matter more than the happy path, and each has a test of
 * its own:
 *
 *   1. **The customer's own session survives.** The token is minted under a
 *      name of its own, because `issueToken()` deletes every `portal` token
 *      first — an impersonation issued that way would sign the customer out
 *      of their own browser while somebody is trying to help them.
 *   2. **Nothing about the customer is forged.** `last_login_at` stays as it
 *      was; the console shows it as "Last signed in".
 *   3. **The session is bounded** — an hour, and a fresh press retires the
 *      previous one — and the token never reaches the activity log.
 *   4. **`/auth/me` says which kind of session it is**, from a real bearer
 *      token. `actingAs(…, 'sanctum')` leaves `currentAccessToken()` null and
 *      `Sanctum::actingAs` hands back a mock, so every test that reads the
 *      flag sends the header the portal would.
 */
class CustomerImpersonationTest extends TestCase
{
    use RefreshDatabase;

    /* -------------------------------------------------------------- minting */

    public function test_a_support_engineer_can_mint_an_impersonation_token(): void
    {
        $customer = $this->customer();

        $res = $this->asStaff()
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertOk()
            ->assertJsonPath('customer.id', $customer->id)
            ->assertJsonStructure(['token', 'customer', 'expires_at']);

        $this->assertIsString($res->json('token'));

        $row = $customer->tokens()->sole();
        $this->assertSame(Customer::IMPERSONATION_TOKEN, $row->name);
        $this->assertTrue($row->can('portal'));
        $this->assertTrue($row->can(Customer::IMPERSONATION_ABILITY));
    }

    public function test_the_token_lasts_an_hour_and_then_stops_working(): void
    {
        $customer = $this->customer();

        $token = $this->mint($customer);

        $expires = $customer->tokens()->sole()->expires_at;
        $this->assertNotNull($expires);
        $this->assertEqualsWithDelta(now()->addHour()->timestamp, $expires->timestamp, 60);

        $this->asBearer($token)
            ->getJson('/api/v1/auth/me')
            ->assertOk();

        $this->travel(Customer::IMPERSONATION_MINUTES + 1)->minutes();

        $this->asBearer($token)
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }

    public function test_a_fresh_press_retires_the_previous_impersonation(): void
    {
        $customer = $this->customer();

        $first = $this->mint($customer);
        $this->asStaff()
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertOk();

        $this->assertSame(1, $customer->tokens()->where('name', Customer::IMPERSONATION_TOKEN)->count());

        $this->asBearer($first)
            ->getJson('/api/v1/auth/me')
            ->assertUnauthorized();
    }

    /* ---------------------------------------------------- what it must not do */

    public function test_the_customers_own_session_survives(): void
    {
        $customer = $this->customer();
        $own = $customer->createToken('portal', ['portal'])->plainTextToken;

        $this->asStaff()
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertOk();

        $this->assertSame(1, $customer->tokens()->where('name', 'portal')->count());

        $this->asBearer($own)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('meta.impersonated', false);
    }

    public function test_it_does_not_forge_a_sign_in(): void
    {
        $customer = $this->customer();

        $this->asStaff()
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertOk();

        $this->assertNull($customer->fresh()->last_login_at);
    }

    public function test_the_token_never_reaches_the_activity_log(): void
    {
        $customer = $this->customer();

        $token = $this->mint($customer);

        $entry = Activity::where('action', 'impersonate')->sole();
        $this->assertSame('customer', $entry->subject_type);
        $this->assertSame($customer->id, $entry->subject_id);
        $this->assertSame($customer->name, $entry->subject_label);
        $this->assertStringNotContainsString($token, json_encode($entry->getAttributes()));
    }

    public function test_ending_the_session_deletes_only_the_impersonation_token(): void
    {
        $customer = $this->customer();
        $customer->createToken('portal', ['portal']);

        $token = $this->mint($customer);

        $this->asBearer($token)
            ->postJson('/api/v1/auth/logout')
            ->assertOk();

        $this->assertSame(0, $customer->tokens()->where('name', Customer::IMPERSONATION_TOKEN)->count());
        $this->assertSame(1, $customer->tokens()->where('name', 'portal')->count());
    }

    public function test_an_impersonation_cannot_change_the_email_address(): void
    {
        $customer = $this->customer();

        $token = $this->mint($customer);

        $this->asBearer($token)
            ->patchJson('/api/v1/auth/profile', ['email' => 'elsewhere@example.test'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        // Everything else is theirs to do: reproducing the problem is the point.
        $this->asBearer($token)
            ->patchJson('/api/v1/auth/profile', ['phone' => '+91 98311 00000'])
            ->assertOk();

        $this->assertSame('neil@meridian-foods.test', $customer->fresh()->email);
    }

    /* --------------------------------------------------------- the portal */

    public function test_the_portal_is_told_which_kind_of_session_it_holds(): void
    {
        $customer = $this->customer();

        $token = $this->mint($customer);

        $this->asBearer($token)
            ->getJson('/api/v1/auth/me')
            ->assertOk()
            ->assertJsonPath('data.id', $customer->id)
            ->assertJsonPath('meta.impersonated', true);
    }

    /* ----------------------------------------------------------- refusals */

    public function test_only_an_active_account_can_be_viewed_as(): void
    {
        foreach ([CustomerStatus::Pending, CustomerStatus::Suspended, CustomerStatus::Rejected] as $status) {
            $customer = $this->customer(['status' => $status, 'email' => "{$status->value}@example.test"]);

            $this->asStaff()
                ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
                ->assertUnprocessable();

            $this->assertSame(0, $customer->tokens()->count());
        }
    }

    public function test_it_is_support_desk_work(): void
    {
        $customer = $this->customer();

        $this->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertUnauthorized();

        $this->asStaff(RoleEnum::ContentManager, 'writer@example.test')
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertForbidden();

        $this->assertSame(0, $customer->tokens()->count());
    }

    /* ------------------------------------------------------------ helpers */

    /**
     * A request carrying a real staff bearer token. `actingAs()` would be
     * simpler and is wrong here: it authenticates every later request in the
     * same test as the staff member, header or no header, so the customer
     * bearer requests below would 403 as "not a customer".
     */
    private function asStaff(RoleEnum $role = RoleEnum::SupportEngineer, string $email = 'engineer@example.test'): static
    {
        return $this->asBearer($this->staff($role, $email)->createToken('admin', ['admin'])->plainTextToken);
    }

    /**
     * The guard object lives for the whole test and keeps the first user it
     * resolved, so a second request under another bearer would still be the
     * first principal — 403 as "not a customer". Forget it between requests.
     */
    private function asBearer(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', "Bearer {$token}");
    }

    private function mint(Customer $customer): string
    {
        return $this->asStaff()
            ->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertOk()
            ->json('token');
    }

    private function customer(array $overrides = []): Customer
    {
        $customer = new Customer;
        $customer->forceFill(array_merge([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => 'password-for-tests',
            'status' => CustomerStatus::Active,
            'email_verified_at' => now(),
        ], $overrides))->save();

        return $customer;
    }

    private function staff(RoleEnum $role = RoleEnum::SupportEngineer, string $email = 'engineer@example.test'): User
    {
        $user = User::firstOrCreate(['email' => $email], [
            'name' => 'Staff',
            'password' => 'password-for-tests',
            'is_active' => true,
        ]);

        $roleRow = Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]);
        $user->roles()->syncWithoutDetaching([$roleRow->id]);

        return $user;
    }
}
