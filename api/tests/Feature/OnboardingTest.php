<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The dashboard's "Getting started" checklist (2026-10-05).
 *
 * Each step is answered from the install's real state: a freshly seeded
 * install has the invented phone number and figures, so those steps are not
 * done; replacing the sample is what turns them green; and only an
 * administrator may ask.
 */
class OnboardingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function staff(RoleEnum $role): User
    {
        $user = User::create([
            'name' => 'Staff', 'email' => 'onboarding-'.uniqid().'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));

        return $user;
    }

    /** @return array<string, bool> */
    private function steps(User $user): array
    {
        $data = $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/onboarding')->assertOk()->json('data');
        $this->assertSame(count($data['steps']), $data['total']);
        foreach ($data['steps'] as $step) {
            $this->assertStringStartsWith('/admin', $step['href'], 'a console path, never a URL');
        }

        return collect($data['steps'])->pluck('done', 'key')->all();
    }

    public function test_a_fresh_install_has_its_placeholders_outstanding(): void
    {
        $steps = $this->steps($this->staff(RoleEnum::Admin));

        $this->assertFalse($steps['logo']);
        $this->assertFalse($steps['contact']);
        $this->assertFalse($steps['figures']);
        $this->assertFalse($steps['look']);
        $this->assertFalse($steps['mail']);
        $this->assertFalse($steps['backups']);
        $this->assertFalse($steps['team'], 'one administrator is not a team');
    }

    public function test_replacing_a_sample_turns_its_step_green(): void
    {
        $admin = $this->staff(RoleEnum::Admin);
        Setting::where('key', 'phone')->update(['value' => '+91 33 4000 1234']);
        Setting::where('key', 'address')->update(['value' => "Altis\nSalt Lake, Kolkata 700091"]);
        Setting::where('key', 'hero_stats')->update(['value' => "12 yrs|In the field\n90+|Clients"]);
        Setting::where('key', 'theme')->update(['value' => 'ocean']);
        Setting::where('key', 'social_x')->update(['value' => 'https://x.com/technoware']);
        Setting::flushCache();
        $this->staff(RoleEnum::SupportEngineer);

        $steps = $this->steps($admin);

        $this->assertTrue($steps['contact']);
        $this->assertTrue($steps['figures']);
        $this->assertTrue($steps['look']);
        $this->assertTrue($steps['team']);
        $this->assertFalse($steps['social'], 'a sample profile still counts against it');
    }

    public function test_only_an_administrator_may_ask(): void
    {
        $this->actingAs($this->staff(RoleEnum::SupportEngineer), 'sanctum')
            ->getJson('/api/v1/admin/onboarding')
            ->assertForbidden();
    }
}
