<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * A Google icon is stored as `ms:<name>` beside the site's own icon names
 * (0.179.0, docs/icons.md). The shape is checked here; whether the name is in
 * the set is the website's to know, the way an `iconMap` key always was.
 */
class IconKeyTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $u = User::firstOrCreate(['email' => 'icons@example.test'], ['name' => 'Ed', 'password' => 'password-for-tests', 'is_active' => true]);
        $u->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id]);

        return $u;
    }

    private function solution(string $icon)
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/solutions', [
            'title' => 'Wi-Fi '.uniqid(), 'status' => 'draft', 'icon' => $icon,
        ]);
    }

    public function test_a_google_icon_and_a_site_icon_are_accepted(): void
    {
        $this->solution('ms:router')->assertCreated()->assertJsonPath('data.icon', 'ms:router');
        $this->solution('shield')->assertCreated();
    }

    public function test_a_malformed_key_is_refused(): void
    {
        $this->solution('ms:Router!')->assertUnprocessable()->assertJsonValidationErrors('icon');
        $this->solution('ms:'.str_repeat('a', 38))->assertUnprocessable()->assertJsonValidationErrors('icon');
        $this->solution('ms:')->assertUnprocessable()->assertJsonValidationErrors('icon');
    }

    public function test_a_builder_feature_takes_a_google_icon(): void
    {
        $block = fn (string $icon) => ['blocks' => [[
            'id' => '0b9a2d4e-1c3f-4a5b-8c6d-7e8f9a0b1c2d', 'type' => 'features', 'hidden' => false,
            'data' => ['heading' => 'Why', 'items' => [['icon' => $icon, 'title' => 'Fast', 'body' => 'It is.']]],
        ]]];

        $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/pages/preview', $block('ms:router'))->assertOk();
        $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/pages/preview', $block('ms:Router!'))->assertUnprocessable();
    }

    public function test_a_menu_item_takes_a_google_icon(): void
    {
        $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/menus', [
            'name' => 'Main', 'location' => 'primary',
            'items' => [['label' => 'Home', 'type' => 'custom', 'url' => '/', 'icon' => 'ms:home']],
        ])->assertCreated();
    }
}
