<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The hero slider features (0.191.0): the columns, their rules and how they read back. */
class SliderHeroFeaturesTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $user = User::firstOrCreate(
            ['email' => 'ed-hero@example.test'],
            ['name' => 'Hero Tester', 'password' => 'password-for-tests', 'is_active' => true],
        );
        if (! $user->roles()->count()) {
            $user->roles()->attach(Role::firstOrCreate(
                ['slug' => RoleEnum::ContentManager->value],
                ['name' => RoleEnum::ContentManager->label()],
            ));
        }

        return $user;
    }

    private function media(string $path, string $mime = 'image/jpeg'): Media
    {
        return Media::create(['disk' => 'public', 'path' => $path, 'filename' => basename($path), 'mime' => $mime, 'size' => 10]);
    }

    private function payload(array $slide = [], array $slider = []): array
    {
        return array_merge([
            'name' => 'Homepage hero',
            'status' => 'published',
            'slides' => [array_merge(['kind' => 'image', 'media_path' => 'media/a.jpg', 'heading' => 'One'], $slide)],
        ], $slider);
    }

    private function make(array $slide = [], array $slider = [])
    {
        return $this->actingAs($this->editor(), 'sanctum')
            ->postJson('/api/v1/admin/sliders', $this->payload($slide, $slider));
    }

    public function test_an_untouched_slider_carries_the_defaults(): void
    {
        $this->make()->assertCreated()
            ->assertJsonPath('data.media_effect', 'none')
            ->assertJsonPath('data.navigation', 'dots')
            ->assertJsonPath('data.height', 'theme')
            ->assertJsonPath('data.height_mobile', null);

        $slide = $this->getJson('/api/v1/sliders/homepage-hero')->assertOk()
            ->assertJsonPath('data.media_effect', 'none')
            ->assertJsonPath('data.navigation', 'dots')
            ->assertJsonPath('data.height', 'theme')
            ->json('data.slides.0');

        $this->assertSame([
            'kicker' => null, 'link2_url' => null, 'link2_label' => null,
            'mobile_url' => null, 'mobile_alt' => null, 'mobile_focus' => null, 'mobile_blur' => null,
            'text_tone' => 'light', 'overlay' => 'standard', 'duration_ms' => null, 'fit' => 'cover',
        ], array_intersect_key($slide, array_flip([
            'kicker', 'link2_url', 'link2_label', 'mobile_url', 'mobile_alt', 'mobile_focus', 'mobile_blur',
            'text_tone', 'overlay', 'duration_ms', 'fit',
        ])));
    }

    public function test_the_second_button_is_both_or_neither(): void
    {
        $this->make(['link2_url' => '/contact'])->assertStatus(422)->assertJsonValidationErrors('slides.0.link2_label');
        $this->make(['link2_label' => 'Contact'])->assertStatus(422)->assertJsonValidationErrors('slides.0.link2_url');
        $this->make(['link2_url' => 'javascript:alert(1)', 'link2_label' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrors('slides.0.link2_url');
        $this->make(['link2_url' => '/contact', 'link2_label' => 'Contact'])->assertCreated()
            ->assertJsonPath('data.slides.0.link2_url', '/contact')
            ->assertJsonPath('data.slides.0.link2_label', 'Contact');
    }

    public function test_the_kicker_is_capped(): void
    {
        $this->make(['kicker' => str_repeat('k', 61)])->assertStatus(422)->assertJsonValidationErrors('slides.0.kicker');
        $this->make(['kicker' => 'New'])->assertCreated()->assertJsonPath('data.slides.0.kicker', 'New');
    }

    public function test_the_phone_picture_must_be_a_library_image(): void
    {
        $this->media('media/doc.pdf', 'application/pdf');
        $this->make(['mobile_media_path' => 'media/doc.pdf'])->assertStatus(422)->assertJsonValidationErrors('slides.0.mobile_media_path');
        $this->make(['mobile_media_path' => 'media/nowhere.jpg'])->assertStatus(422)->assertJsonValidationErrors('slides.0.mobile_media_path');

        $this->media('media/phone.jpg')->update(['alt_text' => 'A phone view', 'focal_x' => 30, 'focal_y' => 20]);
        $id = $this->make(['mobile_media_path' => 'media/phone.jpg'])->assertCreated()->json('data.id');

        $slide = $this->getJson('/api/v1/sliders/homepage-hero')->assertOk()->json('data.slides.0');
        $this->assertStringContainsString('media/phone.jpg', $slide['mobile_url']);
        $this->assertSame('A phone view', $slide['mobile_alt']);
        $this->assertSame('30% 20%', $slide['mobile_focus']);
        $this->assertArrayHasKey('mobile_blur', $slide);

        $this->actingAs($this->editor(), 'sanctum')->getJson("/api/v1/admin/sliders/{$id}")
            ->assertJsonPath('data.slides.0.mobile_url', $slide['mobile_url']);
    }

    public function test_the_per_slide_duration_is_bounded(): void
    {
        $this->make(['duration_ms' => 1999])->assertStatus(422)->assertJsonValidationErrors('slides.0.duration_ms');
        $this->make(['duration_ms' => 60001])->assertStatus(422)->assertJsonValidationErrors('slides.0.duration_ms');
        $this->make(['duration_ms' => null])->assertCreated()->assertJsonPath('data.slides.0.duration_ms', null);
        $this->make(['duration_ms' => 2000])->assertCreated()->assertJsonPath('data.slides.0.duration_ms', 2000);
    }

    public function test_every_enum_refuses_an_unknown_and_round_trips_its_values(): void
    {
        foreach (['text_tone' => 'purple', 'overlay' => 'heavy', 'fit' => 'stretch'] as $key => $bad) {
            $this->make([$key => $bad])->assertStatus(422)->assertJsonValidationErrors("slides.0.{$key}");
        }
        foreach (['media_effect' => 'spin', 'navigation' => 'tabs', 'height' => 'huge'] as $key => $bad) {
            $this->make([], [$key => $bad])->assertStatus(422)->assertJsonValidationErrors($key);
        }

        $this->make(
            ['text_tone' => 'dark', 'overlay' => 'strong', 'fit' => 'contain'],
            ['media_effect' => 'drift', 'navigation' => 'thumbnails', 'height' => 'screen'],
        )->assertCreated()
            ->assertJsonPath('data.media_effect', 'drift')
            ->assertJsonPath('data.navigation', 'thumbnails')
            ->assertJsonPath('data.height', 'screen')
            ->assertJsonPath('data.slides.0.text_tone', 'dark')
            ->assertJsonPath('data.slides.0.overlay', 'strong')
            ->assertJsonPath('data.slides.0.fit', 'contain');
    }

    public function test_a_fixed_height_needs_both_steps_and_others_store_none(): void
    {
        $this->make([], ['height' => 'fixed'])->assertStatus(422)
            ->assertJsonValidationErrors(['height_mobile', 'height_desktop']);
        $this->make([], ['height' => 'fixed', 'height_mobile' => 'short', 'height_desktop' => 'giant'])
            ->assertStatus(422)->assertJsonValidationErrors('height_desktop');

        $id = $this->make([], ['height' => 'fixed', 'height_mobile' => 'short', 'height_desktop' => 'tall'])
            ->assertCreated()->assertJsonPath('data.height_mobile', 'short')->assertJsonPath('data.height_desktop', 'tall')
            ->json('data.id');

        $this->actingAs($this->editor(), 'sanctum')
            ->patchJson("/api/v1/admin/sliders/{$id}", ['height' => 'screen'])->assertOk()
            ->assertJsonPath('data.height_mobile', null)->assertJsonPath('data.height_desktop', null);
    }

    public function test_meta_carries_the_six_option_lists(): void
    {
        $meta = $this->actingAs($this->editor(), 'sanctum')->getJson('/api/v1/admin/sliders')->assertOk()->json('meta');

        $this->assertSame(['none', 'zoom_in', 'zoom_out', 'drift'], array_column($meta['media_effects'], 'value'));
        $this->assertSame(['dots', 'progress', 'thumbnails', 'none'], array_column($meta['navigations'], 'value'));
        $this->assertSame(['theme', 'screen', 'fixed'], array_column($meta['heights'], 'value'));
        $this->assertSame(['short', 'medium', 'tall'], array_column($meta['height_steps'], 'value'));
        $this->assertSame(['light', 'dark'], array_column($meta['text_tones'], 'value'));
        $this->assertSame(['soft', 'standard', 'strong'], array_column($meta['overlays'], 'value'));
        $this->assertSame(['cover', 'contain'], array_column($meta['fits'], 'value'));
        $this->assertNotEmpty($meta['fits'][1]['blurb']);
    }
}
