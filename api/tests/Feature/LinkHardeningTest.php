<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\LinkPattern;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Everything an editor types that becomes an `href` or lands in a script is
 * held to a shape.
 *
 * The slider and gallery link fields took any string, so `javascript:` saved
 * on a slide ran for whoever pressed it; the shared path pattern admitted
 * `//evil.example`, which a browser reads as another site; the footer's
 * social profiles were plain strings; and the three analytics ids are
 * interpolated into inline scripts on every public page.
 */
class LinkHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'admin-links@example.test'],
            ['name' => 'Admin', 'password' => 'password-for-tests', 'is_active' => true],
        );

        $user->roles()->sync([Role::firstOrCreate(
            ['slug' => RoleEnum::Admin->value],
            ['name' => RoleEnum::Admin->label()],
        )->id]);

        return $user->load('roles');
    }

    public function test_the_shared_pattern_refuses_script_and_protocol_relative_links(): void
    {
        foreach (['/about', '/', 'https://example.test/x', 'mailto:a@example.test', 'tel:+911234'] as $ok) {
            $this->assertTrue(LinkPattern::allows($ok), $ok);
        }

        foreach (['javascript:alert(1)', '//evil.example', '/\\evil.example', 'data:text/html,x', ' /about'] as $bad) {
            $this->assertFalse(LinkPattern::allows($bad), $bad);
        }
    }

    public function test_a_slide_link_must_be_a_link(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', [
                'name' => 'Hero', 'slug' => 'hero-links',
                'slides' => [['title' => 'One', 'link_url' => 'javascript:alert(document.cookie)']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['slides.0.link_url']);
    }

    public function test_a_gallery_link_must_be_a_link(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/galleries', [
                'name' => 'Work', 'slug' => 'work-links',
                'items' => [['title' => 'One', 'link_url' => 'javascript:alert(1)']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.link_url']);
    }

    public function test_a_menu_link_cannot_be_protocol_relative(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/menus', [
                'name' => 'Main', 'location' => 'primary',
                'items' => [['label' => 'Away', 'type' => 'custom', 'url' => '//evil.example/login']],
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.url']);
    }

    public function test_a_popup_link_cannot_be_protocol_relative(): void
    {
        $this->actingAs($this->admin(), 'sanctum')
            ->postJson('/api/v1/admin/popups', [
                'name' => 'Offer', 'body' => '<p>Hello</p>', 'sections' => ['home'],
                'link_url' => '//evil.example',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['link_url']);
    }

    public function test_a_social_profile_must_be_a_web_address(): void
    {
        Setting::create(['group' => 'social', 'key' => 'social_linkedin', 'value' => null, 'type' => 'string']);

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [
                ['key' => 'social_linkedin', 'value' => 'javascript:alert(1)'],
            ]])
            ->assertStatus(422);

        $this->assertNull(Setting::where('key', 'social_linkedin')->value('value'));

        $this->actingAs($this->admin(), 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [
                ['key' => 'social_linkedin', 'value' => 'https://www.linkedin.com/company/example'],
            ]])
            ->assertOk();
    }

    public function test_analytics_ids_are_held_to_their_published_shapes(): void
    {
        foreach (['google_analytics_id', 'google_tag_manager_id', 'meta_pixel_id'] as $key) {
            Setting::create(['group' => 'analytics', 'key' => $key, 'value' => null, 'type' => 'string']);
        }

        $admin = $this->admin();

        foreach ([
            'google_analytics_id' => "G-ABC');alert(1);//",
            'google_tag_manager_id' => 'GTM-ABC"></script><script>alert(1)</script>',
            'meta_pixel_id' => '123;alert(1)',
        ] as $key => $bad) {
            $this->actingAs($admin, 'sanctum')
                ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => $key, 'value' => $bad]]])
                ->assertStatus(422);
        }

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [
                ['key' => 'google_analytics_id', 'value' => 'G-ABC123XYZ'],
                ['key' => 'google_tag_manager_id', 'value' => 'GTM-5ABC12'],
                ['key' => 'meta_pixel_id', 'value' => '1234567890'],
            ]])
            ->assertOk();
    }
}
