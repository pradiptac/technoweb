<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Client;
use App\Models\Industry;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The client logo wall.
 *
 * Two things worth pinning: the website is an outbound `href` on a public
 * page and must be http(s) or nothing, and the industry is a reference to a
 * taxonomy row that can be deleted from another screen — the client stays.
 */
class ClientTest extends TestCase
{
    use RefreshDatabase;

    private function contentManager(): User
    {
        $user = User::create([
            'name' => 'Content', 'email' => 'content@technoware.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value],
            ['name' => RoleEnum::ContentManager->label()],
        ));

        return $user;
    }

    public function test_the_public_endpoint_hides_drafts_and_keeps_the_order(): void
    {
        Client::create(['name' => 'Second', 'status' => PublishStatus::Published, 'sort_order' => 2]);
        Client::create(['name' => 'First', 'status' => PublishStatus::Published, 'sort_order' => 1]);
        Client::create(['name' => 'Draft', 'status' => PublishStatus::Draft]);

        $this->getJson('/api/v1/clients')
            ->assertOk()
            ->assertJsonPath('data.*.name', ['First', 'Second']);
    }

    public function test_a_javascript_website_cannot_be_stored_and_https_can(): void
    {
        $admin = $this->contentManager();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/clients', ['name' => 'Acme', 'website_url' => 'javascript:alert(1)'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['website_url']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/clients', ['name' => 'Acme', 'website_url' => '/not-absolute'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['website_url']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/clients', ['name' => 'Acme', 'website_url' => 'https://acme.example'])
            ->assertCreated()
            ->assertJsonPath('data.website_url', 'https://acme.example')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.is_featured', false);
    }

    public function test_the_industry_rides_along_and_survives_its_deletion(): void
    {
        $industry = Industry::create(['name' => 'Healthcare', 'slug' => 'healthcare', 'summary' => 'Clinics', 'sort_order' => 1]);
        Client::create(['name' => 'Harbour Dental', 'status' => PublishStatus::Published, 'industry_id' => $industry->id]);

        $this->getJson('/api/v1/clients')
            ->assertOk()
            ->assertJsonPath('data.0.industry.slug', 'healthcare');

        $industry->delete();

        $this->getJson('/api/v1/clients')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Harbour Dental')
            ->assertJsonPath('data.0.industry', null);
    }

    public function test_the_public_resource_never_carries_the_logo_path(): void
    {
        Client::create(['name' => 'Acme', 'status' => PublishStatus::Published, 'logo_path' => 'media/acme.svg']);

        $row = $this->getJson('/api/v1/clients')->assertOk()->json('data.0');

        $this->assertStringEndsWith('/storage/media/acme.svg', $row['logo']);
        $this->assertSame('Acme', $row['logo_alt']);
        $this->assertArrayNotHasKey('logo_path', $row);
        $this->assertArrayNotHasKey('status', $row);
    }
}
