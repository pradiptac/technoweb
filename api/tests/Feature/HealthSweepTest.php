<?php

namespace Tests\Feature;

use App\Models\HealthFinding;
use App\Support\Health\HealthSettings;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HealthSweepTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_tables_and_settings_exist(): void
    {
        $this->seed(SettingsSeeder::class);

        $finding = HealthFinding::create([
            'subject_type' => 'page', 'subject_id' => 1, 'subject_published' => true,
            'check' => 'stale', 'severity' => 'warning', 'field' => 'record',
            'detail' => ['months' => 20], 'fingerprint' => str_repeat('a', 40),
            'first_seen_at' => now(), 'last_seen_at' => now(),
        ]);

        $this->assertSame(['months' => 20], $finding->fresh()->detail);
        $this->assertSame(18, HealthSettings::staleMonths('page'));
        $this->assertSame(0, HealthSettings::staleMonths('blog_post'));
        $this->assertTrue(HealthSettings::externalOn());
        $this->assertNull(HealthSettings::refusalFor('health_stale_page', '24'));
        $this->assertSame('A whole number of months, 0 to 60.', HealthSettings::refusalFor('health_stale_page', '61'));
    }
}
