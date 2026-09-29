<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\Slider;
use App\Models\Solution;
use App\Models\User;
use App\Support\MediaMeta;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * The section page builder (2026-09-26, `docs/page-builder.md`): a page whose
 * template is `builder` is a stack of typed sections in `pages.blocks`, each
 * validated by its type, presented for the public site with hidden ones
 * omitted, and previewable without being saved.
 */
class PageBuilderTest extends TestCase
{
    use RefreshDatabase;

    private function user(RoleEnum $role = RoleEnum::ContentManager): User
    {
        $user = User::firstOrCreate(['email' => "builder-{$role->value}@example.test"], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function section(string $type, array $data, array $extra = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data, ...$extra];
    }

    /** @param  list<array<string, mixed>>  $blocks */
    private function create(array $blocks, array $overrides = [])
    {
        return $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages', array_replace([
            'title' => 'Built page', 'template' => 'builder', 'status' => 'published', 'blocks' => $blocks,
        ], $overrides));
    }

    private function media(string $path, string $mime = 'image/jpeg', ?string $alt = null): void
    {
        Media::create(['disk' => 'public', 'path' => $path, 'filename' => basename($path), 'mime' => $mime, 'size' => 10, 'alt_text' => $alt]);
        // The alt map is memoised per process; a test before this one may have loaded it without this file.
        MediaMeta::forget();
    }

    public function test_a_builder_page_stores_its_sections_and_the_public_read_presents_them(): void
    {
        $this->media('media/hero.jpg', 'image/jpeg', 'A rack of switches');

        $hero = self::section('hero', ['heading' => 'Networks that stay up', 'layout' => 'split', 'image_path' => 'media/hero.jpg',
            'primary' => ['label' => 'Talk to us', 'href' => '/contact'], 'junk' => 'never stored']);
        $text = self::section('rich_text', ['heading' => 'Hidden for now', 'body' => '<p>Not yet.</p>'], ['hidden' => true]);

        $created = $this->create([$hero, $text])->assertCreated()
            ->assertJsonPath('data.template', 'builder')
            ->assertJsonPath('data.blocks.0.data.image_path', 'media/hero.jpg')
            ->assertJsonMissingPath('data.blocks.0.data.junk')
            ->assertJsonPath('data.blocks.1.hidden', true);
        // A path holds dots, so it is read as a key rather than through a JSON path.
        $this->assertSame(asset('storage/media/hero.jpg'), $created->json('data.blocks_media')['media/hero.jpg'] ?? null);

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonCount(1, 'data.sections')
            ->assertJsonPath('data.sections.0.type', 'hero')
            ->assertJsonPath('data.sections.0.data.image', asset('storage/media/hero.jpg'))
            ->assertJsonPath('data.sections.0.data.image_alt', 'A rack of switches')
            ->assertJsonMissingPath('data.sections.0.data.image_path');
    }

    public function test_the_template_allowlist_takes_builder_and_nothing_else(): void
    {
        $this->create([], ['template' => 'canvas'])->assertStatus(422)->assertJsonValidationErrors('template');
        $this->create([], ['template' => 'builder'])->assertCreated();
    }

    public function test_a_default_page_carries_no_sections_on_the_public_read(): void
    {
        $this->create([self::section('divider', ['size' => 'small'])], ['template' => 'default', 'body' => '<p>Body</p>'])->assertCreated();

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonMissingPath('data.sections')
            ->assertJsonPath('data.body', '<p>Body</p>');
    }

    public function test_an_unknown_section_type_is_refused(): void
    {
        $this->create([self::section('carousel', ['heading' => 'x'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');
    }

    public function test_a_section_id_must_be_a_uuid_and_unique(): void
    {
        $a = self::section('divider', []);
        $this->create([$a, $a])->assertStatus(422)->assertJsonValidationErrors('blocks.1.id');
        $this->create([['id' => 'x'] + self::section('divider', [])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.id');
    }

    /** @return array<string, array{string, array<string, mixed>, array<string, mixed>, string}> */
    public static function typeRules(): array
    {
        return [
            'hero' => ['hero', ['heading' => 'H', 'layout' => 'centered'], ['heading' => 'H', 'layout' => 'split'], 'image_path'],
            'hero layout' => ['hero', ['heading' => 'H', 'layout' => 'cover', 'image_path' => 'media/a.jpg'], ['heading' => 'H', 'layout' => 'diagonal'], 'layout'],
            'hero button' => ['hero', ['heading' => 'H', 'layout' => 'centered', 'primary' => ['label' => 'Go', 'href' => '/x']], ['heading' => 'H', 'layout' => 'centered', 'primary' => ['label' => 'Go', 'href' => 'javascript:alert(1)']], 'primary.href'],
            'rich text' => ['rich_text', ['body' => '<p>Text</p>'], ['heading' => 'No body'], 'body'],
            'media text' => ['media_text', ['heading' => 'H', 'media' => 'youtube', 'youtube' => 'https://youtu.be/dQw4w9WgXcQ'], ['heading' => 'H', 'media' => 'youtube', 'youtube' => 'https://vimeo.com/1'], 'youtube'],
            'features' => ['features', ['items' => [['title' => 'One', 'icon' => 'shield']]], ['items' => [['icon' => 'Not An Icon!', 'title' => 'x']]], 'items.0.icon'],
            'features count' => ['features', ['columns' => 3, 'items' => [['title' => 'One']]], ['columns' => 5, 'items' => [['title' => 'One']]], 'columns'],
            'cards' => ['cards', ['source' => 'solutions', 'limit' => 3], ['source' => 'tickets'], 'source'],
            'cards category' => ['cards', ['source' => 'blog'], ['source' => 'blog', 'category' => 'anything'], 'category'],
            'faq' => ['faq', ['source' => 'custom', 'items' => [['question' => 'Q', 'answer' => 'A']]], ['source' => 'custom'], 'items'],
            'logos' => ['logos', ['source' => 'clients'], ['source' => 'everyone'], 'source'],
            'testimonial' => ['testimonial', ['quote' => 'Q', 'name' => 'N'], ['name' => 'N'], 'quote'],
            'video' => ['video', ['source' => 'youtube', 'youtube' => 'dQw4w9WgXcQ'], ['source' => 'mp4'], 'video_path'],
            'divider' => ['divider', ['size' => 'large', 'rule' => true], ['size' => 'huge'], 'size'],
            'content block' => ['content_block', ['block_id' => 0], [], 'block_id'],
        ];
    }

    /**
     * @param  array<string, mixed>  $valid
     * @param  array<string, mixed>  $invalid
     */
    #[DataProvider('typeRules')]
    public function test_each_type_validates_what_it_draws(string $type, array $valid, array $invalid, string $key): void
    {
        $this->media('media/a.jpg');

        if ($type !== 'content_block') {
            $this->create([self::section($type, $valid)])->assertCreated();
        }
        $this->create([self::section($type, $invalid)], ['title' => 'Refused'])
            ->assertStatus(422)->assertJsonValidationErrors("blocks.0.data.{$key}");
    }

    public function test_rich_text_in_a_section_is_sanitised(): void
    {
        $this->create([self::section('rich_text', ['body' => '<p>Safe</p><script>alert(1)</script><img src=x onerror="x()">'])])
            ->assertCreated();

        $body = Page::query()->where('slug', 'built-page')->first()->blocks[0]['data']['body'];
        $this->assertStringNotContainsString('<script', $body);
        $this->assertStringNotContainsString('onerror', $body);
        $this->assertStringContainsString('<p>Safe</p>', $body);
    }

    public function test_a_media_path_must_be_in_the_library_and_the_right_kind(): void
    {
        $this->create([self::section('testimonial', ['quote' => 'Q', 'name' => 'N', 'photo_path' => 'media/missing.jpg'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.photo_path');

        $this->media('media/brochure.pdf', 'application/pdf');
        $this->create([self::section('video', ['source' => 'mp4', 'video_path' => 'media/brochure.pdf'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.video_path');

        $this->media('media/clip.mp4', 'video/mp4');
        $this->create([self::section('video', ['source' => 'mp4', 'video_path' => 'media/clip.mp4'])])->assertCreated();
    }

    public function test_a_reference_must_exist_and_be_published(): void
    {
        $draft = Slider::create(['name' => 'Draft', 'slug' => 'draft-slider', 'status' => PublishStatus::Draft]);
        $this->create([self::section('slider', ['slider_id' => $draft->id])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.slider_id');

        $this->create([self::section('form', ['form_id' => 999])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.form_id');

        $form = Form::create(['name' => 'Contact', 'slug' => 'contact-us', 'status' => PublishStatus::Published]);
        $this->create([self::section('form', ['form_id' => $form->id, 'heading' => 'Write to us'])])->assertCreated();

        // Presented as its current slug, and stored as the id.
        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonPath('data.sections.0.data.slug', 'contact-us')
            ->assertJsonMissingPath('data.sections.0.data.form_id');

        // Unpublished later, the section drops out rather than drawing nothing.
        $form->update(['status' => PublishStatus::Draft]);
        $this->getJson('/api/v1/pages/built-page')->assertOk()->assertJsonCount(0, 'data.sections');
    }

    public function test_a_content_block_is_presented_inline(): void
    {
        $block = ContentBlock::create(['type' => 'cta', 'layout' => 'band', 'name' => 'Audit', 'slug' => 'audit', 'status' => PublishStatus::Published,
            'data' => ['heading' => 'Book an audit', 'primary' => ['label' => 'Book', 'href' => '/contact']]]);

        $this->create([self::section('content_block', ['block_id' => $block->id])])->assertCreated();

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonPath('data.sections.0.data.block.type', 'cta')
            ->assertJsonPath('data.sections.0.data.block.content.heading', 'Book an audit');
    }

    public function test_a_background_is_checked_by_the_theme_rule(): void
    {
        $this->create([self::section('divider', [], ['background' => ['kind' => 'solid', 'colour' => 'red']])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.background');

        $this->create([self::section('divider', [], ['background' => ['kind' => 'gradient', 'colour' => '#0B1020', 'colour2' => '#5b21b6', 'angle' => 135, 'enabled' => false]])])
            ->assertCreated()
            ->assertJsonPath('data.blocks.0.background.colour', '#0b1020')
            ->assertJsonMissingPath('data.blocks.0.background.enabled');
    }

    public function test_a_reveal_is_stored_by_shape_and_presented(): void
    {
        $this->create([self::section('divider', [], ['reveal' => 'Slide in'])])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.reveal');

        $this->create([
            self::section('divider', [], ['reveal' => 'zoom-in']),
            self::section('divider', [], ['reveal' => 'none']),
            self::section('divider', [], ['reveal' => 'default']),
            self::section('divider', []),
        ])->assertCreated()
            ->assertJsonPath('data.blocks.0.reveal', 'zoom-in')
            ->assertJsonPath('data.blocks.1.reveal', 'none')
            // "default" is what the section does on its own, so it is never stored.
            ->assertJsonPath('data.blocks.2.reveal', null)
            ->assertJsonPath('data.blocks.3.reveal', null);

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonPath('data.sections.0.reveal', 'zoom-in')
            ->assertJsonPath('data.sections.1.reveal', 'none')
            ->assertJsonPath('data.sections.2.reveal', null);
    }

    public function test_a_cards_section_is_resolved_to_the_live_list(): void
    {
        Solution::create(['title' => 'Networking', 'slug' => 'networking', 'summary' => 'Switching and routing.', 'icon' => 'network', 'status' => PublishStatus::Published, 'sort_order' => 1]);
        Solution::create(['title' => 'Draft one', 'slug' => 'draft-one', 'status' => PublishStatus::Draft, 'sort_order' => 2]);

        $this->create([self::section('cards', ['heading' => 'What we build', 'source' => 'solutions'])])->assertCreated();

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonCount(1, 'data.sections.0.data.items')
            ->assertJsonPath('data.sections.0.data.items.0.path', '/solutions/networking')
            ->assertJsonPath('data.sections.0.data.items.0.icon', 'network')
            ->assertJsonPath('data.sections.0.data.index_path', '/solutions');
    }

    public function test_faq_sections_join_the_one_faq_page_graph(): void
    {
        $this->create([
            self::section('faq', ['source' => 'custom', 'items' => [['question' => 'First?', 'answer' => 'Yes.'], ['question' => 'Second?', 'answer' => 'Also yes.']]]),
            self::section('faq', ['source' => 'custom', 'items' => [['question' => 'Hidden?', 'answer' => 'Not counted.']]], ['hidden' => true]),
        ])->assertCreated();

        $graph = $this->getJson('/api/v1/pages/built-page')->assertOk()->json('data.faq_schema');
        $this->assertSame('FAQPage', $graph['@type'] ?? $graph['@graph'][0]['@type'] ?? null);
        $this->assertStringContainsString('First?', (string) json_encode($graph));
        $this->assertStringNotContainsString('Hidden?', (string) json_encode($graph));
    }

    public function test_the_preview_validates_and_presents_without_writing(): void
    {
        $page = Page::create(['title' => 'Existing', 'slug' => 'existing', 'template' => 'builder', 'status' => PublishStatus::Draft]);
        $page->faqs()->create(['question' => 'From the page?', 'answer' => 'Yes.', 'sort_order' => 0]);
        $before = Page::query()->count();

        $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/preview', [
            'page_id' => $page->id,
            'blocks' => [
                self::section('hero', ['heading' => 'Draft heading', 'layout' => 'centered']),
                self::section('faq', ['source' => 'page']),
            ],
        ])->assertOk()
            ->assertJsonPath('data.sections.0.data.heading', 'Draft heading')
            ->assertJsonPath('data.sections.1.data.items.0.question', 'From the page?');

        $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/preview', [
            'blocks' => [self::section('hero', ['layout' => 'centered'])],
        ])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.heading');

        $this->assertSame($before, Page::query()->count());
        $this->assertNull($page->fresh()->blocks);
    }

    public function test_the_builder_options_and_presets_are_sent_by_the_api(): void
    {
        Slider::create(['name' => 'Hero', 'slug' => 'hero', 'status' => PublishStatus::Published]);
        Slider::create(['name' => 'Draft', 'slug' => 'draft', 'status' => PublishStatus::Draft]);

        $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()
            ->assertJsonPath('data.section_types.0.value', 'hero')
            ->assertJsonPath('data.section_presets.0.value', 'landing')
            ->assertJsonCount(1, 'data.sliders')
            ->assertJsonPath('data.sliders.0.slug', 'hero');

        $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages')->assertOk()
            ->assertJsonPath('meta.section_types.1.value', 'rich_text');
    }

    public function test_every_preset_passes_the_rules_it_will_be_saved_under(): void
    {
        $presets = $this->actingAs($this->user(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->json('data.section_presets');

        foreach ($presets as $i => $preset) {
            $blocks = array_map(fn ($s) => ['id' => (string) Str::uuid()] + $s, $preset['sections']);
            $this->create($blocks, ['title' => "Preset {$i}", 'slug' => "preset-{$i}"])->assertCreated();
        }
    }

    public function test_only_a_content_manager_reaches_the_builder(): void
    {
        $engineer = $this->user(RoleEnum::SupportEngineer);

        $this->actingAs($engineer, 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertForbidden();
        $this->actingAs($engineer, 'sanctum')->postJson('/api/v1/admin/pages/preview', ['blocks' => []])->assertForbidden();
    }
}
