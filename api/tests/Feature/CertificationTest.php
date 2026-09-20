<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Certification;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The company's certifications.
 *
 * The rule worth defending: **a lapsed certificate is not on the public
 * page.** An ISO badge past its validity is a claim that is no longer true,
 * and the console has to keep showing it — flagged — so somebody renews it.
 */
class CertificationTest extends TestCase
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

    public function test_the_public_endpoint_hides_drafts_and_expired_and_keeps_the_order(): void
    {
        Certification::create(['name' => 'Second', 'status' => PublishStatus::Published, 'sort_order' => 2]);
        Certification::create(['name' => 'First', 'status' => PublishStatus::Published, 'sort_order' => 1]);
        Certification::create(['name' => 'Draft', 'status' => PublishStatus::Draft, 'sort_order' => 0]);
        Certification::create(['name' => 'Lapsed', 'status' => PublishStatus::Published, 'sort_order' => 0, 'valid_until' => today()->subDay()]);
        Certification::create(['name' => 'Today', 'status' => PublishStatus::Published, 'sort_order' => 3, 'valid_until' => today()]);

        $this->getJson('/api/v1/certifications')
            ->assertOk()
            ->assertJsonPath('data.*.name', ['First', 'Second', 'Today']);
    }

    public function test_the_public_resource_carries_urls_and_never_paths(): void
    {
        Certification::create([
            'name' => 'ISO 9001', 'status' => PublishStatus::Published,
            'image_path' => 'media/badge.svg', 'file_path' => 'media/cert.pdf',
        ]);

        $row = $this->getJson('/api/v1/certifications')->assertOk()->json('data.0');

        $this->assertStringEndsWith('/storage/media/badge.svg', $row['image']);
        $this->assertStringEndsWith('/storage/media/cert.pdf', $row['file']);
        $this->assertSame('ISO 9001', $row['image_alt']);
        $this->assertArrayNotHasKey('image_path', $row);
        $this->assertArrayNotHasKey('file_path', $row);
        $this->assertArrayNotHasKey('status', $row);
    }

    public function test_a_created_certification_comes_back_wrapped_with_its_defaults(): void
    {
        $this->actingAs($this->contentManager(), 'sanctum')
            ->postJson('/api/v1/admin/certifications', ['name' => 'MSME Udyam'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'MSME Udyam')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.sort_order', 0)
            ->assertJsonPath('data.is_expired', false);
    }

    public function test_a_pdf_the_library_does_not_know_is_refused(): void
    {
        $admin = $this->contentManager();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/certifications', ['name' => 'ISO', 'file_path' => 'media/nowhere.pdf'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['file_path']);

        Media::create(['filename' => 'iso.pdf', 'path' => 'media/iso.pdf', 'mime' => 'application/pdf', 'size' => 10, 'disk' => 'public']);
        Media::create(['filename' => 'iso.png', 'path' => 'media/iso.png', 'mime' => 'image/png', 'size' => 10, 'disk' => 'public']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/certifications', ['name' => 'ISO', 'file_path' => 'media/iso.png'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['file_path']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/certifications', ['name' => 'ISO', 'file_path' => 'media/iso.pdf'])
            ->assertCreated()
            ->assertJsonPath('data.file_path', 'media/iso.pdf');
    }

    public function test_a_validity_ending_before_issue_is_refused_on_either_write(): void
    {
        $admin = $this->contentManager();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/certifications', ['name' => 'ISO', 'issued_on' => '2026-01-10', 'valid_until' => '2025-01-10'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['valid_until']);

        $cert = Certification::create(['name' => 'ISO', 'issued_on' => '2026-01-10']);

        // A PATCH sending only the end: the start comes from the record.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/certifications/{$cert->id}", ['valid_until' => '2025-06-01'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['valid_until']);

        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/certifications/{$cert->id}", ['valid_until' => '2029-06-01'])
            ->assertOk()
            ->assertJsonPath('data.valid_until', '2029-06-01');
    }

    public function test_the_console_sees_expired_rows_flagged_and_still_listed(): void
    {
        Certification::create(['name' => 'Lapsed', 'status' => PublishStatus::Published, 'valid_until' => today()->subDay()]);

        $this->actingAs($this->contentManager(), 'sanctum')
            ->getJson('/api/v1/admin/certifications')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.is_expired', true);
    }

    public function test_a_store_manager_cannot_reach_it(): void
    {
        $user = User::create(['name' => 'Shop', 'email' => 'shop@technoware.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::StoreManager->value], ['name' => RoleEnum::StoreManager->label()]));

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/certifications')->assertStatus(403);
    }
}
