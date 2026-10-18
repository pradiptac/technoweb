<?php

namespace Tests\Feature;

use App\Enums\ImageShape;
use App\Enums\ImageStyle;
use App\Enums\Role as RoleEnum;
use App\Models\Setting;
use App\Support\Images\ImageSettings;
use App\Support\Writing\WritingSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\FakesWriter;
use Tests\TestCase;

class ImageSettingsTest extends TestCase
{
    use FakesWriter, RefreshDatabase;

    private function set(string $key, ?string $value): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'seo', 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    public function test_defaults(): void
    {
        $this->assertSame(30, ImageSettings::dailyCap());
        $this->assertSame('google/gemini-2.5-flash-image', ImageSettings::model());
        $this->assertSame('', ImageSettings::style());
    }

    public function test_the_counter_is_its_own(): void
    {
        ImageSettings::countRun();
        ImageSettings::countRun();
        $this->assertSame(2, ImageSettings::runsToday());
        $this->assertSame(0, WritingSettings::runsToday());
    }

    public function test_refusals_in_order(): void
    {
        $this->assertStringContainsString('switched off', (string) ImageSettings::refusal());
        $this->writerOn();
        $this->assertNull(ImageSettings::refusal());
        $this->set('ai_image_daily_cap', '0');
        $this->assertSame('Pictures are switched off (the daily limit is 0).', ImageSettings::refusal());
        $this->set('ai_image_daily_cap', '1');
        ImageSettings::countRun();
        $this->assertStringStartsWith("Today's limit of 1 pictures has been reached", (string) ImageSettings::refusal());
    }

    public function test_shapes_and_styles(): void
    {
        $this->assertSame('16:9', ImageShape::Wide->ratio());
        $this->assertSame('21:9', ImageShape::Banner->ratio());
        $this->assertCount(5, ImageShape::options());
        $this->assertCount(4, ImageStyle::options());
        $this->assertNotSame('', ImageStyle::Photo->instruction());
    }

    public function test_settings_save_is_shape_checked(): void
    {
        $this->seed(SettingsSeeder::class);
        $admin = $this->staff(RoleEnum::Admin);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ai_image_daily_cap', 'value' => '1001']]])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ai_image_model', 'value' => 'not a model']]])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ai_image_style', 'value' => str_repeat('a', 501)]]])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ai_image_daily_cap', 'value' => '50']]])->assertOk();
    }
}
