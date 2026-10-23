<?php

namespace Tests\Unit;

use App\Enums\ApiScope;
use App\Models\ApiKey;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiKeyTest extends TestCase
{
    use RefreshDatabase;

    private function make(array $attrs = []): ApiKey
    {
        [$plain, $hash] = ApiKey::mint();

        return ApiKey::create($attrs + [
            'name' => 'Test',
            'prefix' => substr($plain, 0, 11),
            'key_hash' => $hash,
            'scopes' => [ApiScope::LeadsRead->value],
        ]);
    }

    public function test_mint_returns_a_key_of_the_documented_shape(): void
    {
        [$plain, $hash] = ApiKey::mint();

        $this->assertMatchesRegularExpression('/^ak_[A-Za-z0-9]{40}$/', $plain);
        $this->assertSame(hash('sha256', $plain), $hash);
        $this->assertSame($hash, ApiKey::hash($plain));
    }

    public function test_find_by_plain_matches_only_the_exact_key(): void
    {
        [$plain, $hash] = ApiKey::mint();
        $key = ApiKey::create([
            'name' => 'Test', 'prefix' => substr($plain, 0, 11), 'key_hash' => $hash, 'scopes' => [],
        ]);

        $this->assertSame($key->id, ApiKey::findByPlain($plain)?->id);

        $last = substr($plain, -1);
        $changed = substr($plain, 0, -1).($last === 'a' ? 'b' : 'a');
        $this->assertNull(ApiKey::findByPlain($changed));
        $this->assertNull(ApiKey::findByPlain('ak_short'));
    }

    public function test_status_orders_revoked_before_expired(): void
    {
        $both = $this->make(['revoked_at' => now()->subDay(), 'expires_at' => now()->subHour()]);
        $expired = $this->make(['expires_at' => now()->subHour()]);
        $future = $this->make(['expires_at' => now()->addDay()]);

        $this->assertSame('revoked', $both->status());
        $this->assertSame('expired', $expired->status());
        $this->assertTrue($expired->isExpired());
        $this->assertSame('active', $future->status());
    }

    public function test_allows_ip_with_and_without_a_list(): void
    {
        $open = $this->make();
        $this->assertTrue($open->allowsIp('203.0.113.9'));
        $this->assertTrue($open->allowsIp(null));

        $listed = $this->make(['allowed_ips' => ['10.0.0.0/8']]);
        $this->assertTrue($listed->allowsIp('10.1.2.3'));
        $this->assertFalse($listed->allowsIp('11.0.0.1'));
        $this->assertFalse($listed->allowsIp(null));
    }

    public function test_allows_checks_scopes(): void
    {
        $key = $this->make(['scopes' => ['leads:read']]);

        $this->assertTrue($key->allows(ApiScope::LeadsRead));
        $this->assertTrue($key->allows('leads:read'));
        $this->assertFalse($key->allows(ApiScope::LeadsWrite));
    }

    public function test_scope_options_list_every_case(): void
    {
        $options = ApiScope::options();

        $this->assertCount(count(ApiScope::cases()), $options);
        $this->assertSame(ApiScope::values(), array_column($options, 'value'));
        $this->assertContains('stock:write', ApiScope::values());
        foreach ($options as $o) {
            $this->assertNotSame('', $o['label']);
            $this->assertNotSame('', $o['blurb']);
        }
    }
}
