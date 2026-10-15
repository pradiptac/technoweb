<?php

namespace Tests\Feature;

use App\Enums\ProductType;
use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Redirect;
use App\Models\Role;
use App\Models\Setting;
use App\Models\StoreProduct;
use App\Models\StoreTag;
use App\Models\User;
use Database\Seeders\SettingsSeeder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Shop tag landing pages (0.157.0): `/store/tags/{slug}` with a heading, an
 * introduction and an SEO override. What is pinned: a hidden tag is no page,
 * the count is published products only, fewer than three is not indexable,
 * the introduction is sanitised, a rename leaves a 301, and the role gate.
 */
class StoreTagPageTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(SettingsSeeder::class);
    }

    private function api(RoleEnum $role = RoleEnum::StoreManager): static
    {
        $user = User::firstOrCreate(
            ['email' => $role->value.'-tagpage@example.test'],
            ['name' => 'Test staff', 'password' => 'password-for-tests', 'is_active' => true],
        );

        if ($user->roles()->count() === 0) {
            $user->roles()->attach(Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()]));
        }

        return $this->actingAs($user, 'sanctum');
    }

    /** A tag carried by $published published products and $draft drafts. */
    private function tag(string $name, int $published = 0, int $draft = 0, array $attributes = []): StoreTag
    {
        $tag = StoreTag::create(['name' => $name, 'slug' => str($name)->slug()->value()] + $attributes);

        foreach (['published' => $published, 'draft' => $draft] as $status => $n) {
            for ($i = 1; $i <= $n; $i++) {
                $tag->products()->attach(StoreProduct::create([
                    'name' => "P {$status} {$i}",
                    'slug' => "p-{$status}-{$i}-".uniqid(),
                    'sku' => 'S-'.strtoupper(uniqid()),
                    'type' => ProductType::Physical,
                    'status' => $status === 'published' ? PublishStatus::Published : PublishStatus::Draft,
                    'price_paise' => 100000,
                ])->id);
            }
        }

        return $tag;
    }

    public function test_the_page_reads_a_visible_tag_with_its_published_count_only(): void
    {
        $this->tag('Wi-Fi 6', published: 2, draft: 3, attributes: ['heading' => 'Wi-Fi 6 access points', 'intro' => '<p>Fast.</p>']);

        $this->getJson('/api/v1/store/tags/wi-fi-6')->assertOk()
            ->assertJsonPath('data.name', 'Wi-Fi 6')
            ->assertJsonPath('data.heading', 'Wi-Fi 6 access points')
            ->assertJsonPath('data.intro', '<p>Fast.</p>')
            ->assertJsonPath('data.count', 2)
            ->assertJsonPath('data.schema.@type', 'CollectionPage')
            ->assertJsonPath('data.seo.title', 'Wi-Fi 6 access points');
    }

    public function test_a_hidden_unknown_or_switched_off_tag_is_a_404_but_an_empty_one_answers(): void
    {
        $this->tag('Hidden', published: 3, attributes: ['is_visible' => false]);
        $this->tag('Empty', draft: 1);

        $this->getJson('/api/v1/store/tags/hidden')->assertNotFound();
        $this->getJson('/api/v1/store/tags/nothing-here')->assertNotFound();
        $this->getJson('/api/v1/store/tags/empty')->assertOk()->assertJsonPath('data.count', 0)->assertJsonPath('data.indexable', false);

        Setting::where('key', 'store_tags_enabled')->update(['value' => '0']);
        Setting::flushCache();
        $this->getJson('/api/v1/store/tags/empty')->assertNotFound();
    }

    public function test_a_page_is_indexable_from_three_published_products(): void
    {
        $this->tag('Two', published: 2, draft: 5);
        $this->tag('Three', published: 3);

        $this->getJson('/api/v1/store/tags/two')->assertJsonPath('data.indexable', false);
        $this->getJson('/api/v1/store/tags/three')->assertJsonPath('data.indexable', true);

        $rows = collect($this->getJson('/api/v1/store/tags?all=1')->assertOk()->json('data'))->keyBy('slug');
        $this->assertFalse($rows['two']['indexable']);
        $this->assertTrue($rows['three']['indexable']);
        $this->assertArrayHasKey('updated_at', $rows['three']);
        $this->assertTrue($rows['three']['seo']['sitemap_include']);

        // Without ?all the row keeps its old shape.
        $this->assertSame(['name', 'slug', 'count'], array_keys($this->getJson('/api/v1/store/tags')->json('data.0')));
    }

    public function test_the_intro_is_sanitised_and_the_seo_override_is_saved_and_served(): void
    {
        $tag = $this->tag('Poe', published: 3);

        $this->api()->patchJson("/api/v1/admin/store/tags/{$tag->id}", [
            'heading' => 'PoE switches',
            'intro' => '<p>Power over Ethernet.</p><script>alert(1)</script><img src=x onerror=alert(2)>',
            'seo' => ['title' => 'Buy PoE switches', 'description' => 'Managed PoE switches.', 'robots' => 'index, follow'],
        ])->assertOk()
            ->assertJsonPath('data.heading', 'PoE switches')
            ->assertJsonPath('data.seo.title', 'Buy PoE switches');

        $intro = $tag->fresh()->intro;
        $this->assertStringContainsString('Power over Ethernet.', $intro);
        $this->assertStringNotContainsString('<script', $intro);
        $this->assertStringNotContainsString('onerror', $intro);

        $this->getJson('/api/v1/store/tags/poe')->assertOk()->assertJsonPath('data.seo.title', 'Buy PoE switches');
        $this->api()->getJson("/api/v1/admin/store/tags/{$tag->id}")->assertOk()
            ->assertJsonPath('data.seo.title', 'Buy PoE switches')
            ->assertJsonPath('data.public_path', '/store/tags/poe')
            ->assertJsonPath('data.seo_defaults.schema_type', 'CollectionPage');
    }

    public function test_a_rename_and_a_merge_leave_a_redirect_and_renaming_back_clears_it(): void
    {
        $a = $this->tag('Wifi', published: 1);
        $b = $this->tag('Wireless', published: 1);

        $this->api()->patchJson("/api/v1/admin/store/tags/{$a->id}", ['name' => 'Wi-Fi'])->assertOk();
        $this->assertSame('/store/tags/wi-fi', Redirect::where('from_path', '/store/tags/wifi')->value('to_path'));

        $this->api()->patchJson("/api/v1/admin/store/tags/{$a->id}", ['name' => 'Wifi'])->assertOk();
        $this->assertSame(0, Redirect::where('from_path', '/store/tags/wifi')->count());

        $this->api()->postJson("/api/v1/admin/store/tags/{$b->id}/merge", ['into' => $a->id])->assertOk();
        $this->assertSame('/store/tags/wifi', Redirect::where('from_path', '/store/tags/wireless')->value('to_path'));
    }

    public function test_the_tag_is_on_the_seo_overview_and_the_morph_map_and_only_a_store_manager_edits_it(): void
    {
        $tag = $this->tag('Rack', published: 1);

        $this->assertSame(StoreTag::class, Relation::getMorphedModel('store_tag'));

        $row = collect($this->api(RoleEnum::SeoManager)->getJson('/api/v1/admin/seo?type=store_tag')->assertOk()->json('data'))->first();
        $this->assertSame('/store/tags/rack', $row['public_path']);
        $this->assertSame("/admin/store/tags/{$tag->id}", $row['admin_path']);

        $this->api(RoleEnum::ContentManager)->getJson("/api/v1/admin/store/tags/{$tag->id}")->assertForbidden();
        $this->api(RoleEnum::ContentManager)->patchJson("/api/v1/admin/store/tags/{$tag->id}", ['heading' => 'x'])->assertForbidden();
    }
}
