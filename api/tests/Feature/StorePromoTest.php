<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The store's promo band is edited from the Store section of the console by
 * a store manager, through an endpoint that reaches the eight
 * `store_promo_*` rows and nothing else.
 *
 * Settings as a whole are `role:admin` — the SMTP password, the portal
 * toggle, the COD ceiling — and that does not change. What this endpoint
 * adds is a narrow door: a store manager can write a promotion on the shop
 * front without being handed the rest of the table, and the key allowlist is
 * what keeps the door narrow. Reverting the allowlist to "any existing key"
 * fails exactly the test that sends `store_shipping_paise` through it.
 */
class StorePromoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function staff(RoleEnum $role, string $email): User
    {
        $user = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => $role->value],
                ['name' => $role->label()],
            ));
        }

        return $user;
    }

    private function manager(): User
    {
        return $this->staff(RoleEnum::StoreManager, 'promo-manager@example.test');
    }

    private function save(array $pairs, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->manager(), 'sanctum')->patchJson('/api/v1/admin/store/promo', [
            'settings' => collect($pairs)->map(fn ($v, $k) => ['key' => $k, 'value' => $v])->values()->all(),
        ]);
    }

    public function test_the_rows_are_seeded_into_their_own_group_and_published(): void
    {
        $this->assertSame('store_promo', Setting::where('key', 'store_promo_heading')->value('group'));
        $this->assertSame('store', Setting::where('key', 'store_shipping_paise')->value('group'));

        // The public site reads them by key; moving the group must not hide them.
        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('0', $public['store_promo_enabled']);
        $this->assertSame('Shop Now', $public['store_promo_cta_label']);
    }

    public function test_a_store_manager_reads_the_twenty_two_rows_and_no_others(): void
    {
        $rows = $this->actingAs($this->manager(), 'sanctum')
            ->getJson('/api/v1/admin/store/promo')
            ->assertOk()
            ->json('data');

        $keys = array_column($rows, 'key');
        sort($keys);

        $expected = [
            'store_promo_cta_href', 'store_promo_cta_label', 'store_promo_enabled', 'store_promo_heading',
            'store_promo_image_path', 'store_promo_kicker', 'store_promo_price_text', 'store_promo_subheading',
        ];
        foreach ([1, 2] as $n) {
            foreach (['cta_href', 'cta_label', 'enabled', 'heading', 'image_path', 'kicker', 'text'] as $f) {
                $expected[] = "store_tile_{$n}_{$f}";
            }
        }
        sort($expected);

        $this->assertSame($expected, $keys);

        // In the band's order, then tile 1, then tile 2 — the console draws them as they come.
        $this->assertSame('store_promo_enabled', $rows[0]['key']);
        $this->assertSame('store_tile_1_enabled', $rows[8]['key']);
        $this->assertSame('store_tile_2_image_path', $rows[21]['key']);
    }

    public function test_the_tiles_are_held_to_the_bands_rules(): void
    {
        Media::create(['disk' => 'public', 'path' => 'media/tile.jpg', 'filename' => 'tile.jpg', 'mime' => 'image/jpeg', 'size' => 20]);

        $this->save([
            'store_tile_1_enabled' => '1',
            'store_tile_1_kicker' => 'Networking',
            'store_tile_1_heading' => 'Switches from ₹4,990',
            'store_tile_1_text' => 'Managed and unmanaged, in stock.',
            'store_tile_1_cta_label' => 'Shop switches',
            'store_tile_1_cta_href' => '/store/categories/switches',
            'store_tile_1_image_path' => 'media/tile.jpg',
        ])->assertOk();

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('1', $public['store_tile_1_enabled']);
        $this->assertSame('Switches from ₹4,990', $public['store_tile_1_heading']);
        $this->assertStringEndsWith('/storage/media/tile.jpg', $public['store_tile_1_image_url']);
        $this->assertSame('0', $public['store_tile_2_enabled']);

        // The same three checks the band has, by suffix.
        $this->save(['store_tile_2_enabled' => 'on'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_tile_2_cta_href' => 'javascript:alert(1)'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_tile_2_image_path' => 'media/nothing-here.jpg'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_tile_3_heading' => 'No such tile'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.key']);
    }

    public function test_a_store_manager_writes_the_band_and_the_site_reads_it(): void
    {
        Media::create(['disk' => 'public', 'path' => 'media/laptop.jpg', 'filename' => 'laptop.jpg', 'mime' => 'image/jpeg', 'size' => 20]);

        $this->save([
            'store_promo_enabled' => '1',
            'store_promo_kicker' => 'Business laptops, in stock',
            'store_promo_heading' => 'Save up to 15%',
            'store_promo_price_text' => 'From ₹58,990',
            'store_promo_subheading' => 'Lenovo and HP machines.',
            'store_promo_cta_label' => 'Shop laptops',
            'store_promo_cta_href' => '/store/categories/laptops-workstations',
            'store_promo_image_path' => 'media/laptop.jpg',
        ])->assertOk();

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');
        $this->assertSame('1', $public['store_promo_enabled']);
        $this->assertSame('Save up to 15%', $public['store_promo_heading']);
        $this->assertSame('/store/categories/laptops-workstations', $public['store_promo_cta_href']);
        // The `_path` → `_url` rule reaches a row whatever group it is in.
        $this->assertStringEndsWith('/storage/media/laptop.jpg', $public['store_promo_image_url']);

        // A read after the write carries the resolved URL for the picker.
        $row = collect($this->actingAs($this->manager(), 'sanctum')->getJson('/api/v1/admin/store/promo')->json('data'))
            ->firstWhere('key', 'store_promo_image_path');
        $this->assertStringEndsWith('/storage/media/laptop.jpg', $row['url']);
    }

    public function test_a_key_outside_the_band_is_refused_not_ignored(): void
    {
        $before = Setting::where('key', 'store_shipping_paise')->value('value');

        $this->save(['store_promo_heading' => 'Fine', 'store_shipping_paise' => '0'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['settings.1.key']);

        $this->assertSame($before, Setting::where('key', 'store_shipping_paise')->value('value'));
        $this->assertNull(Setting::where('key', 'store_promo_heading')->value('value'), 'A refused request saves nothing.');
    }

    public function test_the_switch_the_link_and_the_picture_are_checked(): void
    {
        $this->save(['store_promo_enabled' => 'yes'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_promo_cta_href' => 'javascript:alert(1)'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
        $this->save(['store_promo_cta_href' => 'https://example.test/deal'])->assertOk();
        $this->save(['store_promo_image_path' => 'media/nothing-here.jpg'])->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);

        // Blank clears the picture — the band then renders without one.
        $this->save(['store_promo_image_path' => ''])->assertOk();
        $this->assertNull(Setting::where('key', 'store_promo_image_path')->value('value'));
    }

    public function test_other_roles_are_refused(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, 'promo-editor@example.test');

        $this->actingAs($editor, 'sanctum')->getJson('/api/v1/admin/store/promo')->assertForbidden();
        $this->save(['store_promo_heading' => 'Nope'], $editor)->assertForbidden();

        // An administrator passes every role check, and can still write the
        // same keys through the general settings endpoint.
        $admin = $this->staff(RoleEnum::Admin, 'promo-admin@example.test');
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/store/promo')->assertOk();
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', [
            'settings' => [['key' => 'store_promo_heading', 'value' => 'From the settings screen']],
        ])->assertOk();
        $this->assertSame('From the settings screen', Setting::where('key', 'store_promo_heading')->value('value'));
    }
}
