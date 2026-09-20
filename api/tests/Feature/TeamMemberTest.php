<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\TeamMember;
use App\Models\TeamMemberCertification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The team, and the certifications each member carries.
 *
 * The part that matters is the child list: replaced wholesale on save, so
 * an absent key leaves it alone and `[]` clears it — which has to be
 * possible, or the last one could never be removed. And a lapsed
 * certification leaves the public card while the person stays on it.
 */
class TeamMemberTest extends TestCase
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

    public function test_certifications_are_replaced_wholesale(): void
    {
        $admin = $this->contentManager();

        $id = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/team-members', [
                'name' => 'Priya Nair',
                'certifications' => [
                    ['name' => 'CCNA', 'issuer' => 'Cisco', 'credential_id' => 'ABC123'],
                    ['name' => 'ACMP', 'issuer' => 'HPE Aruba'],
                    // A row somebody left behind: no name, so not a certification.
                    ['name' => '  ', 'issuer' => 'Nobody'],
                ],
            ])
            ->assertCreated()
            ->assertJsonPath('data.certifications.*.name', ['CCNA', 'ACMP'])
            ->assertJsonPath('data.certifications.0.credential_id', 'ABC123')
            ->json('data.id');

        // One row: the other is gone, not kept alongside.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/team-members/{$id}", ['certifications' => [['name' => 'CCNP']]])
            ->assertOk()
            ->assertJsonPath('data.certifications.*.name', ['CCNP']);

        // The key absent: an edit to something else leaves them alone.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/team-members/{$id}", ['designation' => 'Network Engineer'])
            ->assertOk()
            ->assertJsonPath('data.certifications.*.name', ['CCNP']);

        // `[]` clears — the last one can be removed.
        $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/admin/team-members/{$id}", ['certifications' => []])
            ->assertOk()
            ->assertJsonPath('data.certifications', []);

        $this->assertSame(0, TeamMemberCertification::count());
    }

    public function test_an_expired_certification_is_dropped_publicly_but_the_member_stays(): void
    {
        $member = TeamMember::create(['name' => 'Arjun Mehta', 'status' => PublishStatus::Published]);
        $member->certifications()->create(['name' => 'CCNP', 'expires_on' => today()->subDay(), 'sort_order' => 0]);
        $member->certifications()->create(['name' => 'NSE 7', 'expires_on' => today()->addYear(), 'sort_order' => 1]);
        $member->certifications()->create(['name' => 'ACMP', 'sort_order' => 2]);
        TeamMember::create(['name' => 'Draft Person', 'status' => PublishStatus::Draft]);

        $this->getJson('/api/v1/team')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Arjun Mehta')
            ->assertJsonPath('data.0.certifications.*.name', ['NSE 7', 'ACMP']);
    }

    public function test_the_public_resource_never_carries_the_photo_path_or_a_credential_id(): void
    {
        $member = TeamMember::create([
            'name' => 'Arjun Mehta', 'status' => PublishStatus::Published,
            'photo_path' => 'media/arjun.jpg', 'email' => null,
        ]);
        $member->certifications()->create(['name' => 'CCNP', 'credential_id' => 'SECRET-1', 'sort_order' => 0]);

        $row = $this->getJson('/api/v1/team')->assertOk()->json('data.0');

        $this->assertStringEndsWith('/storage/media/arjun.jpg', $row['photo']);
        $this->assertSame('Arjun Mehta', $row['photo_alt']);
        $this->assertNull($row['email']);
        $this->assertArrayNotHasKey('photo_path', $row);
        $this->assertArrayNotHasKey('credential_id', $row['certifications'][0]);
        $this->assertStringNotContainsString('SECRET-1', json_encode($row));
    }

    public function test_a_linkedin_url_must_be_https_on_linkedin(): void
    {
        $admin = $this->contentManager();

        foreach (['http://www.linkedin.com/in/x', 'https://example.com/in/x', 'https://linkedin.com.attacker.test/in/x'] as $bad) {
            $this->actingAs($admin, 'sanctum')
                ->postJson('/api/v1/admin/team-members', ['name' => 'X', 'linkedin_url' => $bad])
                ->assertStatus(422)
                ->assertJsonValidationErrors(['linkedin_url']);
        }

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/team-members', ['name' => 'X', 'linkedin_url' => 'https://www.linkedin.com/in/x'])
            ->assertCreated()
            ->assertJsonPath('data.linkedin_url', 'https://www.linkedin.com/in/x');
    }

    public function test_the_console_is_sent_the_departments_in_use(): void
    {
        TeamMember::create(['name' => 'A', 'department' => 'Support desk']);
        TeamMember::create(['name' => 'B', 'department' => 'Engineering']);
        TeamMember::create(['name' => 'C', 'department' => 'Engineering']);
        TeamMember::create(['name' => 'D']);

        $this->actingAs($this->contentManager(), 'sanctum')
            ->getJson('/api/v1/admin/team-members')
            ->assertOk()
            ->assertJsonPath('meta.departments', ['Engineering', 'Support desk']);
    }

    public function test_deleting_a_member_removes_their_certifications(): void
    {
        $member = TeamMember::create(['name' => 'Gone']);
        $member->certifications()->create(['name' => 'CCNA', 'sort_order' => 0]);

        $this->actingAs($this->contentManager(), 'sanctum')
            ->deleteJson("/api/v1/admin/team-members/{$member->id}")
            ->assertNoContent();

        $this->assertSame(0, TeamMemberCertification::count());
    }
}
