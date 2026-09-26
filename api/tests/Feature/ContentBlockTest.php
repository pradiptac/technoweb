<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Brand;
use App\Models\ContentBlock;
use App\Models\Lead;
use App\Models\Media;
use App\Models\NewsletterSubscriber;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

/**
 * Content blocks (2026-09-24): CTA banners, stat bars, pricing tables and
 * technology stacks — one entity, a layout per type, `data` checked by the
 * layout's own rules, embedded by shortcode, and one CTA as the site default.
 */
class ContentBlockTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
        Notification::fake();
    }

    private function editor(): User
    {
        $user = User::firstOrCreate(['email' => 'blocks-editor@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(
            ['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()],
        )->id]);

        return $user;
    }

    /** @param  array<string, mixed>  $overrides */
    private function create(array $overrides = [])
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/blocks', array_replace([
            'type' => 'cta', 'layout' => 'band', 'name' => 'Site audit', 'status' => 'published',
            'content' => ['heading' => 'Let’s look at what you’re actually running.', 'primary' => ['label' => 'Book a site audit', 'href' => '/contact']],
        ], $overrides));
    }

    private function media(string $path, string $mime): void
    {
        Media::create(['disk' => 'public', 'path' => $path, 'filename' => basename($path), 'mime' => $mime, 'size' => 10]);
    }

    public function test_a_block_is_created_with_a_derived_slug_and_its_shortcode(): void
    {
        $this->create()->assertCreated()
            ->assertJsonPath('data.slug', 'site-audit')
            ->assertJsonPath('data.shortcode', '[cta slug="site-audit"]')
            ->assertJsonPath('meta.layouts.stats.0.value', 'row');

        $this->getJson('/api/v1/blocks/site-audit')->assertOk()
            ->assertJsonPath('data.type', 'cta')
            ->assertJsonPath('data.content.primary.href', '/contact');
    }

    public function test_a_layout_outside_its_type_is_refused_and_the_type_is_fixed(): void
    {
        $this->create(['layout' => 'rings'])->assertStatus(422)->assertJsonValidationErrors('layout');

        $id = $this->create()->json('data.id');
        $this->actingAs($this->editor(), 'sanctum')->patchJson("/api/v1/admin/blocks/{$id}", ['type' => 'stats'])
            ->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_each_layout_requires_what_it_draws(): void
    {
        // A ring gauge needs exactly three figures, each with a percentage.
        $this->create(['type' => 'stats', 'layout' => 'rings', 'name' => 'Rings', 'content' => [
            'items' => [['value' => '99%', 'label' => 'Uptime']],
        ]])->assertStatus(422)->assertJsonValidationErrors(['content.items', 'content.items.0.percent']);

        // A sparkline needs a series; a plain row does not.
        $this->create(['type' => 'stats', 'layout' => 'sparkline_cards', 'name' => 'Spark', 'content' => [
            'items' => [['value' => '12', 'label' => 'Sites']],
        ]])->assertStatus(422)->assertJsonValidationErrors('content.items.0.series');
        $this->create(['type' => 'stats', 'layout' => 'row', 'name' => 'Row', 'content' => [
            'items' => [['value' => '12', 'label' => 'Sites']],
        ]])->assertCreated();

        // A gated download needs a PDF that is in the library.
        $this->create(['layout' => 'gated_download', 'name' => 'Guide', 'content' => ['heading' => 'Guide', 'media_path' => 'media/nope.pdf']])
            ->assertStatus(422)->assertJsonValidationErrors('content.media_path');
        $this->media('media/pic.jpg', 'image/jpeg');
        $this->create(['layout' => 'gated_download', 'name' => 'Guide', 'content' => ['heading' => 'Guide', 'media_path' => 'media/pic.jpg']])
            ->assertStatus(422)->assertJsonValidationErrors('content.media_path');

        // A button's href is a path, a URL, mailto or tel — never script.
        $this->create(['content' => ['heading' => 'X', 'primary' => ['label' => 'Go', 'href' => 'javascript:alert(1)']]])
            ->assertStatus(422)->assertJsonValidationErrors('content.primary.href');
    }

    public function test_a_pricing_plan_needs_a_price_and_a_comparison_row_one_cell_per_plan(): void
    {
        $plan = ['name' => 'Basic', 'price_monthly_paise' => 499900];
        $this->create(['type' => 'pricing', 'layout' => 'three_tier', 'name' => 'AMC', 'content' => [
            'sets' => [['label' => 'AMC', 'plans' => [['name' => 'Free-ish']]]],
        ]])->assertStatus(422)->assertJsonValidationErrors('content.sets.0.plans.0.price_monthly_paise');

        $this->create(['type' => 'pricing', 'layout' => 'comparison', 'name' => 'Compare', 'content' => [
            'sets' => [['label' => 'AMC', 'plans' => [$plan, ['name' => 'Pro', 'price_label' => 'Custom']],
                'rows' => [['label' => 'Response', 'cells' => ['4h']]]]],
        ]])->assertStatus(422)->assertJsonValidationErrors('content.sets.0.rows.0.cells');

        $this->create(['type' => 'pricing', 'layout' => 'comparison', 'name' => 'Compare', 'content' => [
            'sets' => [['label' => 'AMC', 'plans' => [$plan, ['name' => 'Pro', 'price_label' => 'Custom']],
                'rows' => [['label' => 'Response', 'cells' => ['8h', '4h']]]]],
        ]])->assertCreated();
    }

    public function test_one_published_cta_is_the_default_and_the_public_read_is_null_without_one(): void
    {
        $this->getJson('/api/v1/blocks/default/cta')->assertOk()->assertJsonPath('data', null);

        $a = $this->create(['is_default' => true])->assertCreated()->json('data.id');
        $b = $this->create(['name' => 'Second', 'is_default' => true])->assertCreated()->json('data.id');

        $this->assertFalse(ContentBlock::find($a)->is_default);
        $this->assertTrue(ContentBlock::find($b)->is_default);
        $this->getJson('/api/v1/blocks/default/cta')->assertOk()->assertJsonPath('data.slug', 'second');

        // A draft cannot be the default, and unpublishing the default clears it.
        $this->create(['name' => 'Draft', 'status' => 'draft', 'is_default' => true])->assertStatus(422)->assertJsonValidationErrors('is_default');
        $this->create(['type' => 'stats', 'layout' => 'row', 'name' => 'S', 'is_default' => true, 'content' => ['items' => [['value' => '1', 'label' => 'x']]]])
            ->assertStatus(422)->assertJsonValidationErrors('is_default');
        $this->actingAs($this->editor(), 'sanctum')->patchJson("/api/v1/admin/blocks/{$b}", ['status' => 'draft'])->assertOk();
        $this->getJson('/api/v1/blocks/default/cta')->assertOk()->assertJsonPath('data', null);
    }

    public function test_a_draft_is_a_404_and_the_gated_file_never_reaches_the_public_read(): void
    {
        $this->create(['name' => 'Hidden', 'status' => 'draft']);
        $this->getJson('/api/v1/blocks/hidden')->assertNotFound();

        $this->media('media/guide.pdf', 'application/pdf');
        $this->create(['layout' => 'gated_download', 'name' => 'Guide', 'content' => ['heading' => 'The guide', 'media_path' => 'media/guide.pdf']])->assertCreated();

        $read = $this->getJson('/api/v1/blocks/guide')->assertOk();
        $this->assertStringNotContainsString('guide.pdf', $read->getContent());
        $read->assertJsonPath('data.content.has_download', true);

        // The file is handed over by the form, and the request becomes a lead.
        $this->postJson('/api/v1/blocks/guide/submit', ['email' => 'priya@example.test', 'name' => 'Priya'])
            ->assertOk()->assertJsonPath('data.url', asset('storage/media/guide.pdf'));
        $this->assertSame('download', Lead::sole()->channel);
    }

    public function test_the_honeypot_stores_nothing_and_a_webinar_registration_is_a_lead(): void
    {
        $this->create(['layout' => 'webinar', 'name' => 'Webinar', 'content' => ['heading' => 'SD-WAN in an hour', 'starts_at' => '2026-10-10 11:00']])->assertCreated();

        $this->postJson('/api/v1/blocks/webinar/submit', ['email' => 'bot@example.test', 'name' => 'Bot', 'website' => 'http://spam'])->assertStatus(202);
        $this->assertSame(0, Lead::count());

        $this->postJson('/api/v1/blocks/webinar/submit', ['email' => 'rohan@example.test'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/blocks/webinar/submit', ['email' => 'rohan@example.test', 'name' => 'Rohan'])->assertStatus(202);
        $this->assertSame('webinar', Lead::sole()->channel);

        // A banner without a form has no submit.
        $this->create(['name' => 'Plain']);
        $this->postJson('/api/v1/blocks/plain/submit', ['email' => 'x@example.test'])->assertNotFound();
    }

    public function test_the_newsletter_banner_subscribes_and_is_refused_when_signup_is_off(): void
    {
        $this->create(['layout' => 'newsletter', 'name' => 'News', 'content' => ['heading' => 'Stay in the loop']])->assertCreated();

        $this->postJson('/api/v1/blocks/news/submit', ['email' => 'neha@example.test'])->assertStatus(202);
        $this->assertTrue(NewsletterSubscriber::where('email', 'neha@example.test')->exists());

        Setting::query()->where('key', 'newsletter_signup_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->postJson('/api/v1/blocks/news/submit', ['email' => 'late@example.test'])->assertStatus(403);
        // The footer's own signup was comparing that row to '0' and never refused.
        $this->postJson('/api/v1/newsletter/subscribe', ['email' => 'late@example.test'])->assertStatus(403);
    }

    public function test_a_stack_node_takes_its_brand_logo_and_a_deleted_brand_drops_the_node(): void
    {
        $cisco = Brand::create(['name' => 'Cisco', 'slug' => 'cisco', 'logo_path' => 'media/cisco.svg']);
        $gone = Brand::create(['name' => 'Gone', 'slug' => 'gone']);

        $this->create(['type' => 'stack', 'layout' => 'orbit', 'name' => 'Stack', 'content' => ['groups' => [
            ['name' => 'Network', 'items' => [['label' => 'Cisco', 'brand_id' => $cisco->id], ['label' => 'Gone', 'brand_id' => $gone->id]]],
            ['name' => 'Tools', 'items' => [['label' => 'Grafana', 'icon' => 'gauge', 'image_path' => 'media/x.png']]],
        ]]])->assertStatus(422)->assertJsonValidationErrors('content.groups.1.items.0.icon');

        $this->create(['type' => 'stack', 'layout' => 'orbit', 'name' => 'Stack', 'content' => ['groups' => [
            ['name' => 'Network', 'items' => [['label' => '', 'brand_id' => $cisco->id], ['label' => 'Gone', 'brand_id' => $gone->id]]],
        ]]])->assertCreated();
        $gone->delete();

        $read = $this->getJson('/api/v1/blocks/stack')->assertOk();
        $read->assertJsonCount(1, 'data.content.groups.0.items');
        // A blank label takes the brand's own name.
        $read->assertJsonPath('data.content.groups.0.items.0.label', 'Cisco');
        $this->assertStringStartsWith(asset('storage/media/cisco.svg'), $read->json('data.content.groups.0.items.0.image'));
        $this->assertArrayNotHasKey('brand_id', $read->json('data.content.groups.0.items.0'));
    }

    public function test_a_homepage_block_setting_takes_only_a_published_block_of_its_kind(): void
    {
        $this->create(); // a CTA, `site-audit`
        $this->create(['type' => 'stats', 'layout' => 'row', 'name' => 'Figures', 'content' => ['items' => [['value' => '1', 'label' => 'x']]]]);
        $this->create(['type' => 'stats', 'layout' => 'row', 'name' => 'Draft figures', 'status' => 'draft', 'content' => ['items' => [['value' => '1', 'label' => 'x']]]]);

        $admin = User::create(['name' => 'Admin', 'email' => 'blocks-admin@example.test', 'password' => 'password-for-tests', 'is_active' => true]);
        $admin->roles()->attach(Role::firstOrCreate(['slug' => RoleEnum::Admin->value], ['name' => RoleEnum::Admin->label()]));
        $save = fn (string $slug) => $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'home_stats_block', 'value' => $slug]]]);

        $save('site-audit')->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $save('draft-figures')->assertStatus(422);
        $save('figures')->assertOk();
        $this->assertSame('figures', Setting::get('home_stats_block'));

        // The console's select lists None and the published stat bars only.
        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings')->json('data.homepage'))->firstWhere('key', 'home_stats_block');
        $this->assertSame(['', 'figures'], array_column($row['options'], 'value'));
    }

    public function test_duplicating_makes_a_draft_copy_that_is_never_the_default(): void
    {
        $id = $this->create(['is_default' => true])->json('data.id');

        $this->actingAs($this->editor(), 'sanctum')->postJson("/api/v1/admin/blocks/{$id}/duplicate")
            ->assertCreated()
            ->assertJsonPath('data.slug', 'site-audit-copy')
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.is_default', false);
    }
}
