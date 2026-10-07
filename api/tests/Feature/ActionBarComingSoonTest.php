<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The phone's action bar and the coming-soon page (0.122.0,
 * docs/site-chrome.md).
 *
 * Both are public groups, both are off until somebody asks for them, and the
 * proxy learns the coming-soon switch from the redirect table's `meta` — the
 * one read it already makes.
 */
class ActionBarComingSoonTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function save(array $pairs)
    {
        $user = User::create([
            'name' => 'Admin', 'email' => 'bar-admin-'.uniqid().'@example.test',
            'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->attach(Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()],
        ));

        return $this->actingAs($user, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_both_are_public_and_off_by_default(): void
    {
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('0', (string) $public['action_bar_enabled']);
        $this->assertSame('/contact', $public['action_bar_enquire_href']);
        $this->assertSame('0', (string) $public['coming_soon_enabled']);
        $this->assertSame('We are getting ready', $public['coming_soon_heading']);
        $this->assertArrayNotHasKey('action_bar_whatsapp_number', $public);

        $this->assertFalse($this->getJson('/api/v1/redirects')->assertOk()->json('meta.coming_soon'));
    }

    public function test_the_switch_reaches_the_redirect_table_the_proxy_reads(): void
    {
        $this->save(['coming_soon_enabled' => '1'])->assertOk();

        $this->assertTrue($this->getJson('/api/v1/redirects')->json('meta.coming_soon'));
        $this->assertSame('1', (string) $this->getJson('/api/v1/settings')->json('data.coming_soon_enabled'));
    }

    public function test_a_whatsapp_number_is_stored_as_digits_and_a_short_one_refused(): void
    {
        $this->save(['action_bar_whatsapp_number' => '+91 98765-43210'])->assertOk();
        $this->assertSame('919876543210', $this->getJson('/api/v1/settings')->json('data.action_bar_whatsapp_number'));

        $this->save(['action_bar_whatsapp_number' => '12345'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('settings.0.value');
    }

    public function test_the_enquiry_link_is_held_to_the_shape_of_a_link(): void
    {
        $this->save(['action_bar_enquire_href' => 'javascript:alert(1)'])->assertStatus(422);
        $this->save(['action_bar_enquire_href' => '//evil.example'])->assertStatus(422);
        $this->save(['action_bar_enquire_href' => '/book-a-visit'])->assertOk();
        $this->save(['action_bar_enquire_label' => 'Ask for a detailed quote'])->assertStatus(422);
    }

    public function test_the_coming_soon_message_is_cleaned_on_write(): void
    {
        $this->save(['coming_soon_message' => '<p>Back <strong>soon</strong>.</p><script>alert(1)</script>'])->assertOk();

        $message = $this->getJson('/api/v1/settings')->json('data.coming_soon_message');
        $this->assertStringContainsString('<strong>soon</strong>', $message);
        $this->assertStringNotContainsString('script', $message);
    }
}
