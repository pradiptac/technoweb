<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\User;
use App\Support\MediaMeta;
use App\Support\PageSections\LayoutRules;
use App\Support\PageSections\SectionPresenter;
use App\Support\PageSections\SectionRules;
use Database\Seeders\SampleBuilderPageSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The custom layout section (0.147.0, `docs/page-builder.md` "The layout
 * section"): rows of columns of widgets, validated three levels down by what
 * each widget says it is, stored as only what its type declares, and drawn
 * by the website from `LayoutPresenter`'s shape.
 */
class LayoutSectionTest extends TestCase
{
    use RefreshDatabase;

    private function user(): User
    {
        $user = User::firstOrCreate(['email' => 'layout-editor@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => RoleEnum::ContentManager->label()])->id]);

        return $user;
    }

    private static int $n = 0;

    /** A row, column or widget id of the shape the console mints. */
    private static function id(): string
    {
        return 'a'.str_pad((string) ++self::$n, 7, '0', STR_PAD_LEFT);
    }

    /** @param  array<string, mixed>  $fields @return array<string, mixed> */
    private static function widget(string $type, array $fields = []): array
    {
        return ['id' => self::id(), 'type' => $type, ...$fields];
    }

    /** @param  list<array<string, mixed>>  $widgets @return array<string, mixed> */
    private static function column(array $widgets = [], array $fields = []): array
    {
        return [...$fields, 'widgets' => $widgets];
    }

    /** @param  list<array<string, mixed>>  $columns @return array<string, mixed> */
    private static function row(array $columns, array $fields = []): array
    {
        return ['id' => self::id(), ...$fields, 'columns' => $columns];
    }

    /** @param  list<array<string, mixed>>  $rows @return array<string, mixed> */
    private static function section(array $rows, array $data = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => 'layout', 'hidden' => false, 'background' => null, 'data' => ['heading' => 'Why us', ...$data, 'rows' => $rows]];
    }

    private function media(string $path, string $mime = 'image/jpeg', ?string $alt = null): void
    {
        Media::create(['disk' => 'public', 'path' => $path, 'filename' => basename($path), 'mime' => $mime, 'size' => 10, 'alt_text' => $alt]);
        MediaMeta::forget();
    }

    /** @param  list<array<string, mixed>>  $blocks */
    private function create(array $blocks, array $overrides = [])
    {
        return $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', array_replace([
            'title' => 'Laid out', 'template' => 'builder', 'status' => 'published', 'blocks' => $blocks,
        ], $overrides));
    }

    /** One of everything, in a plausible arrangement. @return array<string, mixed> */
    private function full(): array
    {
        $this->media('media/site.jpg', 'image/jpeg', 'A tidy rack');

        return self::section([
            self::row([
                self::column([
                    self::widget('heading', ['text' => 'Fast installs', 'size' => 'l']),
                    self::widget('text', ['html' => '<p>We <strong>cable</strong> it.</p>']),
                    self::widget('button', ['label' => 'Talk to us', 'href' => '/contact']),
                ]),
                self::column([self::widget('image', ['image_path' => 'media/site.jpg', 'ratio' => '16:9'])]),
            ], ['split' => 'wide_last']),
            self::row([
                self::column([self::widget('icon_box', ['icon' => 'shield', 'title' => 'Secure', 'body' => 'Locked down.'])], ['surface' => 'card']),
                self::column([self::widget('accordion', ['items' => [['question' => 'How long?', 'answer' => 'A day.']]])], ['surface' => 'raised']),
                self::column([self::widget('list', ['items' => [['text' => 'One'], ['text' => 'Two']], 'marker' => 'number'])]),
            ]),
        ]);
    }

    public function test_a_layout_saves_and_stores_only_what_each_widget_declares(): void
    {
        $block = $this->full();
        // Defaults and strays: neither is stored.
        $block['data']['rows'][0]['gap'] = 'm';
        $block['data']['rows'][0]['columns'][0]['widgets'][0]['href'] = '/stray';
        $block['data']['rows'][0]['columns'][0]['widgets'][0]['align'] = 'inherit';
        $block['data']['rows'][0]['columns'][0]['widgets'][2]['variant'] = 'primary';
        $block['data']['rows'][0]['columns'][0]['widgets'][1]['junk'] = 'never stored';

        $created = $this->create([$block])->assertCreated();
        $rows = $created->json('data.blocks.0.data.rows');

        $this->assertSame('wide_last', $rows[0]['split']);
        $this->assertArrayNotHasKey('gap', $rows[0]);
        $first = $rows[0]['columns'][0]['widgets'];
        $this->assertSame(['id', 'type', 'text', 'size'], array_keys($first[0]));
        $this->assertSame(['id', 'type', 'html'], array_keys($first[1]));
        $this->assertSame(['id', 'type', 'label', 'href'], array_keys($first[2]));
        // A split belongs to two columns: the three-column row has none, and a box brings its own settings only.
        $this->assertArrayNotHasKey('split', $rows[1]);
        $this->assertSame(['widgets'], array_keys($rows[0]['columns'][0]));
        $this->assertSame(['surface', 'widgets'], array_keys($rows[1]['columns'][0]));
        $this->assertSame('number', $rows[1]['columns'][2]['widgets'][0]['marker']);
    }

    public function test_the_public_read_presents_the_layout_with_a_resolved_picture(): void
    {
        $this->create([$this->full()])->assertCreated();

        $res = $this->getJson('/api/v1/pages/laid-out')->assertOk()
            ->assertJsonPath('data.sections.0.type', 'layout')
            ->assertJsonPath('data.sections.0.data.heading', 'Why us');

        $image = $res->json('data.sections.0.data.rows.0.columns.1.widgets.0');
        $this->assertSame(asset('storage/media/site.jpg'), $image['image']);
        $this->assertSame('A tidy rack', $image['image_alt']);
        $this->assertArrayHasKey('image_focus', $image);
        $this->assertArrayNotHasKey('image_path', $image);
    }

    public function test_a_picture_that_left_the_library_a_blank_column_and_an_empty_layout_are_dropped(): void
    {
        $this->media('media/gone.jpg');
        $stored = [self::section([
            self::row([
                self::column([self::widget('image', ['image_path' => 'media/gone.jpg']), self::widget('heading', ['text' => 'Stays'])]),
                self::column([self::widget('image', ['image_path' => 'media/gone.jpg'])]),
            ]),
        ])];
        Media::query()->where('path', 'media/gone.jpg')->forceDelete();
        MediaMeta::forget();

        $presented = SectionPresenter::present($stored);
        $columns = (array) $presented[0]['data'];
        $this->assertCount(1, $columns['rows'][0]['columns']);
        $this->assertCount(1, $columns['rows'][0]['columns'][0]['widgets']);
        $this->assertSame('heading', $columns['rows'][0]['columns'][0]['widgets'][0]['type']);

        // Nothing left: the section goes, as an empty cards list goes.
        $only = [self::section([self::row([self::column([self::widget('image', ['image_path' => 'media/gone.jpg'])])])])];
        $this->assertSame([], SectionPresenter::present($only));
        $this->assertSame([], SectionPresenter::present([self::section([self::row([self::column([])])])]));
    }

    public function test_errors_come_back_at_the_nested_path_the_console_field_is_at(): void
    {
        $block = self::section([
            self::row([
                self::column([self::widget('heading', ['text' => ''])]),
                self::column([
                    self::widget('text', ['html' => '<p>ok</p>']),
                    self::widget('text', ['html' => '<p>ok</p>']),
                    self::widget('text', ['html' => '<p>ok</p>']),
                    self::widget('button', ['label' => 'Go', 'href' => 'javascript:alert(1)']),
                ]),
            ]),
            self::row([self::column([self::widget('image', ['image_path' => 'media/missing.jpg'])])]),
            self::row([self::column([self::widget('image', [])])]),
        ]);

        $errors = $this->create([$block])->assertStatus(422)->json('errors');

        $this->assertArrayHasKey('blocks.0.data.rows.0.columns.0.widgets.0.text', $errors);
        $this->assertSame(['Write the heading.'], $errors['blocks.0.data.rows.0.columns.0.widgets.0.text']);
        $this->assertArrayHasKey('blocks.0.data.rows.0.columns.1.widgets.3.href', $errors);
        $this->assertArrayHasKey('blocks.0.data.rows.1.columns.0.widgets.0.image_path', $errors);
        $this->assertSame(['Choose a picture for this image.'], $errors['blocks.0.data.rows.2.columns.0.widgets.0.image_path']);
    }

    public function test_a_picture_must_be_an_image_in_the_library(): void
    {
        $this->media('media/brochure.pdf', 'application/pdf');

        $this->create([self::section([self::row([self::column([self::widget('image', ['image_path' => 'media/brochure.pdf'])])])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.image_path');
    }

    public function test_the_limits_are_enforced(): void
    {
        $widgets = fn (int $n) => array_map(fn () => self::widget('divider'), range(1, $n));
        $rowOf = fn (int $columns, int $perColumn) => self::row(array_map(fn () => self::column($widgets($perColumn)), range(1, $columns)));

        $this->create([self::section(array_map(fn () => $rowOf(1, 1), range(1, 9)))])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows');
        $this->create([self::section([$rowOf(5, 1)])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns');
        $this->create([self::section([$rowOf(1, 9)])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets');

        // 3 rows x 2 columns x 7 widgets = 42: each list is within its own limit, the section is not.
        $this->create([self::section([$rowOf(2, 7), $rowOf(2, 7), $rowOf(2, 7)])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows');
        $this->create([self::section([$rowOf(2, 7), $rowOf(2, 6), $rowOf(2, 6)])])->assertCreated();
    }

    public function test_the_characters_and_one_text_widgets_length_are_bounded(): void
    {
        $this->create([self::section([self::row([self::column([self::widget('text', ['html' => '<p>'.str_repeat('a', 20001).'</p>'])])])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.html');

        // Eight texts of 19,000 characters is under every per-widget limit and over the section's.
        $texts = array_map(fn () => self::widget('text', ['html' => '<p>'.str_repeat('a', 19000).'</p>']), range(1, 8));
        $this->create([self::section([self::row([self::column($texts)])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows');
    }

    public function test_a_split_needs_two_columns_and_ids_are_unique_and_shaped(): void
    {
        $this->create([self::section([self::row([self::column(), self::column(), self::column()], ['split' => 'wide_first'])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.split');

        $dupe = self::widget('divider');
        $this->create([self::section([self::row([self::column([$dupe, $dupe])])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.1.id');

        $this->create([self::section([self::row([self::column([self::widget('divider', ['id' => 'BAD ID'])])])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.id');

        $this->create([self::section([self::row([self::column([self::widget('video', [])])])])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.type');
    }

    public function test_reordered_input_is_put_back_in_position_order(): void
    {
        $block = self::section([
            self::row([self::column([self::widget('heading', ['text' => 'One']), self::widget('heading', ['text' => 'Two'])])]),
            self::row([self::column([self::widget('heading', ['text' => 'Three'])])]),
        ]);

        $normalised = LayoutRules::normalise([1 => $block['data']['rows'][1], 0 => $block['data']['rows'][0]]);

        $this->assertSame('Three', $normalised[1]['columns'][0]['widgets'][0]['text']);
        $this->assertSame('One', $normalised[0]['columns'][0]['widgets'][0]['text']);
    }

    public function test_text_widgets_are_sanitised_on_a_page_save_a_preview_and_a_library_save(): void
    {
        $block = self::section([self::row([self::column([
            self::widget('text', ['html' => '<p onclick="x()">Hi</p><script>alert(1)</script>']),
        ])])]);
        $dirty = fn (array $json) => $json['blocks'][0]['data']['rows'][0]['columns'][0]['widgets'][0]['html'] ?? '';

        $page = $this->create([$block])->assertCreated();
        $stored = $page->json('data.blocks.0.data.rows.0.columns.0.widgets.0.html');
        $this->assertStringNotContainsString('<script', $stored);
        $this->assertStringNotContainsString('onclick', $stored);
        $this->assertStringContainsString('Hi', $stored);

        $preview = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/preview', ['blocks' => [$block]])->assertOk();
        $shown = $preview->json('data.sections.0.data.rows.0.columns.0.widgets.0.html');
        $this->assertStringNotContainsString('<script', $shown);
        $this->assertStringNotContainsString('onclick', $shown);

        $saved = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Layout', 'blocks' => [$block],
        ])->assertCreated();
        $library = SavedSection::query()->findOrFail($saved->json('data.id'));
        $html = $library->blocks[0]['data']['rows'][0]['columns'][0]['widgets'][0]['html'];
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertSame('', $dirty([]));
    }

    public function test_a_layout_is_accepted_by_a_linked_library_section_and_presented_through_it(): void
    {
        $block = self::section([self::row([self::column([self::widget('heading', ['text' => 'From the library'])])])]);
        $saved = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Layout', 'blocks' => [$block],
        ])->assertCreated();

        $this->create([['id' => (string) Str::uuid(), 'type' => 'saved', 'hidden' => false, 'background' => null, 'data' => ['saved_id' => $saved->json('data.id')]]])->assertCreated();

        $this->getJson('/api/v1/pages/laid-out')->assertOk()
            ->assertJsonPath('data.sections.0.type', 'layout')
            ->assertJsonPath('data.sections.0.data.rows.0.columns.0.widgets.0.text', 'From the library');
    }

    public function test_inline_editing_offers_only_the_head(): void
    {
        $paths = collect(SectionRules::inlineFields()['layout'] ?? [])->pluck('max', 'path')->all();

        $this->assertSame(['kicker' => 80, 'heading' => 160, 'lede' => 400], $paths);
    }

    public function test_the_builder_options_send_the_widgets_and_limits(): void
    {
        $res = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk();

        $this->assertContains('layout', collect($res->json('data.section_types'))->pluck('value')->all());
        $this->assertSame(
            ['heading', 'text', 'button', 'image', 'spacer', 'divider', 'icon_box', 'accordion', 'list'],
            collect($res->json('data.layout.widgets'))->pluck('value')->all(),
        );
        $res->assertJsonPath('data.layout.limits.rows', 8)
            ->assertJsonPath('data.layout.limits.widgets', 40)
            ->assertJsonPath('data.layout.row.0.key', 'split');
        $this->assertSame('items', collect($res->json('data.layout.widgets'))->firstWhere('value', 'accordion')['list']['key']);
    }

    public function test_a_hostile_payload_is_refused_without_walking_it(): void
    {
        $rows = array_map(fn () => self::row([self::column([self::widget('divider')])]), range(1, 5000));
        // A key that would be a wildcard rule if it were used as one.
        $rows['*'] = self::row([self::column([self::widget('divider')])]);

        $rules = LayoutRules::rules(['rows' => $rows], 'blocks.0.data');
        // Eight rows, one column each, one widget each, and a handful of rules per level.
        $this->assertLessThan(200, count($rules));
        $this->assertStringNotContainsString('*', implode(',', array_keys($rules)));

        $started = microtime(true);
        $this->create([self::section($rows)])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.rows');
        $this->assertLessThan(10.0, microtime(true) - $started);
    }

    public function test_every_widget_type_is_listed_with_fields_the_rules_can_read(): void
    {
        foreach (LayoutRules::widgets() as $type => $spec) {
            foreach ([...$spec['fields'], ...($spec['list']['fields'] ?? [])] as $key => $field) {
                $this->assertContains($field['kind'], ['text', 'html', 'choice', 'bool', 'link', 'path', 'icon'], "{$type}.{$key}");
            }
        }
    }

    public function test_the_sample_pages_layout_passes_the_rules_a_save_runs(): void
    {
        foreach (['one', 'two', 'three', 'four'] as $name) {
            $this->media("media/{$name}.jpg");
        }

        (new SampleBuilderPageSeeder)->run();
        $page = Page::query()->where('slug', 'sample-builder-page')->firstOrFail();
        $layout = collect($page->blocks)->firstWhere('type', 'layout');

        $this->assertNotNull($layout);
        $this->assertSame('image', $layout['data']['rows'][0]['columns'][1]['widgets'][0]['type']);
        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/pages/{$page->id}", ['blocks' => $page->blocks])->assertOk();
    }

    public function test_a_page_with_a_layout_survives_a_second_save(): void
    {
        $created = $this->create([$this->full()])->assertCreated();
        $page = Page::query()->findOrFail($created->json('data.id'));

        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/pages/{$page->id}", ['blocks' => $page->blocks])->assertOk();
        $this->assertEquals($page->blocks, Page::query()->findOrFail($page->id)->blocks);
    }
}
