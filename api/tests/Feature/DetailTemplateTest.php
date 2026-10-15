<?php

namespace Tests\Feature;

use App\Enums\PageSectionType;
use App\Enums\Role as RoleEnum;
use App\Models\DetailTemplate;
use App\Models\Role;
use App\Models\Service;
use App\Models\User;
use App\Support\DetailTemplates;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Detail-page templates (0.161.0, `docs/page-builder.md` "Detail templates"):
 * how every page of one kind of record is laid out, in the section builder,
 * mixed with record blocks the website draws from the record itself.
 */
class DetailTemplateTest extends TestCase
{
    use RefreshDatabase;

    private function staff(RoleEnum ...$roles): User
    {
        $user = User::create([
            'name' => 'Staff '.Str::random(4), 'email' => Str::random(8).'@example.test',
            'password' => 'password-for-tests', 'is_active' => true,
        ]);
        foreach ($roles as $role) {
            $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);
        }

        return $user;
    }

    /** @param  array<string, mixed>  $data @param  array<string, mixed>  $extra @return array<string, mixed> */
    private static function section(string $type, array $data = [], array $extra = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data, ...$extra];
    }

    /** The smallest valid service template: the heading and the body. */
    private static function blocks(string ...$types): array
    {
        return array_map(fn (string $t) => self::section($t), $types ?: ['record_hero', 'record_body']);
    }

    private function make(string $type, string $name, ?array $blocks = null, bool $active = false): DetailTemplate
    {
        $template = DetailTemplate::create([
            'type' => $type, 'name' => $name,
            'blocks' => json_decode((string) json_encode($blocks ?? self::blocks()), true),
        ]);
        if ($active) {
            $template->activate();
        }

        return $template;
    }

    public function test_record_blocks_are_not_in_the_page_builders_own_list(): void
    {
        $standard = array_column(PageSectionType::options(), 'value');
        $record = array_column(PageSectionType::recordOptions(), 'value');

        $this->assertNotEmpty($record);
        $this->assertSame([], array_filter($standard, fn ($v) => str_starts_with($v, 'record_')));
        $this->assertSame(count(PageSectionType::cases()), count($standard) + count($record));
    }

    public function test_a_record_block_is_refused_on_a_page_a_record_body_and_the_library(): void
    {
        $admin = $this->staff(RoleEnum::ContentManager, RoleEnum::StoreManager);
        $block = [self::section('record_body')];

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/pages', ['title' => 'Builder page', 'template' => 'builder', 'status' => 'draft', 'blocks' => $block])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');

        $this->postJson('/api/v1/admin/solutions', ['title' => 'A solution', 'status' => 'published', 'blocks' => $block])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');

        $this->postJson('/api/v1/admin/saved-sections', ['kind' => 'section', 'name' => 'Body', 'blocks' => $block])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');

        $this->postJson('/api/v1/admin/pages/preview', ['blocks' => $block])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');
    }

    public function test_a_template_stores_its_blocks_and_nothing_of_the_section_chrome(): void
    {
        $response = $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum')
            ->postJson('/api/v1/admin/detail-templates', [
                'type' => 'service', 'name' => 'Service layout',
                'blocks' => [
                    self::section('record_hero'),
                    self::section('rich_text', ['heading' => 'Why us', 'body' => '<p>Fine</p><script>x()</script>']),
                    self::section('record_body', ['heading' => 'ignored? no, kept', 'stray' => 'dropped'], ['style' => ['pad_top' => 'xl'], 'background' => ['kind' => 'solid', 'colour' => '#112233']]),
                    self::section('record_related', ['limit' => '4']),
                ],
            ])->assertCreated()
            ->assertJsonPath('data.is_active', false)
            ->assertJsonPath('data.type', 'service')
            ->assertJsonPath('data.cache_tag', 'services')
            ->assertJsonCount(4, 'data.blocks');

        $stored = DetailTemplate::query()->findOrFail($response->json('data.id'))->blocks;
        $this->assertStringNotContainsString('<script', $stored[1]['data']['body']);
        $this->assertArrayNotHasKey('stray', $stored[2]['data']);
        $this->assertNull($stored[2]['style']);
        $this->assertNull($stored[2]['background']);
        $this->assertSame(4, $stored[3]['data']['limit']);
    }

    public function test_a_block_may_only_be_placed_on_a_kind_that_has_it(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, RoleEnum::StoreManager);

        // The buy panel is the shop's; comments are the blog's; a blog post has no enquiry form.
        foreach ([['solution', 'record_buy'], ['solution', 'record_comments'], ['blog_post', 'record_enquiry'], ['industry', 'record_specs'], ['service', 'record_reviews']] as [$type, $block]) {
            $this->actingAs($editor, 'sanctum')
                ->postJson('/api/v1/admin/detail-templates', ['type' => $type, 'name' => 'X', 'blocks' => self::blocks('record_body', $block)])
                ->assertStatus(422)->assertJsonValidationErrors('blocks.1.type');
        }

        // The same blocks on the kinds that own them.
        $this->postJson('/api/v1/admin/detail-templates', ['type' => 'store_product', 'name' => 'Shop', 'blocks' => self::blocks('record_body', 'record_buy', 'record_reviews')])->assertCreated();
        $this->postJson('/api/v1/admin/detail-templates', ['type' => 'blog_post', 'name' => 'Blog', 'blocks' => self::blocks('record_body', 'record_comments')])->assertCreated();
    }

    public function test_the_body_is_placed_exactly_once_and_cannot_be_hidden(): void
    {
        $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum');
        $post = fn (array $blocks) => $this->postJson('/api/v1/admin/detail-templates', ['type' => 'service', 'name' => 'S', 'blocks' => $blocks]);

        $post(self::blocks('record_hero'))->assertStatus(422)->assertJsonValidationErrors('blocks');
        $post(self::blocks('record_body', 'record_body'))->assertStatus(422)->assertJsonValidationErrors('blocks.1.type');
        $post(self::blocks('record_body', 'record_related', 'record_related'))->assertStatus(422)->assertJsonValidationErrors('blocks.2.type');
        $post([self::section('record_body', [], ['hidden' => true])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.hidden');
        $post([self::section('rich_text', ['body' => '<p>Only text</p>'])])->assertStatus(422)->assertJsonValidationErrors('blocks');

        // A body area cannot hold a hero or the page's own FAQs; neither can a template.
        $post([...self::blocks('record_body'), self::section('hero', ['heading' => 'A second title', 'layout' => 'centered'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.1.type');
        $post([...self::blocks('record_body'), self::section('faq', ['source' => 'page'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.1.data.source');

        // An unknown kind of record is refused on `type`; the kind cannot be changed afterwards.
        $this->postJson('/api/v1/admin/detail-templates', ['type' => 'page', 'name' => 'S', 'blocks' => self::blocks()])
            ->assertStatus(422)->assertJsonValidationErrors('type');
        $id = $post(self::blocks())->assertCreated()->json('data.id');
        $this->patchJson("/api/v1/admin/detail-templates/{$id}", ['type' => 'solution'])->assertStatus(422)->assertJsonValidationErrors('type');
    }

    public function test_at_most_one_template_per_kind_is_active(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, RoleEnum::StoreManager);
        $a = $this->make('service', 'A');
        $b = $this->make('service', 'B');
        $other = $this->make('solution', 'Solutions', active: true);

        $this->actingAs($editor, 'sanctum')->postJson("/api/v1/admin/detail-templates/{$a->id}/activate")
            ->assertOk()->assertJsonPath('data.is_active', true);
        $this->postJson("/api/v1/admin/detail-templates/{$b->id}/activate")->assertOk()->assertJsonPath('data.is_active', true);

        $this->assertFalse($a->fresh()->is_active);
        $this->assertTrue($b->fresh()->is_active);
        // Another kind's active template is not touched.
        $this->assertTrue($other->fresh()->is_active);
        $this->assertSame(1, DetailTemplate::query()->where('type', 'service')->where('is_active', true)->count());

        $this->postJson("/api/v1/admin/detail-templates/{$b->id}/deactivate")->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertSame(0, DetailTemplate::query()->where('type', 'service')->where('is_active', true)->count());

        // Created templates start inactive whatever is sent.
        $this->postJson('/api/v1/admin/detail-templates', ['type' => 'service', 'name' => 'C', 'is_active' => true, 'blocks' => self::blocks()])
            ->assertCreated()->assertJsonPath('data.is_active', false);
    }

    public function test_the_public_read_carries_the_template_only_when_active_and_only_on_the_detail_read(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager);
        $slug = $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/services', ['title' => 'Managed Wi-Fi', 'status' => 'published'])
            ->assertCreated()->json('data.slug');
        $template = $this->make('service', 'Service layout', [
            self::section('record_hero'),
            self::section('rich_text', ['heading' => 'Why us', 'body' => '<p>Because.</p>']),
            self::section('record_body'),
            self::section('record_related', ['limit' => 3]),
            self::section('rich_text', ['heading' => 'Hidden one', 'body' => '<p>No.</p>'], ['hidden' => true]),
        ]);

        // Inactive: the key is absent, not null — a page without a template reads as it always did.
        $this->assertArrayNotHasKey('detail_template', $this->getJson("/api/v1/services/{$slug}")->assertOk()->json('data'));

        $template->activate();

        $read = $this->getJson("/api/v1/services/{$slug}")->assertOk()
            ->assertJsonPath('data.detail_template.id', $template->id)
            ->assertJsonCount(4, 'data.detail_template.sections')
            ->assertJsonPath('data.detail_template.sections.0.type', 'record_hero')
            ->assertJsonPath('data.detail_template.sections.1.type', 'rich_text')
            ->assertJsonPath('data.detail_template.sections.1.data.heading', 'Why us')
            ->assertJsonPath('data.detail_template.sections.3.type', 'record_related')
            ->assertJsonPath('data.detail_template.sections.3.data.limit', 3);
        $this->assertSame([], (array) $read->json('data.detail_template.sections.2.data'));

        // The list rows carry nothing, and neither does another kind's page.
        $rows = $this->getJson('/api/v1/services')->assertOk()->json('data');
        $this->assertArrayNotHasKey('detail_template', $rows[0]);

        $template->deactivate();
        $this->assertArrayNotHasKey('detail_template', $this->getJson("/api/v1/services/{$slug}")->assertOk()->json('data'));
    }

    public function test_a_save_activation_or_delete_is_seen_by_the_next_public_read(): void
    {
        $slug = $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum')
            ->postJson('/api/v1/admin/services', ['title' => 'Cabling', 'status' => 'published'])->json('data.slug');

        // The "nothing active" answer is cached too — activating must forget it.
        $this->assertArrayNotHasKey('detail_template', $this->getJson("/api/v1/services/{$slug}")->json('data'));
        $this->assertNull(DetailTemplates::active('service'));

        $template = $this->make('service', 'First', active: true);
        $this->getJson("/api/v1/services/{$slug}")->assertJsonCount(2, 'data.detail_template.sections');

        $this->patchJson("/api/v1/admin/detail-templates/{$template->id}", [
            'blocks' => self::blocks('record_hero', 'record_body', 'record_related'),
        ])->assertOk();
        $this->getJson("/api/v1/services/{$slug}")->assertJsonCount(3, 'data.detail_template.sections');

        $this->deleteJson("/api/v1/admin/detail-templates/{$template->id}")->assertNoContent();
        $this->assertArrayNotHasKey('detail_template', $this->getJson("/api/v1/services/{$slug}")->json('data'));
        $this->assertFalse(Cache::has('detail_template.active.service') && Cache::get('detail_template.active.service') !== false);
    }

    public function test_each_of_the_seven_public_reads_carries_its_kinds_template(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager, RoleEnum::StoreManager);
        $records = [
            'solution' => ['solutions', 'solutions', ['title' => 'S', 'status' => 'published']],
            'service' => ['services', 'services', ['title' => 'S', 'status' => 'published']],
            'industry' => ['industries', 'industries', ['name' => 'S']],
            'case_study' => ['case-studies', 'case-studies', ['title' => 'S', 'status' => 'published']],
            'product' => ['products', 'products', ['name' => 'S', 'status' => 'published']],
            'store_product' => ['store/products', 'store/products', ['name' => 'S', 'type' => 'physical', 'price_paise' => 100000, 'status' => 'published']],
            'blog_post' => ['blog-posts', 'blog', ['title' => 'S', 'status' => 'published']],
        ];

        foreach ($records as $type => [$admin, $public, $payload]) {
            $slug = $this->actingAs($editor, 'sanctum')->postJson("/api/v1/admin/{$admin}", $payload)->assertCreated()->json('data.slug');
            $this->make($type, "Template for {$type}", active: true);

            $this->getJson("/api/v1/{$public}/{$slug}")->assertOk()
                ->assertJsonPath('data.detail_template.sections.0.type', 'record_hero')
                ->assertJsonPath('data.detail_template.sections.1.type', 'record_body');
        }
    }

    public function test_the_roles_that_own_each_kind_are_narrowed_by_the_controller(): void
    {
        $content = $this->staff(RoleEnum::ContentManager);
        $store = $this->staff(RoleEnum::StoreManager);
        $admin = $this->staff(RoleEnum::Admin);
        $post = fn (string $type) => $this->postJson('/api/v1/admin/detail-templates', ['type' => $type, 'name' => 'T', 'blocks' => self::blocks()]);
        $shop = $this->make('store_product', 'Shop');
        $solution = $this->make('solution', 'Solutions');

        $this->actingAs($content, 'sanctum');
        $post('solution')->assertCreated();
        $post('blog_post')->assertCreated();
        $post('store_product')->assertForbidden();
        $this->getJson("/api/v1/admin/detail-templates/{$shop->id}")->assertForbidden();
        $this->postJson("/api/v1/admin/detail-templates/{$shop->id}/activate")->assertForbidden();
        $this->deleteJson("/api/v1/admin/detail-templates/{$shop->id}")->assertForbidden();
        $this->getJson('/api/v1/admin/detail-templates?type=store_product')->assertForbidden();
        $this->assertNotContains('Shop', array_column($this->getJson('/api/v1/admin/detail-templates')->assertOk()->json('data'), 'name'));

        $this->app['auth']->forgetGuards();
        $this->actingAs($store, 'sanctum');
        $post('store_product')->assertCreated();
        $post('solution')->assertForbidden();
        $this->patchJson("/api/v1/admin/detail-templates/{$solution->id}", ['name' => 'Renamed'])->assertForbidden();
        $this->getJson('/api/v1/admin/detail-templates/options')->assertOk()
            ->assertJsonCount(1, 'data.detail_templates.types')
            ->assertJsonPath('data.detail_templates.types.0.value', 'store_product');
        $this->getJson('/api/v1/admin/detail-templates/records?type=solution')->assertForbidden();

        $this->app['auth']->forgetGuards();
        $this->actingAs($admin, 'sanctum');
        $post('solution')->assertCreated();
        $post('store_product')->assertCreated();
        $this->getJson('/api/v1/admin/detail-templates/options')->assertOk()->assertJsonCount(7, 'data.detail_templates.types');

        // Neither role reaches them from outside the two.
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->staff(RoleEnum::SeoManager), 'sanctum');
        $this->getJson('/api/v1/admin/detail-templates')->assertForbidden();
    }

    public function test_the_options_name_every_blocks_kinds_and_the_layout_the_page_has_today(): void
    {
        $data = $this->actingAs($this->staff(RoleEnum::Admin), 'sanctum')
            ->getJson('/api/v1/admin/detail-templates/options')->assertOk()
            ->assertJsonPath('data.detail_templates.required_block', 'record_body')
            ->json('data.detail_templates');

        foreach ($data['types'] as $type) {
            $offered = array_column($type['blocks'], 'value');
            // "Start from today's layout" can only seed blocks the kind may place, body included.
            $this->assertContains('record_body', $type['today']);
            $this->assertSame([], array_diff($type['today'], $offered), $type['value']);
            $this->assertSame(count($type['today']), count(array_unique($type['today'])));
        }
        $this->assertSame(count(PageSectionType::recordOptions()), count($data['record_block_types']));
        // The page builder's own options ride along for an account that cannot reach /admin/pages/builder.
        $this->getJson('/api/v1/admin/detail-templates/options')->assertJsonStructure(['data' => ['section_types', 'library', 'forms']]);
    }

    public function test_a_preview_validates_like_a_save_reads_the_chosen_record_and_writes_nothing(): void
    {
        $editor = $this->staff(RoleEnum::ContentManager);
        $slug = $this->actingAs($editor, 'sanctum')->postJson('/api/v1/admin/services', ['title' => 'A draft service', 'status' => 'draft'])->json('data.slug');
        $id = Service::query()->where('slug', $slug)->value('id');
        $before = DetailTemplate::query()->count();

        $blocks = [
            self::section('record_hero'),
            self::section('rich_text', ['heading' => 'Typed here', 'body' => '<p>Unsaved</p>']),
            self::section('record_body'),
        ];

        // A draft record is previewable; the template is the typed one, not a stored one.
        $this->postJson('/api/v1/admin/detail-templates/preview', ['type' => 'service', 'record_id' => $id, 'blocks' => $blocks])
            ->assertOk()
            ->assertJsonPath('data.type', 'service')
            ->assertJsonPath('data.record.title', 'A draft service')
            ->assertJsonPath('data.detail_template.id', 0)
            ->assertJsonCount(3, 'data.detail_template.sections')
            ->assertJsonPath('data.detail_template.sections.1.data.heading', 'Typed here')
            ->assertJsonMissingPath('data.record.schema');
        $this->assertSame($before, DetailTemplate::query()->count());

        // The same refusals as a save, and an unknown record.
        $this->postJson('/api/v1/admin/detail-templates/preview', ['type' => 'service', 'record_id' => $id, 'blocks' => self::blocks('record_hero')])
            ->assertStatus(422)->assertJsonValidationErrors('blocks');
        $this->postJson('/api/v1/admin/detail-templates/preview', ['type' => 'service', 'record_id' => $id, 'blocks' => self::blocks('record_body', 'record_buy')])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.1.type');
        $this->postJson('/api/v1/admin/detail-templates/preview', ['type' => 'service', 'record_id' => 999999, 'blocks' => $blocks])->assertStatus(422);
        $this->postJson('/api/v1/admin/detail-templates/preview', ['type' => 'store_product', 'record_id' => 1, 'blocks' => self::blocks()])->assertForbidden();
    }

    public function test_the_record_picker_lists_one_kinds_records_and_searches_them(): void
    {
        $this->actingAs($this->staff(RoleEnum::ContentManager), 'sanctum');
        $this->postJson('/api/v1/admin/industries', ['name' => 'Education']);
        $this->postJson('/api/v1/admin/industries', ['name' => 'Healthcare']);

        $this->getJson('/api/v1/admin/detail-templates/records?type=industry')->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('data.0.title', 'Education');
        $this->getJson('/api/v1/admin/detail-templates/records?type=industry&q=health')->assertOk()
            ->assertJsonCount(1, 'data')->assertJsonPath('data.0.title', 'Healthcare');
        $this->getJson('/api/v1/admin/detail-templates/records?type=nonsense')->assertStatus(422);
    }
}
