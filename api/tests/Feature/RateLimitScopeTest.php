<?php

namespace Tests\Feature;

use App\Enums\CustomerStatus;
use App\Http\Middleware\ThrottleRequestsPerRoute;
use App\Models\Customer;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Who a rate limit counts, and on what.
 *
 * Three things were wrong at once and each of these tests fails on one of
 * them alone:
 *
 * - Laravel's unnamed `throttle:N,M` keys on the caller and nothing about the
 *   route, so every throttled route on the API was one counter per caller.
 *   `ThrottleRequestsPerRoute` adds the route.
 * - Every public request arrives from the Next server, so "the caller" was
 *   the Next host for every visitor. The Next server now sends the visitor's
 *   address as `X-Forwarded-For`, believed only from `TRUSTED_PROXIES`.
 * - The sign-in throttle is `email|ip`, which with one IP for everybody was
 *   `email` — five wrong passwords from anywhere locked the account for all.
 */
class RateLimitScopeTest extends TestCase
{
    use RefreshDatabase;

    private const PROXY = '127.0.0.1';

    private const OUTSIDER = '198.51.100.9';

    protected function setUp(): void
    {
        parent::setUp();

        config(['trustedproxy.proxies' => self::PROXY]);
    }

    /** A request as the Next server makes it: from the proxy, naming a visitor. */
    private function viaNext(string $visitor): static
    {
        return $this->withServerVariables(['REMOTE_ADDR' => self::PROXY])
            ->withHeader('X-Forwarded-For', $visitor);
    }

    public function test_the_throttle_alias_is_the_per_route_middleware(): void
    {
        $this->assertSame(ThrottleRequestsPerRoute::class, app('router')->getMiddleware()['throttle']);
    }

    /**
     * Thirty basket-less cancel links, then an error report. On one shared
     * counter the report is the 31st hit against a limit of 20 and answers
     * 429; counted per route it is the first.
     */
    public function test_two_routes_do_not_share_a_counter(): void
    {
        $this->viaNext('203.0.113.10');

        for ($i = 0; $i < 30; $i++) {
            $this->getJson('/api/v1/store/stock-notices/nobody/cancel')->assertOk();
        }

        $this->getJson('/api/v1/store/stock-notices/nobody/cancel')->assertStatus(429);

        $this->postJson('/api/v1/client-errors', ['message' => 'boom'])->assertNoContent();
    }

    public function test_each_visitor_forwarded_by_the_trusted_proxy_has_its_own_counter(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->viaNext('203.0.113.20')->postJson('/api/v1/client-errors', ['message' => 'boom'])->assertNoContent();
        }

        $this->viaNext('203.0.113.20')->postJson('/api/v1/client-errors', ['message' => 'boom'])->assertStatus(429);

        // Somebody else, through the same Next server.
        $this->viaNext('203.0.113.21')->postJson('/api/v1/client-errors', ['message' => 'boom'])->assertNoContent();
    }

    /**
     * From an address that is not a trusted proxy, `X-Forwarded-For` is
     * ignored: rotating it does not buy a fresh counter.
     */
    public function test_forwarded_for_from_an_untrusted_address_is_ignored(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => self::OUTSIDER])
                ->withHeader('X-Forwarded-For', "203.0.113.{$i}")
                ->postJson('/api/v1/client-errors', ['message' => 'boom'])
                ->assertNoContent();
        }

        $this->withServerVariables(['REMOTE_ADDR' => self::OUTSIDER])
            ->withHeader('X-Forwarded-For', '203.0.113.99')
            ->postJson('/api/v1/client-errors', ['message' => 'boom'])
            ->assertStatus(429);
    }

    public function test_the_address_the_application_sees(): void
    {
        Route::get('/_test/ip', fn (Request $request) => response()->json(['ip' => $request->ip()]));

        $this->viaNext('203.0.113.30')->getJson('/_test/ip')->assertJson(['ip' => '203.0.113.30']);

        $this->withServerVariables(['REMOTE_ADDR' => self::OUTSIDER])
            ->withHeader('X-Forwarded-For', '203.0.113.31')
            ->getJson('/_test/ip')
            ->assertJson(['ip' => self::OUTSIDER]);
    }

    /**
     * Five wrong passwords lock the address *from that visitor*, not the
     * account: its owner, somewhere else, still signs in.
     */
    public function test_wrong_passwords_from_one_visitor_do_not_lock_the_account_for_another(): void
    {
        $customer = Customer::create([
            'name' => 'Neil Basu', 'email' => 'neil@example.test', 'company' => 'Meridian Foods',
            'password' => 'the-right-password-9', 'status' => CustomerStatus::Active,
        ]);
        $customer->markEmailVerified();
        // Confirming an address retires a password set before it (the
        // pre-registration takeover fix), so the real one is set after.
        $customer->forceFill(['password' => 'the-right-password-9'])->save();

        for ($i = 0; $i < 5; $i++) {
            $this->viaNext('203.0.113.40')
                ->postJson('/api/v1/auth/login', ['email' => 'neil@example.test', 'password' => 'wrong'])
                ->assertStatus(401);
        }

        $this->viaNext('203.0.113.40')
            ->postJson('/api/v1/auth/login', ['email' => 'neil@example.test', 'password' => 'the-right-password-9'])
            ->assertStatus(429);

        $this->viaNext('203.0.113.41')
            ->postJson('/api/v1/auth/login', ['email' => 'neil@example.test', 'password' => 'the-right-password-9'])
            ->assertOk()
            ->assertJsonStructure(['token']);
    }
}
