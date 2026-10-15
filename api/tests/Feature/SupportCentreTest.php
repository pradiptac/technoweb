<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\SupportCentre;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The support network (0.170.0, docs/support-network.md): the console's
 * CRUD under role:admin, the staff tags, and what the public read lets out.
 */
class SupportCentreTest extends TestCase
{
    use RefreshDatabase;

    private function staff(string $email, RoleEnum $role, array $extra = []): User
    {
        $user = User::create($extra + ['name' => ucfirst(strtok($email, '@')), 'email' => $email, 'phone' => '+91 98300 00000',
            'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    private function centre(array $over = []): array
    {
        return $over + [
            'name' => 'Kolkata Service Centre', 'kind' => 'service_centre', 'country_code' => 'in',
            'region' => 'West Bengal', 'city' => 'Kolkata', 'address' => '12 Park Street',
            'phone' => '+91 33 4000 1234', 'email' => 'kolkata@example.in', 'hours' => 'Mon–Sat 9:30–6:30',
            'latitude' => 22.5726, 'longitude' => 88.3639,
        ];
    }

    public function test_an_admin_creates_a_centre_with_tagged_staff(): void
    {
        $admin = $this->staff('admin@technoware.test', RoleEnum::Admin);
        $engineer = $this->staff('eng@technoware.test', RoleEnum::SupportEngineer);
        $hidden = $this->staff('hidden@technoware.test', RoleEnum::SupportEngineer);

        $res = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/support-centres', $this->centre([
            'staff' => [
                ['user_id' => $engineer->id, 'title' => 'Field engineer'],
                ['user_id' => $hidden->id, 'title' => 'Back office', 'is_public' => false],
            ],
        ]))->assertCreated();

        $res->assertJsonPath('data.slug', 'kolkata-service-centre')
            ->assertJsonPath('data.country_code', 'IN')
            ->assertJsonPath('data.country', 'India')
            ->assertJsonPath('data.staff.0.title', 'Field engineer')
            ->assertJsonPath('data.staff.1.is_public', false)
            ->assertJsonPath('meta.kinds.0.value', 'service_centre');
        $this->assertNotEmpty($res->json('meta.countries'));

        // The staff screen lists the centre and filters by it.
        $id = $res->json('data.id');
        $this->getJson('/api/v1/admin/staff?centre='.$id)->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.support_centres.0.name', 'Kolkata Service Centre');
    }

    public function test_staff_are_replaced_wholesale_and_left_alone_when_absent(): void
    {
        $admin = $this->staff('admin@technoware.test', RoleEnum::Admin);
        $a = $this->staff('a@technoware.test', RoleEnum::SupportEngineer);
        $b = $this->staff('b@technoware.test', RoleEnum::SupportEngineer);
        $id = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/support-centres', $this->centre([
            'staff' => [['user_id' => $a->id]],
        ]))->json('data.id');

        $this->patchJson("/api/v1/admin/support-centres/{$id}", ['hours' => 'Mon–Fri'])->assertOk()
            ->assertJsonCount(1, 'data.staff');
        $this->patchJson("/api/v1/admin/support-centres/{$id}", ['staff' => [['user_id' => $b->id]]])->assertOk()
            ->assertJsonCount(1, 'data.staff')->assertJsonPath('data.staff.0.user_id', $b->id);
        $this->patchJson("/api/v1/admin/support-centres/{$id}", ['staff' => []])->assertOk()
            ->assertJsonCount(0, 'data.staff');
    }

    public function test_a_pin_needs_both_coordinates_and_a_known_country(): void
    {
        $admin = $this->staff('admin@technoware.test', RoleEnum::Admin);
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/support-centres', $this->centre(['longitude' => null]))
            ->assertUnprocessable()->assertJsonValidationErrors(['longitude']);
        $this->postJson('/api/v1/admin/support-centres', $this->centre(['latitude' => 120]))
            ->assertUnprocessable()->assertJsonValidationErrors(['latitude']);
        $this->postJson('/api/v1/admin/support-centres', $this->centre(['country_code' => 'ZZ']))
            ->assertUnprocessable()->assertJsonValidationErrors(['country_code']);
        $this->postJson('/api/v1/admin/support-centres', $this->centre(['phone' => 'call us']))
            ->assertUnprocessable()->assertJsonValidationErrors(['phone']);
        // Both cleared is a centre with no pin, and that is allowed.
        $this->postJson('/api/v1/admin/support-centres', $this->centre(['latitude' => null, 'longitude' => null]))
            ->assertCreated();
    }

    public function test_only_an_administrator_may_manage_centres(): void
    {
        foreach ([RoleEnum::ContentManager, RoleEnum::SupportEngineer] as $i => $role) {
            $user = $this->staff("r{$i}@technoware.test", $role);
            $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/support-centres')->assertForbidden();
            $this->postJson('/api/v1/admin/support-centres', $this->centre())->assertForbidden();
        }
    }

    public function test_the_public_read_lets_out_only_active_centres_and_public_staff_by_name(): void
    {
        $shown = $this->staff('shown@technoware.test', RoleEnum::SupportEngineer, ['name' => 'Asha Roy']);
        $hidden = $this->staff('hidden@technoware.test', RoleEnum::SupportEngineer, ['name' => 'Hidden Person']);
        $gone = $this->staff('gone@technoware.test', RoleEnum::SupportEngineer, ['name' => 'Left Company', 'is_active' => false]);

        $live = SupportCentre::create($this->centre(['slug' => 'kolkata', 'country_code' => 'IN']));
        $live->staff()->sync([
            $shown->id => ['title' => 'Engineer', 'is_public' => true],
            $hidden->id => ['title' => 'Desk', 'is_public' => false],
            $gone->id => ['title' => 'Former', 'is_public' => true],
        ]);
        SupportCentre::create($this->centre(['name' => 'Closed', 'slug' => 'closed', 'country_code' => 'IN', 'is_active' => false]));

        $res = $this->getJson('/api/v1/support-centres')->assertOk()->assertJsonCount(1, 'data');
        $res->assertJsonPath('data.0.slug', 'kolkata')
            ->assertJsonPath('data.0.staff.0.name', 'Asha Roy')
            ->assertJsonCount(1, 'data.0.staff')
            ->assertJsonPath('meta.schema.@type', 'ItemList')
            ->assertJsonPath('meta.schema.itemListElement.0.item.@type', 'LocalBusiness');

        $body = $res->getContent();
        $this->assertStringNotContainsString('shown@technoware.test', $body);
        $this->assertStringNotContainsString('98300', $body);
        $this->assertStringNotContainsString('Hidden Person', $body);
        $this->assertStringNotContainsString('Left Company', $body);
        $this->assertArrayNotHasKey('id', $res->json('data.0'));
    }

    public function test_an_empty_network_is_an_empty_list(): void
    {
        $this->getJson('/api/v1/support-centres')->assertOk()->assertExactJson(['data' => [], 'meta' => ['schema' => null]]);
    }
}
