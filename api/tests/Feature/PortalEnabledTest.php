<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Customer;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Models\VisitRequest;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * `portal_enabled` closes the whole customer portal, at the API.
 *
 * The switch sat on Customers → Portal for months with nothing reading it.
 * Off, every customer-principal endpoint — the public `/auth/*` doors and
 * everything behind the `customer` middleware — answers 403 with
 * `reason: portal_disabled`; a token issued before the switch stops working
 * with it; the console is untouched; and a guest's visit request, which is
 * not a portal sign-in, still goes in.
 *
 * Every authenticated request sends a real `Authorization: Bearer` header,
 * because `actingAs()` stages the authentication and tests the controller
 * rather than the wiring (CLAUDE.md, "Laravel conventions").
 */
class PortalEnabledTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'password-for-tests';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(SettingsSeeder::class);
        $this->travelTo(Carbon::parse('2026-09-28 10:00:00', 'Asia/Kolkata'));
        Notification::fake();
    }

    private function portal(bool $open): void
    {
        Setting::where('key', 'portal_enabled')->firstOrFail()
            ->forceFill(['value' => $open ? '1' : '0'])->save();
    }

    private function customer(): Customer
    {
        $customer = new Customer;
        $customer->forceFill([
            'name' => 'Neil Basu',
            'email' => 'neil@meridian-foods.test',
            'password' => self::PASSWORD,
            'status' => CustomerStatus::Active,
            'email_verified_at' => now(),
        ])->save();

        return $customer;
    }

    private function staff(): User
    {
        $user = User::create([
            'name' => 'Support Engineer', 'email' => 'engineer@example.test',
            'password' => self::PASSWORD, 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::SupportEngineer->value],
            ['name' => RoleEnum::SupportEngineer->label()],
        ));

        return $user;
    }

    /** The guard keeps the first principal it resolved; forget it between bearers. */
    private function asBearer(string $token): static
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', "Bearer {$token}");
    }

    public function test_the_portal_works_while_it_is_switched_on(): void
    {
        $customer = $this->customer();

        $token = $this->postJson('/api/v1/auth/login', ['email' => $customer->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->json('token');

        $this->asBearer($token)->getJson('/api/v1/tickets')->assertOk();
        $this->asBearer($token)->getJson('/api/v1/auth/me')->assertOk();
    }

    public function test_switched_off_every_door_in_answers_403_with_the_reason(): void
    {
        $customer = $this->customer();
        $this->portal(false);

        $refused = fn ($response) => $response
            ->assertStatus(403)
            ->assertJsonPath('reason', 'portal_disabled')
            ->assertJsonMissingPath('token');

        $refused($this->postJson('/api/v1/auth/login', ['email' => $customer->email, 'password' => self::PASSWORD]));
        $refused($this->postJson('/api/v1/auth/request-code', ['email' => $customer->email]));
        $refused($this->postJson('/api/v1/auth/verify-code', ['email' => $customer->email, 'code' => '123456']));
        $refused($this->postJson('/api/v1/auth/register', [
            'name' => 'Asha Rao', 'email' => 'asha@example.test',
            'password' => 'another-long-password-1', 'password_confirmation' => 'another-long-password-1',
        ]));
        $refused($this->postJson('/api/v1/auth/forgot-password', ['email' => $customer->email]));
        $refused($this->postJson('/api/v1/auth/reset-password', [
            'email' => $customer->email, 'token' => 'x', 'password' => 'p', 'password_confirmation' => 'p',
        ]));
        $refused($this->postJson('/api/v1/auth/verify-email', ['email' => $customer->email, 'token' => 'x']));
        $refused($this->postJson('/api/v1/auth/resend-verification', ['email' => $customer->email]));

        // Nothing was sent to anybody on the way to the refusal.
        Notification::assertNothingSent();
    }

    public function test_a_session_issued_before_the_switch_stops_working_with_it(): void
    {
        $customer = $this->customer();
        $token = $customer->createToken('portal', ['portal'], now()->addDays(14))->plainTextToken;

        $this->asBearer($token)->getJson('/api/v1/tickets')->assertOk();

        $this->portal(false);

        foreach (['/api/v1/tickets', '/api/v1/auth/me', '/api/v1/my/orders', '/api/v1/my/visits', '/api/v1/messaging/preferences'] as $path) {
            $this->asBearer($token)->getJson($path)
                ->assertStatus(403)
                ->assertJsonPath('reason', 'portal_disabled');
        }

        // Switched back on, the same token works again: the switch closes a
        // door, it does not end anybody's session for them.
        $this->portal(true);
        $this->asBearer($token)->getJson('/api/v1/tickets')->assertOk();
    }

    public function test_the_console_is_unaffected_and_view_as_is_refused(): void
    {
        $user = $this->staff();
        $customer = $this->customer();
        $this->portal(false);

        $token = $this->postJson('/api/v1/admin/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->json('token');

        $this->asBearer($token)->getJson('/api/v1/admin/tickets')->assertOk();
        $this->asBearer($token)->getJson('/api/v1/admin/customers')->assertOk();

        // "View as" would open a tab onto a portal that refuses the token.
        $this->asBearer($token)->postJson("/api/v1/admin/customers/{$customer->id}/impersonate")
            ->assertStatus(422)
            ->assertJsonMissingPath('token');
        $this->assertSame(0, $customer->tokens()->count());
    }

    public function test_a_guest_visit_request_is_not_a_portal_sign_in_and_still_goes_in(): void
    {
        $this->portal(false);

        $this->postJson('/api/v1/visits', [
            'name' => 'Priya Sharma',
            'email' => 'priya@meridianfoods.test',
            'phone' => '+91 98765 43210',
            'site_address' => ['line1' => '14 Park Street', 'city' => 'Kolkata', 'state' => 'West Bengal', 'pin' => '700016'],
            'preferred' => [['date' => '2026-09-29', 'window' => 'morning']],
        ])->assertCreated();

        $this->assertSame(1, VisitRequest::count());
    }
}
