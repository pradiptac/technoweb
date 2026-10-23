<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\ApiKey;
use App\Models\ApiKeyRequest;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** The administrator's API for keys: the key is shown once, and only then. */
class ApiKeyAdminTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $email): User
    {
        $user = User::create([
            'name' => 'Some Staff', 'email' => $email,
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role], ['name' => $role]));

        return $user->load('roles');
    }

    private function admin(): User
    {
        return $this->user('admin', 'ada@example.test');
    }

    private function make(array $attrs = []): ApiKey
    {
        [$plain, $hash] = ApiKey::mint();

        return ApiKey::create($attrs + [
            'name' => 'CRM', 'prefix' => substr($plain, 0, 11), 'key_hash' => $hash, 'scopes' => ['leads:read'],
        ]);
    }

    private function create(User $admin, array $body = []): TestResponse
    {
        return $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/api-keys', $body + [
            'name' => 'CRM', 'scopes' => ['orders:read', 'leads:read', 'orders:read'],
        ]);
    }

    public function test_admin_creates_a_key_and_sees_it_once(): void
    {
        $admin = $this->admin();

        $res = $this->create($admin)->assertCreated()
            ->assertJsonPath('data.name', 'CRM')
            ->assertJsonPath('data.status', 'active')
            ->assertJsonPath('data.allowed_ips', [])
            ->assertJsonPath('data.created_by', 'Some Staff')
            // Duplicates collapsed, in the enum's order.
            ->assertJsonPath('data.scopes', ['leads:read', 'orders:read'])
            ->assertJsonPath('data.scope_labels', ['Read leads', 'Read orders']);

        $plain = $res->json('data.key');
        $this->assertMatchesRegularExpression('/^ak_[A-Za-z0-9]{40}$/', $plain);
        $this->assertSame(substr($plain, 0, 11), $res->json('data.prefix'));
        $this->assertSame(ApiKey::hash($plain), ApiKey::sole()->key_hash);
        $id = $res->json('data.id');

        $show = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/api-keys/{$id}")
            ->assertOk()->assertJsonMissingPath('data.key')->assertJsonMissingPath('data.key_hash')
            ->assertJsonMissingPath('data.requests_30d');
        $index = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/api-keys')
            ->assertOk()->assertJsonMissingPath('data.0.key')->assertJsonMissingPath('data.0.key_hash')
            ->assertJsonPath('data.0.requests_30d', 0)
            ->assertJsonPath('meta.scopes.0.value', 'leads:read');
        $patch = $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/api-keys/{$id}", ['name' => 'CRM live'])
            ->assertOk()->assertJsonPath('data.name', 'CRM live');

        foreach ([$show, $index, $patch] as $r) {
            $this->assertStringNotContainsString($plain, $r->getContent());
            $this->assertStringNotContainsString(ApiKey::hash($plain), $r->getContent());
        }
        $this->assertStringEndsWith('/api/v1/ext', $index->json('meta.base_url'));
    }

    public function test_the_key_never_reaches_the_activity_log(): void
    {
        $admin = $this->admin();
        $plain = $this->create($admin)->json('data.key');
        $id = ApiKey::sole()->id;
        $rolled = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/api-keys/{$id}/roll")->json('data.key');

        $this->assertGreaterThan(0, Activity::count());
        $dump = (string) json_encode(Activity::all()->toArray());
        $this->assertStringNotContainsString($plain, $dump);
        $this->assertStringNotContainsString($rolled, $dump);
    }

    public function test_non_admin_roles_are_refused(): void
    {
        $editor = $this->user('content_manager', 'ed@example.test');

        $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/api-keys')->assertForbidden();
        $this->create($editor)->assertForbidden();
        $this->assertSame(0, ApiKey::count());
    }

    public function test_an_invalid_allowlist_line_is_422_naming_it(): void
    {
        $admin = $this->admin();

        $this->create($admin, ['allowed_ips' => "203.0.113.4\nnot-an-ip, 10.0.0.0/8"])
            ->assertUnprocessable()
            ->assertJsonPath('errors.allowed_ips.0', '“not-an-ip” is not an address or a range.');
        $this->create($admin, ['allowed_ips' => '10.0.0.0/40'])->assertUnprocessable()->assertJsonValidationErrors('allowed_ips');

        $this->create($admin, ['allowed_ips' => "203.0.113.4\n10.0.0.0/8, 2001:db8::/32"])
            ->assertCreated()
            ->assertJsonPath('data.allowed_ips', ['203.0.113.4', '10.0.0.0/8', '2001:db8::/32']);
    }

    public function test_roll_replaces_the_key_and_the_old_one_stops(): void
    {
        $admin = $this->admin();
        $old = $this->create($admin, ['scopes' => ['leads:read']])->json('data.key');
        $id = ApiKey::sole()->id;

        $res = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/api-keys/{$id}/roll")->assertOk();
        $new = $res->json('data.key');
        $this->assertNotSame($old, $new);
        $this->assertSame(substr($new, 0, 11), $res->json('data.prefix'));

        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', 'Bearer '.$old)->getJson('/api/v1/ext/me')->assertStatus(401);
        $this->withHeader('Authorization', 'Bearer '.$new)->getJson('/api/v1/ext/me')->assertOk();
    }

    public function test_a_revoked_key_cannot_be_rolled_or_edited(): void
    {
        $admin = $this->admin();
        $key = $this->make();

        $first = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/api-keys/{$key->id}/revoke")
            ->assertOk()->assertJsonPath('data.status', 'revoked');
        $stamp = $key->fresh()->revoked_at;

        $this->travel(2)->hours();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/api-keys/{$key->id}/revoke")->assertOk();
        $this->assertTrue($stamp->equalTo($key->fresh()->revoked_at), 'the first revoked_at is kept');
        $this->assertNotNull($first->json('data.revoked_at'));

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/api-keys/{$key->id}/roll")
            ->assertUnprocessable();
        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/api-keys/{$key->id}", ['name' => 'Again'])
            ->assertUnprocessable()
            ->assertJsonPath('errors.name.0', 'This key has been revoked. Make a new one instead.');
        $this->assertSame('CRM', $key->fresh()->name);
    }

    public function test_requests_endpoint_counts_thirty_days(): void
    {
        $admin = $this->admin();
        $key = $this->make();
        $other = $this->make(['name' => 'Other']);

        foreach ([[201, now()->subDays(40)], [404, now()->subDays(29)], [200, now()]] as [$status, $when]) {
            ApiKeyRequest::create(['api_key_id' => $key->id, 'method' => 'GET', 'path' => '/ext/leads',
                'status' => $status, 'duration_ms' => 5])->forceFill(['created_at' => $when])->save();
        }
        ApiKeyRequest::create(['api_key_id' => $other->id, 'method' => 'GET', 'path' => '/ext/x',
            'status' => 200, 'duration_ms' => 5]);

        $res = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/api-keys/{$key->id}/requests")
            ->assertOk()->assertJsonCount(3, 'data')->assertJsonPath('data.0.status', 200);

        $counts = $res->json('meta.counts');
        $this->assertCount(30, $counts);
        $this->assertSame(now()->subDays(29)->format('Y-m-d'), $counts[0]['date']);
        $this->assertSame(now()->format('Y-m-d'), $counts[29]['date']);
        $this->assertSame(1, $counts[0]['count']);
        $this->assertSame(1, $counts[29]['count']);
        $this->assertSame(2, array_sum(array_column($counts, 'count')));

        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/api-keys/{$key->id}/requests?status=error")
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 404);
        $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/api-keys/{$key->id}/requests?status=ok")
            ->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/api-keys')
            ->assertJsonPath('data.0.requests_30d', 2);
    }

    public function test_an_unchanged_past_expiry_can_be_saved_but_a_changed_one_must_be_future(): void
    {
        $admin = $this->admin();
        $key = $this->make(['expires_at' => now()->addDay()]);
        $iso = $key->fresh()->expires_at->toIso8601String();
        $this->travel(3)->days();

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/api-keys/{$key->id}", ['name' => 'Renamed', 'expires_at' => $iso])
            ->assertOk()->assertJsonPath('data.name', 'Renamed')->assertJsonPath('data.status', 'expired');
        $this->assertSame('Renamed', $key->fresh()->name);

        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/api-keys/{$key->id}", ['expires_at' => now()->subHour()->toIso8601String()])
            ->assertUnprocessable()->assertJsonValidationErrors('expires_at');
        $this->actingAs($admin, 'sanctum')->patchJson("/api/v1/admin/api-keys/{$key->id}", ['expires_at' => now()->addDay()->toIso8601String()])
            ->assertOk()->assertJsonPath('data.status', 'active');
    }

    public function test_delete_removes_the_key_and_its_log(): void
    {
        $key = $this->make();
        ApiKeyRequest::create(['api_key_id' => $key->id, 'method' => 'GET', 'path' => '/ext/me', 'status' => 200, 'duration_ms' => 1]);

        $this->actingAs($this->admin(), 'sanctum')->deleteJson("/api/v1/admin/api-keys/{$key->id}")->assertNoContent();

        $this->assertSame(0, ApiKey::count());
        $this->assertSame(0, ApiKeyRequest::count());
    }

    public function test_prune_deletes_rows_older_than_thirty_days(): void
    {
        $key = $this->make();
        foreach ([now()->subDays(31), now()->subDays(29)] as $when) {
            ApiKeyRequest::create(['api_key_id' => $key->id, 'method' => 'GET', 'path' => '/ext/me',
                'status' => 200, 'duration_ms' => 1])->forceFill(['created_at' => $when])->save();
        }

        $this->artisan('technoware:prune-api-key-requests')->assertSuccessful();

        $this->assertSame(1, ApiKeyRequest::count());
    }
}
