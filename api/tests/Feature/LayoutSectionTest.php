<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\Form;
use App\Models\Gallery;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\Slider;
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

        $this->create([self::section([self::row([self::column([self::widget('carousel', [])])])])])
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

    /** Edit on the page (0.156.0): the head, and the single-line words of the widgets, each tied to the widget type it belongs to. */
    public function test_inline_editing_offers_the_widgets_words_and_never_html(): void
    {
        $fields = SectionRules::inlineFields()['layout'] ?? [];
        $paths = collect($fields)->pluck('max', 'path')->all();
        $w = 'rows.*.columns.*.widgets.*';

        // The head, as before.
        $this->assertSame(['kicker' => 80, 'heading' => 160, 'lede' => 400], collect($paths)->only(['kicker', 'heading', 'lede'])->all());

        // A widget's words, with the rule's own length, at the top level and one level down in a slot.
        foreach (["{$w}", "{$w}.slots.*.widgets.*"] as $base) {
            $this->assertSame(160, $paths["{$base}.text"] ?? null, $base);
            $this->assertSame(40, $paths["{$base}.label"] ?? null, $base);
            $this->assertSame(80, $paths["{$base}.title"] ?? null, $base);
            $this->assertSame(200, $paths["{$base}.caption"] ?? null, $base);
            $this->assertSame(40, $paths["{$base}.link_label"] ?? null, $base);
            $this->assertSame(160, $paths["{$base}.items.*.text"] ?? null, $base);
        }

        // A container's own slot names (a tab, a panel) are text too; its slots hold no further containers.
        $this->assertSame(40, $paths["{$w}.slots.*.label"]);
        $this->assertSame(120, $paths["{$w}.slots.*.title"]);
        $this->assertArrayNotHasKey("{$w}.slots.*.widgets.*.slots.*.label", $paths);

        // `text` means a heading's words on a heading and a list point's on a list: each spec names its widget.
        $this->assertSame('heading', collect($fields)->firstWhere('path', "{$w}.text")['widget']);
        $this->assertSame('list', collect($fields)->firstWhere('path', "{$w}.items.*.text")['widget']);
        $this->assertSame('button', collect($fields)->firstWhere('path', "{$w}.label")['widget']);

        // Never rich text, the multi-line words, a link, a picture or a choice.
        foreach ($fields as $field) {
            $this->assertDoesNotMatchRegularExpression('/\.(html|body|answer|href|image_path|poster_path|youtube|video_path|size|align|variant)$/', $field['path'], $field['path']);
        }
        $this->assertArrayNotHasKey("{$w}.html", $paths);
        $this->assertArrayNotHasKey("{$w}.body", $paths);
        $this->assertArrayNotHasKey("{$w}.items.*.answer", $paths);
    }

    public function test_the_builder_options_send_the_widgets_and_limits(): void
    {
        $res = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk();

        $this->assertContains('layout', collect($res->json('data.section_types'))->pluck('value')->all());
        $this->assertSame(
            ['heading', 'text', 'button', 'image', 'spacer', 'divider', 'icon_box', 'accordion', 'list', 'video', 'box', 'tabs', 'panels', 'inner_row', 'form', 'slider', 'gallery'],
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
                $this->assertContains($field['kind'], ['text', 'html', 'choice', 'bool', 'link', 'path', 'icon', 'youtube', 'video', 'ref'], "{$type}.{$key}");
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

    // ------------------------------------------------- video, form, slider, gallery (0.149.0)

    /** @return array{0: Form, 1: Slider, 2: Gallery} */
    private function records(PublishStatus $status = PublishStatus::Published): array
    {
        return [
            Form::create(['name' => 'Survey', 'slug' => 'survey', 'status' => $status]),
            Slider::create(['name' => 'Hero', 'slug' => 'hero', 'status' => $status]),
            Gallery::create(['name' => 'Work', 'slug' => 'work', 'status' => $status]),
        ];
    }

    /** @return array<string, mixed> */
    private function embeds(): array
    {
        [$form, $slider, $gallery] = $this->records();
        $this->media('media/tour.mp4', 'video/mp4');
        $this->media('media/cover.jpg', 'image/jpeg', 'The tour');

        return self::section([
            self::row([
                self::column([
                    self::widget('video', ['youtube' => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'caption' => 'Our team', 'ratio' => '4:3']),
                    self::widget('video', ['source' => 'mp4', 'video_path' => 'media/tour.mp4', 'poster_path' => 'media/cover.jpg', 'ratio' => '9:16']),
                ]),
                self::column([
                    self::widget('form', ['form_id' => $form->id, 'show_on' => ['desktop']]),
                    self::widget('slider', ['slider_id' => $slider->id]),
                    self::widget('gallery', ['gallery_id' => $gallery->id]),
                ]),
            ]),
        ]);
    }

    public function test_the_video_form_slider_and_gallery_widgets_save_and_present(): void
    {
        $created = $this->create([$this->embeds()])->assertCreated();
        $stored = $created->json('data.blocks.0.data.rows.0.columns');

        // The pasted address is stored as the id; the default source is not stored; a form is its id.
        $this->assertSame('dQw4w9WgXcQ', $stored[0]['widgets'][0]['youtube']);
        $this->assertArrayNotHasKey('source', $stored[0]['widgets'][0]);
        $this->assertSame('4:3', $stored[0]['widgets'][0]['ratio']);
        $this->assertSame('mp4', $stored[0]['widgets'][1]['source']);
        $this->assertIsInt($stored[1]['widgets'][0]['form_id']);
        $this->assertSame(['desktop'], $stored[1]['widgets'][0]['show_on']);

        $columns = $this->getJson('/api/v1/pages/laid-out')->assertOk()->json('data.sections.0.data.rows.0.columns');
        [$youtube, $file] = $columns[0]['widgets'];
        $this->assertSame('dQw4w9WgXcQ', $youtube['youtube']);
        $this->assertArrayNotHasKey('video', $youtube);
        $this->assertSame(asset('storage/media/tour.mp4'), $file['video']);
        $this->assertSame(asset('storage/media/cover.jpg'), $file['poster']);
        $this->assertSame('The tour', $file['poster_alt']);
        $this->assertArrayNotHasKey('video_path', $file);
        $this->assertArrayNotHasKey('poster_path', $file);

        $this->assertSame(['survey', 'hero', 'work'], array_map(fn ($w) => $w['slug'], $columns[1]['widgets']));
        $this->assertArrayNotHasKey('form_id', $columns[1]['widgets'][0]);
        $this->assertSame(['desktop'], $columns[1]['widgets'][0]['show_on']);
    }

    public function test_a_field_that_belongs_to_the_other_source_is_not_kept(): void
    {
        $this->media('media/tour.mp4', 'video/mp4');
        $block = self::section([self::row([self::column([
            self::widget('video', ['source' => 'mp4', 'video_path' => 'media/tour.mp4', 'youtube' => 'not even a link']),
            self::widget('video', ['youtube' => 'dQw4w9WgXcQ', 'video_path' => 'media/missing.mp4']),
        ])])]);

        $widgets = $this->create([$block])->assertCreated()->json('data.blocks.0.data.rows.0.columns.0.widgets');
        $this->assertArrayNotHasKey('youtube', $widgets[0]);
        $this->assertArrayNotHasKey('video_path', $widgets[1]);
    }

    public function test_bad_video_sources_are_refused_at_the_widgets_own_field(): void
    {
        $this->media('media/brochure.pdf', 'application/pdf');
        $block = self::section([self::row([self::column([
            self::widget('video', ['youtube' => 'https://www.youtube.com.attacker.test/watch?v=dQw4w9WgXcQ']),
            self::widget('video', ['source' => 'mp4', 'video_path' => 'media/brochure.pdf']),
            self::widget('video', ['source' => 'mp4', 'video_path' => 'media/absent.mp4']),
            self::widget('video', ['youtube' => 'dQw4w9WgXcQ', 'poster_path' => 'media/brochure.pdf']),
            self::widget('video', []),
            self::widget('video', ['source' => 'mp4']),
        ])])]);

        $errors = $this->create([$block])->assertStatus(422)->json('errors');
        $at = 'blocks.0.data.rows.0.columns.0.widgets';

        $this->assertSame(['That is not a YouTube link this site can play.'], $errors["{$at}.0.youtube"]);
        $this->assertSame(['That file is not a video.'], $errors["{$at}.1.video_path"]);
        $this->assertSame(['Choose a video from the media library.'], $errors["{$at}.2.video_path"]);
        $this->assertSame(['Choose a picture from the media library.'], $errors["{$at}.3.poster_path"]);
        $this->assertSame(['Paste the YouTube link.'], $errors["{$at}.4.youtube"]);
        $this->assertSame(['Choose a video from the media library.'], $errors["{$at}.5.video_path"]);
    }

    public function test_a_form_slider_or_gallery_must_exist_and_be_published(): void
    {
        $this->records(PublishStatus::Draft);
        $form = Form::query()->firstOrFail();
        $slider = Slider::query()->firstOrFail();
        $gallery = Gallery::query()->firstOrFail();

        $block = self::section([self::row([self::column([
            self::widget('form', ['form_id' => $form->id]),
            self::widget('slider', ['slider_id' => $slider->id]),
            self::widget('gallery', ['gallery_id' => $gallery->id]),
            self::widget('form', ['form_id' => 99999]),
            self::widget('form', []),
        ])])]);

        $errors = $this->create([$block])->assertStatus(422)->json('errors');
        $at = 'blocks.0.data.rows.0.columns.0.widgets';

        $this->assertSame(['Publish the form first — a page cannot show a draft.'], $errors["{$at}.0.form_id"]);
        $this->assertSame(['Publish the slider first — a page cannot show a draft.'], $errors["{$at}.1.slider_id"]);
        $this->assertSame(['Publish the gallery first — a page cannot show a draft.'], $errors["{$at}.2.gallery_id"]);
        $this->assertSame(['That form no longer exists.'], $errors["{$at}.3.form_id"]);
        $this->assertSame(['Choose the form.'], $errors["{$at}.4.form_id"]);
    }

    public function test_a_layout_holds_one_slider_and_one_gallery(): void
    {
        [$form, $slider, $gallery] = $this->records();
        $other = Slider::create(['name' => 'Second', 'slug' => 'second', 'status' => PublishStatus::Published]);

        $block = self::section([
            self::row([self::column([self::widget('slider', ['slider_id' => $slider->id])])]),
            self::row([self::column([
                self::widget('slider', ['slider_id' => $other->id]),
                self::widget('gallery', ['gallery_id' => $gallery->id]),
                self::widget('gallery', ['gallery_id' => $gallery->id]),
                self::widget('form', ['form_id' => $form->id]),
                self::widget('form', ['form_id' => $form->id]),
            ])]),
        ]);

        $errors = $this->create([$block])->assertStatus(422)->json('errors');

        $this->assertSame(['A layout section holds one slider; use a second layout section for another.'], $errors['blocks.0.data.rows.1.columns.0.widgets.0.slider_id']);
        $this->assertSame(['A layout section holds one gallery; use a second layout section for another.'], $errors['blocks.0.data.rows.1.columns.0.widgets.2.gallery_id']);
        // The first of each is fine, and a form may be drawn twice.
        $this->assertArrayNotHasKey('blocks.0.data.rows.0.columns.0.widgets.0.slider_id', $errors);
        $this->assertArrayNotHasKey('blocks.0.data.rows.1.columns.0.widgets.1.gallery_id', $errors);
        $this->assertArrayNotHasKey('blocks.0.data.rows.1.columns.0.widgets.3.form_id', $errors);
        $this->assertArrayNotHasKey('blocks.0.data.rows.1.columns.0.widgets.4.form_id', $errors);
    }

    public function test_a_record_unpublished_or_deleted_after_saving_drops_its_widget_on_read(): void
    {
        $this->create([$this->embeds()])->assertCreated();

        Slider::query()->firstOrFail()->update(['status' => PublishStatus::Draft]);
        Gallery::query()->firstOrFail()->delete();

        $widgets = $this->getJson('/api/v1/pages/laid-out')->assertOk()->json('data.sections.0.data.rows.0.columns.1.widgets');
        $this->assertSame(['form'], array_column($widgets, 'type'));

        // A library file leaving: the file video goes, the YouTube one stays.
        Media::query()->where('path', 'media/tour.mp4')->forceDelete();
        MediaMeta::forget();
        $left = $this->getJson('/api/v1/pages/laid-out')->assertOk()->json('data.sections.0.data.rows.0.columns.0.widgets');
        $this->assertSame(['dQw4w9WgXcQ'], array_column($left, 'youtube'));

        // The form follows: the right-hand column has nothing left and goes.
        Form::query()->firstOrFail()->update(['status' => PublishStatus::Draft]);
        $this->assertCount(1, $this->getJson('/api/v1/pages/laid-out')->json('data.sections.0.data.rows.0.columns'));
    }

    public function test_the_new_widgets_survive_a_second_save(): void
    {
        $created = $this->create([$this->embeds()])->assertCreated();
        $page = Page::query()->findOrFail($created->json('data.id'));

        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/pages/{$page->id}", ['blocks' => $page->blocks])->assertOk();
        $this->assertEquals($page->blocks, Page::query()->findOrFail($page->id)->blocks);
    }

    public function test_the_builder_options_describe_the_new_widgets(): void
    {
        $widgets = collect($this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.layout.widgets'));

        $video = collect($widgets->firstWhere('value', 'video')['fields'])->keyBy('key');
        $this->assertSame(['source' => 'mp4'], $video['video_path']['when']);
        $this->assertSame('youtube', $video['source']['default']);
        $this->assertSame('ref', $widgets->firstWhere('value', 'slider')['fields'][0]['kind']);
        $this->assertSame('slider', $widgets->firstWhere('value', 'slider')['fields'][0]['record']);
        $this->assertTrue($widgets->firstWhere('value', 'gallery')['fields'][0]['single']);
        $this->assertFalse($widgets->firstWhere('value', 'form')['fields'][0]['single']);
    }
    // ------------------------------------------------- container widgets (0.154.0)

    /** @param  list<array<string, mixed>>  $widgets @return array<string, mixed> */
    private static function slot(array $widgets, array $fields = []): array
    {
        return ['id' => self::id(), ...$fields, 'widgets' => $widgets];
    }

    /** @param  list<array<string, mixed>>  $slots @return array<string, mixed> */
    private static function container(string $type, array $slots, array $fields = []): array
    {
        return self::widget($type, [...$fields, 'slots' => $slots]);
    }

    /** One tabs container and one panels container, in two columns. @return array<string, mixed> */
    private function containers(): array
    {
        return self::section([self::row([
            self::column([self::container('tabs', [
                self::slot([self::widget('heading', ['text' => 'Hardware']), self::widget('text', ['html' => '<p>Racks.</p>'])], ['label' => 'Hardware']),
                self::slot([self::widget('list', ['items' => [['text' => 'One']]])], ['label' => 'Services']),
            ])]),
            self::column([self::container('panels', [
                self::slot([self::widget('text', ['html' => '<p>Yes.</p>'])], ['title' => 'Is it quick?', 'open' => true]),
                self::slot([self::widget('button', ['label' => 'Ask', 'href' => '/contact'])], ['title' => 'More?']),
            ])]),
        ])]);
    }

    public function test_a_container_is_stored_and_presented_with_its_children(): void
    {
        $block = $this->containers();
        // Defaults and strays are not stored.
        $block['data']['rows'][0]['columns'][1]['widgets'][0]['slots'][1]['open'] = false;
        $block['data']['rows'][0]['columns'][0]['widgets'][0]['slots'][0]['widgets'][0]['href'] = '/stray';

        $created = $this->create([$block])->assertCreated();
        $tabs = $created->json('data.blocks.0.data.rows.0.columns.0.widgets.0');
        $panels = $created->json('data.blocks.0.data.rows.0.columns.1.widgets.0');

        $this->assertSame(['id', 'type', 'slots'], array_keys($tabs));
        $this->assertSame(['id', 'label', 'widgets'], array_keys($tabs['slots'][0]));
        $this->assertSame(['id', 'type', 'text'], array_keys($tabs['slots'][0]['widgets'][0]));
        $this->assertSame(['id', 'title', 'open', 'widgets'], array_keys($panels['slots'][0]));
        $this->assertSame(['id', 'title', 'widgets'], array_keys($panels['slots'][1]));

        $shown = $this->getJson('/api/v1/pages/laid-out')->assertOk()->json('data.sections.0.data.rows.0.columns.0.widgets.0');
        $this->assertSame('tabs', $shown['type']);
        $this->assertSame(['Hardware', 'Services'], array_column($shown['slots'], 'label'));
        $this->assertSame('Hardware', $shown['slots'][0]['widgets'][0]['text']);
    }

    public function test_inner_row_and_box_keep_only_their_own_settings(): void
    {
        $three = self::container('inner_row', [self::slot([self::widget('divider')]), self::slot([self::widget('spacer')]), self::slot([self::widget('divider')])], ['split' => 'wide_first', 'gap' => 'm', 'stack_from' => 'lg']);
        $box = self::container('box', [self::slot([self::widget('heading', ['text' => 'Boxed'])])], ['surface' => 'card', 'pad' => 'l']);
        $block = self::section([self::row([self::column([$three, $box])])]);

        // Three columns cannot take a split.
        $this->create([$block])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.split');

        unset($block['data']['rows'][0]['columns'][0]['widgets'][0]['split']);
        $saved = $this->create([$block])->assertCreated()->json('data.blocks.0.data.rows.0.columns.0.widgets');
        $this->assertSame(['id', 'type', 'stack_from', 'slots'], array_keys($saved[0]));
        $this->assertSame(['id', 'type', 'pad', 'slots'], array_keys($saved[1]));
    }

    public function test_a_container_inside_a_container_and_the_embeds_are_refused_on_the_childs_type(): void
    {
        [$form, $slider, $gallery] = $this->records();
        foreach ([
            self::container('tabs', [self::slot([self::widget('text', ['html' => '<p>x</p>'])], ['label' => 'A']), self::slot([], ['label' => 'B'])]),
            self::widget('form', ['form_id' => $form->id]),
            self::widget('slider', ['slider_id' => $slider->id]),
            self::widget('gallery', ['gallery_id' => $gallery->id]),
        ] as $child) {
            $block = self::section([self::row([self::column([
                self::container('box', [self::slot([self::widget('divider'), $child])]),
            ])])]);

            $key = 'blocks.0.data.rows.0.columns.0.widgets.0.slots.0.widgets.1.type';
            $res = $this->create([$block])->assertUnprocessable();
            $res->assertJsonValidationErrors($key);
            $this->assertStringContainsString('cannot hold another', $res->json('errors')[$key][0]);
        }
    }

    public function test_slot_counts_are_held_to_the_containers_limits(): void
    {
        $tabs = fn (int $n) => self::section([self::row([self::column([self::container('tabs', array_map(
            fn ($i) => self::slot([self::widget('divider')], ['label' => "Tab {$i}"]), range(1, $n),
        ))])])]);

        $this->create([$tabs(1)])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.slots');
        $this->create([$tabs(7)])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.slots');
        $this->create([$tabs(2)])->assertCreated();
        $this->create([$tabs(6)])->assertCreated();

        // A tab needs a name; a slot holds at most eight widgets.
        $unnamed = self::section([self::row([self::column([self::container('tabs', [self::slot([], ['label' => 'A']), self::slot([], [])])])])]);
        $this->create([$unnamed])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.slots.1.label');
        $nine = self::section([self::row([self::column([self::container('box', [self::slot(array_map(fn () => self::widget('divider'), range(1, 9)))])])])]);
        $this->create([$nine])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.slots.0.widgets');
    }

    public function test_children_count_toward_the_widget_total(): void
    {
        // Four boxes of eight children make 36 widgets with the boxes; the second column adds the rest.
        $boxes = fn () => array_map(fn () => self::container('box', [self::slot(array_map(fn () => self::widget('divider'), range(1, 8)))]), range(1, 4));
        $row = fn (int $extra) => self::row([self::column($boxes()), self::column(array_map(fn () => self::widget('divider'), range(1, $extra)))]);

        $this->create([self::section([$row(4)])])->assertCreated(); // 4 + 32 + 4 = 40
        $this->create([self::section([$row(5)])])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows');
    }

    public function test_ids_are_unique_across_children_and_slots(): void
    {
        $block = self::section([self::row([self::column([
            self::widget('divider', ['id' => 'dup00001']),
            self::container('box', [self::slot([self::widget('divider', ['id' => 'dup00001'])])]),
        ])])]);
        $this->create([$block])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.1.slots.0.widgets.0.id');

        $slotDup = self::section([self::row([self::column([
            self::container('box', [self::slot([self::widget('divider')], ['id' => 'slotdup1'])]),
            self::container('box', [self::slot([self::widget('divider')], ['id' => 'slotdup1'])]),
        ])])]);
        $this->create([$slotDup])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.1.slots.0.id');
    }

    public function test_the_walk_into_slots_is_capped(): void
    {
        $slots = array_map(fn () => self::slot([self::widget('divider')], ['label' => 'T']), range(1, 5000));
        $slots['*'] = self::slot([self::widget('divider')], ['label' => 'T']);
        $block = self::section([self::row([self::column([self::container('tabs', $slots)])])]);

        $rules = LayoutRules::rules($block['data'], 'blocks.0.data');
        $this->assertLessThan(120, count($rules));
        $this->assertStringNotContainsString('*', implode(',', array_keys($rules)));

        $this->create([$block])->assertUnprocessable()->assertJsonValidationErrors('blocks.0.data.rows.0.columns.0.widgets.0.slots');
    }

    public function test_text_in_a_child_is_sanitised_on_every_door(): void
    {
        $block = self::section([self::row([self::column([self::container('box', [self::slot([
            self::widget('text', ['html' => '<p onclick="x()">Hi</p><script>alert(1)</script>']),
        ])])])])]);
        $at = fn (array $d) => $d['rows'][0]['columns'][0]['widgets'][0]['slots'][0]['widgets'][0]['html'];
        $clean = function (string $html) {
            $this->assertStringNotContainsString('<script', $html);
            $this->assertStringNotContainsString('onclick', $html);
            $this->assertStringContainsString('Hi', $html);
        };

        $clean($at($this->create([$block])->assertCreated()->json('data.blocks.0.data')));
        $clean($at($this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/preview', ['blocks' => [$block]])->assertOk()->json('data.sections.0.data')));

        $saved = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Boxed', 'blocks' => [$block],
        ])->assertCreated();
        $clean($at(SavedSection::query()->findOrFail($saved->json('data.id'))->blocks[0]['data']));
    }

    public function test_an_emptied_slot_is_dropped_from_the_public_read(): void
    {
        $this->media('media/gone.jpg');
        $block = self::section([self::row([self::column([
            self::container('tabs', [
                self::slot([self::widget('image', ['image_path' => 'media/gone.jpg'])], ['label' => 'Pictures']),
                self::slot([self::widget('divider')], ['label' => 'Rule']),
            ]),
            self::widget('heading', ['text' => 'Stays']),
        ])])]);
        $this->create([$block])->assertCreated();

        Media::query()->where('path', 'media/gone.jpg')->forceDelete();
        MediaMeta::forget();
        $widgets = $this->getJson('/api/v1/pages/laid-out')->assertOk()->json('data.sections.0.data.rows.0.columns.0.widgets');
        $this->assertSame(['Rule'], array_column($widgets[0]['slots'], 'label'));
    }

    public function test_the_builder_options_describe_the_containers(): void
    {
        $widgets = collect($this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.layout.widgets'));
        $tabs = $widgets->firstWhere('value', 'tabs')['container'];

        $this->assertSame(['slots', 2, 6], [$tabs['key'], $tabs['min'], $tabs['max']]);
        $this->assertSame('label', $tabs['fields'][0]['key']);
        $this->assertNotContains('tabs', $tabs['child_types']);
        $this->assertNotContains('form', $tabs['child_types']);
        $this->assertContains('text', $tabs['child_types']);
        $this->assertArrayNotHasKey('container', $widgets->firstWhere('value', 'text'));
    }

    public function test_a_container_survives_a_second_save(): void
    {
        $created = $this->create([$this->containers()])->assertCreated();
        $page = Page::query()->findOrFail($created->json('data.id'));

        $this->actingAs($this->user(), 'sanctum')->patchJson("/api/v1/admin/pages/{$page->id}", ['blocks' => $page->blocks])->assertOk();
        $this->assertEquals($page->blocks, Page::query()->findOrFail($page->id)->blocks);
    }
}
