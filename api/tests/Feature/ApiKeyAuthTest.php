<?php

namespace Tests\Feature;

use App\Models\ApiKey;
use App\Models\ApiKeyRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** The `api.key` middleware and `/ext/me`: what a key may and may not do. */
class ApiKeyAuthTest extends TestCase
{
    use RefreshDatabase;

    /** @return array{0: ApiKey, 1: string} */
    private function makeKey(array $scopes = [], array $attrs = []): array
    {
        [$plain, $hash] = ApiKey::mint();
        $key = ApiKey::create($attrs + [
            'name' => 'Test key', 'prefix' => substr($plain, 0, 11), 'key_hash' => $hash,
            'scopes' => $scopes,
        ]);

        return [$key, $plain];
    }

    private function me(string $plain, string $uri = '/api/v1/ext/me')
    {
        return $this->withHeader('Authorization', 'Bearer '.$plain)->getJson($uri);
    }

    public function test_me_answers_with_a_valid_key(): void
    {
        [$key, $plain] = $this->makeKey(['orders:read']);

        $res = $this->me($plain)->assertOk()
            ->assertJsonPath('data.name', 'Test key')
            ->assertJsonPath('data.prefix', substr($plain, 0, 11))
            ->assertJsonPath('data.scopes', ['orders:read'])
            ->assertJsonPath('data.expires_at', null);

        $this->assertStringNotContainsString('key_hash', $res->getContent());
        $this->assertStringNotContainsString($key->key_hash, $res->getContent());
    }

    public function test_missing_or_unknown_key_is_401_invalid_key(): void
    {
        $this->getJson('/api/v1/ext/me')->assertStatus(401)->assertJsonPath('reason', 'invalid_key');
        $this->me('ak_'.str_repeat('a', 40))->assertStatus(401)->assertJsonPath('reason', 'invalid_key');
        $this->me('nonsense')->assertStatus(401)->assertJsonPath('reason', 'invalid_key');

        [, $plain] = $this->makeKey();
        $this->me($plain."\n")->assertStatus(401)->assertJsonPath('reason', 'invalid_key');
    }

    public function test_key_in_the_query_string_is_not_accepted(): void
    {
        [, $plain] = $this->makeKey();

        $this->getJson('/api/v1/ext/me?key='.$plain)->assertStatus(401);
        $this->getJson('/api/v1/ext/me?api_key='.$plain)->assertStatus(401);
        $this->getJson('/api/v1/ext/me?token='.$plain)->assertStatus(401);
    }

    public function test_a_sanctum_staff_token_is_not_a_key(): void
    {
        $user = User::create([
            'name' => 'Ada', 'email' => 'ada@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);

        $this->me($user->createToken('admin')->plainTextToken)
            ->assertStatus(401)->assertJsonPath('reason', 'invalid_key');
    }

    public function test_revoked_and_expired_keys_are_refused_with_their_reason(): void
    {
        [, $revoked] = $this->makeKey([], ['revoked_at' => now()->subDay()]);
        [, $expired] = $this->makeKey([], ['expires_at' => now()->subMinute()]);
        [, $both] = $this->makeKey([], ['revoked_at' => now()->subDay(), 'expires_at' => now()->subMinute()]);

        $this->me($revoked)->assertStatus(401)->assertJsonPath('reason', 'revoked')
            ->assertJsonPath('message', 'This API key has been revoked.');
        $this->me($expired)->assertStatus(401)->assertJsonPath('reason', 'expired')
            ->assertJsonPath('message', 'This API key has expired.');
        $this->me($both)->assertStatus(401)->assertJsonPath('reason', 'revoked');
    }

    public function test_an_address_outside_the_allowlist_is_403(): void
    {
        [, $outside] = $this->makeKey([], ['allowed_ips' => ['10.0.0.0/8']]);
        [, $inside] = $this->makeKey([], ['allowed_ips' => ['127.0.0.1']]);

        $this->me($outside)->assertStatus(403)->assertJsonPath('reason', 'ip_not_allowed');
        $this->me($inside)->assertOk();
    }

    public function test_a_route_without_the_scope_is_403_naming_it(): void
    {
        Route::middleware(['api', 'api.key:leads:read'])->get('/api/v1/ext/test-leads', fn () => response()->json(['ok' => true]));
        [, $without] = $this->makeKey(['orders:read']);
        [, $with] = $this->makeKey(['leads:read']);

        $this->me($without, '/api/v1/ext/test-leads')->assertStatus(403)
            ->assertJsonPath('reason', 'missing_scope')
            ->assertJsonPath('message', 'This API key does not have the leads:read permission.');
        $this->me($with, '/api/v1/ext/test-leads')->assertOk();
    }

    public function test_an_unknown_scope_on_a_route_is_a_server_error_not_a_403(): void
    {
        Route::middleware(['api', 'api.key:leads:reed'])->get('/api/v1/ext/test-typo', fn () => response()->json(['ok' => true]));
        [, $plain] = $this->makeKey(['leads:read']);

        $this->me($plain, '/api/v1/ext/test-typo')->assertStatus(500);
    }

    public function test_the_121st_request_in_a_minute_is_429(): void
    {
        [, $plain] = $this->makeKey();

        for ($i = 0; $i < 120; $i++) {
            $this->me($plain)->assertOk();
        }
        $res = $this->me($plain)->assertStatus(429)->assertJsonPath('reason', 'rate_limited');
        $this->assertNotNull($res->headers->get('Retry-After'));
        $this->assertStringContainsString('Try again in', $res->json('message'));
    }

    public function test_refused_requests_with_a_recognised_key_count_toward_the_limit(): void
    {
        [, $plain] = $this->makeKey([], ['revoked_at' => now()]);

        for ($i = 0; $i < 120; $i++) {
            $this->me($plain)->assertStatus(401);
        }
        $this->me($plain)->assertStatus(429);
    }

    public function test_every_request_is_logged_with_a_path_but_no_query(): void
    {
        [$key, $plain] = $this->makeKey();
        [$revoked, $revokedPlain] = $this->makeKey([], ['revoked_at' => now()]);

        $this->getJson('/api/v1/ext/me')->assertStatus(401); // withHeader is sticky, so keyless goes first
        $this->me($plain, '/api/v1/ext/me?x=1')->assertOk();
        $this->me($revokedPlain)->assertStatus(401);

        $row = ApiKeyRequest::where('api_key_id', $key->id)->sole();
        $this->assertSame('/api/v1/ext/me', $row->path);
        $this->assertSame('GET', $row->method);
        $this->assertSame(200, $row->status);
        $this->assertSame('127.0.0.1', $row->ip);

        $this->assertSame(401, ApiKeyRequest::where('api_key_id', $revoked->id)->sole()->status);
        $this->assertSame(2, ApiKeyRequest::count()); // an unrecognised key has nobody to log against
    }

    public function test_last_used_is_written_at_most_once_a_minute(): void
    {
        [$key, $plain] = $this->makeKey();
        $this->assertNull($key->last_used_at);

        $this->me($plain)->assertOk();
        $first = $key->fresh()->last_used_at;
        $this->assertNotNull($first);
        $this->assertSame('127.0.0.1', $key->fresh()->last_used_ip);

        $this->travel(30)->seconds();
        $this->me($plain)->assertOk();
        $this->assertTrue($first->equalTo($key->fresh()->last_used_at));

        $this->travel(31)->seconds();
        $this->me($plain)->assertOk();
        $this->assertTrue($key->fresh()->last_used_at->greaterThan($first));
    }
}
