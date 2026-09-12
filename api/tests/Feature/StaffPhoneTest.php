<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A staff account carries a mobile number, and the rule is the API's.
 *
 * The form marks the field required and the form is not the boundary. What
 * this pins: a new account without a number is refused, an edit that blanks
 * the number is refused, and an edit that does not mention it — the list's
 * activate/deactivate, a role change — is not made to backfill a row that
 * predates the column.
 */
class StaffPhoneTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'staff-phone-admin@example.test'],
            ['name' => 'Administrator', 'password' => 'password-for-tests', 'is_active' => true, 'phone' => '+91 98765 00000'],
        );
        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::Admin->value],
                ['name' => RoleEnum::Admin->label()],
            ));
        }

        return $user;
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'New Engineer',
            'email' => 'engineer@example.test',
            'phone' => '+91 98765 11111',
            'roles' => [RoleEnum::SupportEngineer->value],
        ], $overrides);
    }

    public function test_a_new_account_needs_a_phone_number(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/staff', $this->payload(['phone' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/staff', $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('data.phone', '+91 98765 11111');
    }

    public function test_an_edit_cannot_blank_the_number(): void
    {
        $user = User::create(['name' => 'Old Hand', 'email' => 'old@example.test', 'password' => 'password-for-tests', 'is_active' => true, 'phone' => '+91 98765 22222']);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/staff/{$user->id}", ['phone' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['phone']);

        $this->assertSame('+91 98765 22222', $user->fresh()->phone);
    }

    public function test_an_edit_that_does_not_mention_the_number_is_not_made_to_backfill_it(): void
    {
        // A row from before the column existed: no number at all.
        $user = User::create(['name' => 'Legacy', 'email' => 'legacy@example.test', 'password' => 'password-for-tests', 'is_active' => true]);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson("/api/v1/admin/staff/{$user->id}", ['is_active' => false])
            ->assertOk();

        $this->assertFalse((bool) $user->fresh()->is_active);
    }

    public function test_the_signed_in_staff_read_carries_the_number(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->getJson('/api/v1/admin/auth/me')
            ->assertOk()
            ->assertJsonPath('data.phone', '+91 98765 00000');
    }
}
