<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Support\System\Branding;
use Database\Seeders\NewsletterTemplateSeeder;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A fresh install names its own company everywhere the seeded defaults
 * named the original one — and sends its notifications to its own
 * administrator from the first minute.
 */
class BrandingTest extends TestCase
{
    use RefreshDatabase;

    public function test_no_seeded_setting_still_names_the_original_company(): void
    {
        $this->seed([SettingsSeeder::class, NewsletterTemplateSeeder::class]);

        Branding::apply('Acme Networks', 'it@acme.example', 'https://www.acme.example');

        $left = Setting::query()->where('key', '!=', 'theme')->get()
            ->filter(fn (Setting $s) => is_string($s->getRawOriginal('value')) && stripos($s->getRawOriginal('value'), 'technoware') !== false)
            ->pluck('key')->all();

        $this->assertSame([], $left, 'Still naming the original company: '.implode(', ', $left));
        $this->assertSame('Acme Networks', Setting::query()->where('key', 'company_name')->value('value'));
        $this->assertSame('it@acme.example', Setting::query()->where('key', 'support_email')->value('value'));
        $this->assertSame('it@acme.example', Setting::query()->where('key', 'sales_email')->value('value'));
        $this->assertSame('Why Acme Networks', Setting::query()->where('key', 'why_kicker')->value('value'));
        $this->assertNull(Setting::query()->where('key', 'address')->value('value'));
        $this->assertSame('AN', Setting::query()->where('key', 'ticket_reference_prefix')->value('value'));
        $this->assertSame('ANV', Setting::query()->where('key', 'visit_reference_prefix')->value('value'));
        $this->assertSame('ANM', Setting::query()->where('key', 'meeting_reference_prefix')->value('value'));
        $this->assertSame('ORD', Setting::query()->where('key', 'order_number_prefix')->value('value'));
        foreach (DB::table('newsletter_templates')->get() as $template) {
            $this->assertStringNotContainsStringIgnoringCase('technoware', (string) $template->blocks, "template {$template->id}'s blocks");
            $this->assertStringNotContainsStringIgnoringCase('technoware', (string) $template->html, "template {$template->id}'s html");
            $this->assertIsArray(json_decode((string) $template->blocks, true), 'the blocks are still valid JSON');
        }

        // The palette's id is a key, not a name.
        $this->assertSame('technoware', Setting::query()->where('key', 'theme')->value('value'));
    }
}
