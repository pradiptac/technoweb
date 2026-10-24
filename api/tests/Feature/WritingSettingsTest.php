<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Support\Writing\WritingSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class WritingSettingsTest extends TestCase
{
    use RefreshDatabase;

    private function user(RoleEnum $role = RoleEnum::Admin): User
    {
        $user = User::firstOrCreate(['email' => "writing-{$role->value}@example.test"], [
            'name' => 'Admin', 'phone' => '9876543210', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    private function set(string $key, ?string $value): void
    {
        Setting::updateOrCreate(['key' => $key], ['group' => 'seo', 'value' => $value, 'type' => 'string']);
        Setting::flushCache();
    }

    public function test_defaults_and_parsing(): void
    {
        $this->assertSame(300, WritingSettings::dailyCap());
        $this->assertSame('', WritingSettings::style());
        $this->assertSame([], WritingSettings::avoid());

        $this->set('ai_writing_daily_cap', '5');
        $this->set('ai_writing_style', '  Plain, confident, Indian English.  ');
        $this->set('ai_writing_avoid', "Synergy\n\nleverage\nsynergy\n");

        $this->assertSame(5, WritingSettings::dailyCap());
        $this->assertSame('Plain, confident, Indian English.', WritingSettings::style());
        $this->assertSame(['synergy', 'leverage'], WritingSettings::avoid());
    }

    public function test_the_counter_is_its_own(): void
    {
        $this->set('ai_writing_daily_cap', '1');
        $this->assertTrue(WritingSettings::underCap());
        WritingSettings::countRun();
        $this->assertSame(1, WritingSettings::runsToday());
        $this->assertFalse(WritingSettings::underCap());
        $this->assertNull(Cache::get('seo:ai:runs:'.now()->toDateString()));
    }

    public function test_a_cap_of_zero_means_off(): void
    {
        $this->set('ai_writing_daily_cap', '0');
        $this->assertFalse(WritingSettings::underCap());
    }

    public function test_refusals_for_bad_values(): void
    {
        $this->assertNotNull(WritingSettings::refusalFor('ai_writing_daily_cap', '20000'));
        $this->assertNotNull(WritingSettings::refusalFor('ai_writing_daily_cap', 'lots'));
        $this->assertNull(WritingSettings::refusalFor('ai_writing_daily_cap', '300'));
        $this->assertNotNull(WritingSettings::refusalFor('ai_writing_style', str_repeat('a', 501)));
        $this->assertNotNull(WritingSettings::refusalFor('ai_writing_avoid', implode("\n", array_fill(0, 51, 'word'))));
        $this->assertNotNull(WritingSettings::refusalFor('ai_writing_avoid', str_repeat('a', 41)));
        $this->assertNull(WritingSettings::refusalFor('seo_ai_daily_cap', 'anything'));
    }

    public function test_a_saved_key_carries_a_hint_and_never_the_value(): void
    {
        $this->seed(SettingsSeeder::class);
        $secret = 'sk-or-v1-0123456789abcdef0123456789abcdefa7';
        Setting::where('key', 'openrouter_api_key')->firstOrFail()->update(['value' => $secret]);
        Setting::flushCache();

        $res = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/settings')->assertOk();
        $row = collect($res->json('data.integrations'))->firstWhere('key', 'openrouter_api_key');

        $this->assertTrue($row['is_set']);
        $this->assertNull($row['value']);
        $this->assertSame('sk-or-v1…a7', $row['hint']);
        $this->assertStringNotContainsString($secret, $res->getContent());
    }

    public function test_the_settings_endpoint_refuses_a_bad_cap(): void
    {
        $this->seed(SettingsSeeder::class);
        $admin = $this->user();

        $this->actingAs($admin, 'sanctum')
            ->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'ai_writing_daily_cap', 'value' => '-3']]])
            ->assertStatus(422)->assertJsonValidationErrors(['settings.0.value']);
    }
}
