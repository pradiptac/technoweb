<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\BlogPost;
use App\Models\Media;
use App\Models\Product;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\MediaMeta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The focal point of an image — `media.focal_x` / `media.focal_y`, set on the
 * file and read by every resource that publishes a picture the site crops.
 *
 * Pins four things. The pair is stored and validated together (one number
 * without the other is a 422 naming the missing one, out of range is a 422,
 * both null clears it). A public resource carries `*_focus` beside its
 * `*_alt`, formatted `"30% 20%"` for a path whose file has a point and null
 * for one that has not — null, never a centre string, so the frontend can
 * tell "unset" from "chosen". `MediaMeta::focus` answers null for a path with
 * no row at all, and its alt half still answers what `MediaAlt` did. And the
 * public settings' derived map adds `<prefix>_focus` beside `_url`, so a
 * banner and the logo carry their point the way they carry their size.
 */
class FocalPointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        MediaMeta::forget();
    }

    private function staff(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(
            ['email' => $role->value.'@example.test'],
            ['name' => 'Mia', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if (! $user->roles()->count()) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $user;
    }

    private function file(array $attributes = []): Media
    {
        return Media::create(array_merge([
            'disk' => 'public',
            'path' => 'media/2026/09/'.uniqid().'.jpg',
            'filename' => 'example.jpg',
            'mime' => 'image/jpeg',
            'size' => 1024,
        ], $attributes));
    }

    private function edit(Media $media, array $body)
    {
        return $this->actingAs($this->staff(), 'sanctum')->patchJson("/api/v1/admin/media/{$media->id}", $body);
    }

    public function test_the_pair_is_stored_and_emitted_together(): void
    {
        $media = $this->file();

        $this->edit($media, ['focal_x' => 30, 'focal_y' => 20])
            ->assertOk()
            ->assertJsonPath('data.focal_x', 30)
            ->assertJsonPath('data.focal_y', 20);

        $this->assertSame([30, 20], [$media->fresh()->focal_x, $media->fresh()->focal_y]);

        // Both null clears it: the "Reset to centre" button.
        $this->edit($media, ['focal_x' => null, 'focal_y' => null])
            ->assertOk()
            ->assertJsonPath('data.focal_x', null)
            ->assertJsonPath('data.focal_y', null);

        $this->assertNull($media->fresh()->focal_x);
    }

    public function test_a_lone_value_is_refused_naming_the_missing_one(): void
    {
        $media = $this->file();

        $this->edit($media, ['focal_x' => 30])->assertStatus(422)->assertJsonValidationErrors(['focal_y']);
        $this->edit($media, ['focal_y' => 30])->assertStatus(422)->assertJsonValidationErrors(['focal_x']);
        $this->edit($media, ['focal_x' => 30, 'focal_y' => null])->assertStatus(422)->assertJsonValidationErrors(['focal_y']);

        $this->assertNull($media->fresh()->focal_x, 'a refused pair writes nothing');
    }

    public function test_out_of_range_is_refused(): void
    {
        $media = $this->file();

        $this->edit($media, ['focal_x' => 101, 'focal_y' => 50])->assertStatus(422)->assertJsonValidationErrors(['focal_x']);
        $this->edit($media, ['focal_x' => 50, 'focal_y' => -1])->assertStatus(422)->assertJsonValidationErrors(['focal_y']);
        $this->edit($media, ['focal_x' => 'left', 'focal_y' => 50])->assertStatus(422)->assertJsonValidationErrors(['focal_x']);
    }

    public function test_an_unrelated_edit_leaves_the_point_alone(): void
    {
        $media = $this->file(['focal_x' => 30, 'focal_y' => 20]);

        $this->edit($media, ['alt_text' => 'A switch'])->assertOk()->assertJsonPath('data.focal_x', 30);
    }

    public function test_a_public_resource_carries_the_focus_beside_the_alt(): void
    {
        $this->file(['path' => 'media/2026/09/cover.jpg', 'alt_text' => 'A rack', 'focal_x' => 30, 'focal_y' => 20]);
        $this->file(['path' => 'media/2026/09/plain.jpg', 'alt_text' => 'Plain']);

        $focused = BlogPost::create([
            'title' => 'Focused', 'slug' => 'focused', 'excerpt' => 'x', 'body' => '<p>x</p>',
            'status' => 'published', 'published_at' => now()->subDay(), 'cover_image_path' => 'media/2026/09/cover.jpg',
        ]);
        $plain = BlogPost::create([
            'title' => 'Plain', 'slug' => 'plain', 'excerpt' => 'x', 'body' => '<p>x</p>',
            'status' => 'published', 'published_at' => now()->subDay(), 'cover_image_path' => 'media/2026/09/plain.jpg',
        ]);

        $this->getJson("/api/v1/blog/{$focused->slug}")
            ->assertOk()
            ->assertJsonPath('data.cover_image_alt', 'A rack')
            ->assertJsonPath('data.cover_image_focus', '30% 20%');

        $this->getJson("/api/v1/blog/{$plain->slug}")
            ->assertOk()
            ->assertJsonPath('data.cover_image_alt', 'Plain')
            ->assertJsonPath('data.cover_image_focus', null);
    }

    public function test_an_image_array_carries_a_parallel_focus_array(): void
    {
        $this->file(['path' => 'media/2026/09/front.jpg', 'focal_x' => 50, 'focal_y' => 10]);

        $product = Product::create([
            'name' => 'Switch', 'slug' => 'switch', 'sku' => 'SW-1', 'status' => 'published',
            'images' => ['media/2026/09/front.jpg', 'media/2026/09/nobody.jpg'],
        ]);

        $data = $this->getJson("/api/v1/products/{$product->slug}")->assertOk()->json('data');

        $this->assertCount(2, $data['image_alts']);
        $this->assertSame(['50% 10%', null], $data['image_focuses']);
    }

    public function test_media_meta_answers_null_for_a_path_without_a_row_and_alt_without_a_point(): void
    {
        $this->file(['path' => 'media/2026/09/alt-only.jpg', 'alt_text' => 'Only alt']);
        $this->file(['path' => 'media/2026/09/point-only.jpg', 'focal_x' => 0, 'focal_y' => 100]);

        $this->assertNull(MediaMeta::focus('media/2026/09/nobody.jpg'));
        $this->assertNull(MediaMeta::alt('media/2026/09/nobody.jpg'));
        $this->assertNull(MediaMeta::focus(null));

        $this->assertSame('Only alt', MediaMeta::alt('media/2026/09/alt-only.jpg'));
        $this->assertNull(MediaMeta::focus('media/2026/09/alt-only.jpg'));

        // A row with a point and no alt is in the map: the old query kept only rows with alt text.
        $this->assertNull(MediaMeta::alt('media/2026/09/point-only.jpg'));
        $this->assertSame('0% 100%', MediaMeta::focus('media/2026/09/point-only.jpg'));

        $this->assertSame(['Only alt', null], MediaMeta::alts(['media/2026/09/alt-only.jpg', 'media/2026/09/nobody.jpg']));
        $this->assertSame([null, '0% 100%'], MediaMeta::focuses(['media/2026/09/alt-only.jpg', 'media/2026/09/point-only.jpg']));
        $this->assertSame([], MediaMeta::focuses(null));
    }

    public function test_the_public_settings_carry_a_focus_for_every_path_that_has_one(): void
    {
        $this->file(['path' => 'media/2026/09/logo.svg', 'mime' => 'image/svg+xml', 'width' => 600, 'height' => 81, 'focal_x' => 10, 'focal_y' => 90]);
        $this->file(['path' => 'media/2026/09/banner.jpg', 'width' => 2400, 'height' => 900]);

        Setting::updateOrCreate(['key' => 'logo_path'], ['group' => 'general', 'value' => 'media/2026/09/logo.svg', 'type' => 'string']);
        Setting::updateOrCreate(['key' => 'banner_default_path'], ['group' => 'banners', 'value' => 'media/2026/09/banner.jpg', 'type' => 'string']);
        Setting::flushCache();

        $public = $this->getJson('/api/v1/settings')->assertOk()->json('data');

        $this->assertSame('10% 90%', $public['logo_focus']);
        $this->assertSame('600', $public['logo_width']);
        $this->assertArrayHasKey('banner_default_url', $public);
        $this->assertArrayNotHasKey('banner_default_focus', $public, 'no point chosen means no key, like a missing size');
    }
}
