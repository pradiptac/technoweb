<?php

namespace Tests\Feature;

use App\Enums\PublishStatus;
use App\Enums\Role as RoleEnum;
use App\Models\ContentBlock;
use App\Models\Form;
use App\Models\Media;
use App\Models\Page;
use App\Models\Role;
use App\Models\Setting;
use App\Models\Slider;
use App\Models\Solution;
use App\Models\TeamMember;
use App\Models\User;
use App\Support\MediaMeta;
use Database\Seeders\SettingsSeeder;
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
            'stats' => ['stats', ['display' => 'figures', 'items' => [['value' => '340+', 'label' => 'Sites']]], ['display' => 'pie', 'items' => [['value' => '1', 'label' => 'x']]], 'display'],
            'stats percent' => ['stats', ['display' => 'rings', 'items' => [['value' => '99%', 'label' => 'Uptime', 'percent' => 99]]], ['display' => 'bars', 'items' => [['value' => '9', 'label' => 'x']]], 'items.0.percent'],
            'steps' => ['steps', ['layout' => 'vertical', 'items' => [['title' => 'One'], ['title' => 'Two']]], ['layout' => 'vertical', 'items' => [['title' => 'Only one']]], 'items'],
            'tabs' => ['tabs', ['items' => [['label' => 'A', 'body' => 'a'], ['label' => 'B', 'body' => 'b']]], ['items' => [['label' => 'A', 'body' => 'a'], ['label' => 'B']]], 'items.1.body'],
            'checklist' => ['checklist', ['columns' => 2, 'items' => [['text' => 'Fast']]], ['columns' => 4, 'items' => [['text' => 'Fast']]], 'columns'],
            'cta' => ['cta', ['heading' => 'Talk to us', 'tone' => 'brand', 'call' => true], ['heading' => 'H', 'tone' => 'neon'], 'tone'],
            'comparison' => ['comparison', ['plans' => [['name' => 'Basic'], ['name' => 'Pro']], 'rows' => [['label' => 'Support', 'cells' => ['yes', 'no']]]], ['plans' => [['name' => 'Only']], 'rows' => [['label' => 'x']]], 'plans'],
            'comparison cell' => ['comparison', ['plans' => [['name' => 'A'], ['name' => 'B']], 'rows' => [['label' => 'x']]], ['plans' => [['name' => 'A'], ['name' => 'B']], 'rows' => [['label' => 'x', 'cells' => [str_repeat('a', 61)]]]], 'rows.0.cells.0'],
            'timeline' => ['timeline', ['items' => [['date' => '2010', 'title' => 'Founded'], ['date' => '2020', 'title' => 'Grew']]], ['items' => [['date' => '2010', 'title' => 'A'], ['title' => 'B']]], 'items.1.date'],
            'before and after' => ['before_after', ['before_path' => 'media/a.jpg', 'after_path' => 'media/a.jpg'], ['after_path' => 'media/a.jpg'], 'before_path'],
            'testimonials' => ['testimonials', ['items' => [['quote' => 'Good', 'name' => 'A'], ['quote' => 'Fine', 'name' => 'B']]], ['items' => [['quote' => 'Good', 'name' => 'A']]], 'items'],
            'team' => ['team', ['department' => 'Support', 'limit' => 6, 'group' => true], ['limit' => 100], 'limit'],
            'downloads' => ['downloads', ['items' => [['title' => 'Brochure', 'file_path' => 'media/a.jpg']]], ['items' => [['title' => 'No file']]], 'items.0.file_path'],
            'downloads file' => ['downloads', ['items' => [['title' => 'Brochure', 'file_path' => 'media/a.jpg']]], ['items' => [['title' => 'Gone', 'file_path' => 'media/nowhere.pdf']]], 'items.0.file_path'],
            'countdown' => ['countdown', ['heading' => 'Launch', 'ends_at' => '2030-01-01T10:00'], ['heading' => 'Launch', 'ends_at' => 'next Tuesday'], 'ends_at'],
            'columns' => ['columns', ['columns' => [['body' => '<p>a</p>'], ['heading' => 'B', 'body' => '<p>b</p>']]], ['columns' => [['body' => '<p>only one</p>']]], 'columns'],
            'columns body' => ['columns', ['columns' => [['body' => '<p>a</p>'], ['body' => '<p>b</p>']]], ['columns' => [['body' => '<p>a</p>'], ['heading' => 'B']]], 'columns.1.body'],
            'map' => ['map', ['url' => 'https://www.google.com/maps/embed?pb=!1m18'], ['url' => 'https://evil.example/maps/embed'], 'url'],
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

    public function test_the_new_bands_are_stored_as_declared_and_presented(): void
    {
        $this->media('media/tab.jpg', 'image/jpeg', 'A tab picture');

        $this->create([
            self::section('stats', ['display' => 'figures', 'items' => [['value' => '16', 'label' => 'Years', 'percent' => '40', 'colour' => 'red']]]),
            self::section('stats', ['display' => 'bars', 'items' => [['value' => '99%', 'label' => 'Uptime', 'percent' => '99']]]),
            self::section('tabs', ['items' => [
                ['label' => 'One', 'body' => 'First', 'image_path' => 'media/tab.jpg'],
                ['label' => 'Two', 'body' => 'Second'],
            ]]),
            self::section('cta', ['heading' => 'Call us', 'call' => '1']),
        ])->assertCreated();

        $stored = Page::query()->where('slug', 'built-page')->first()->blocks;
        // A percentage belongs to rings and bars only, and nothing undeclared is kept
        // (MySQL reorders a JSON object's keys, so the comparison ignores order).
        $this->assertEquals(['value' => '16', 'label' => 'Years'], $stored[0]['data']['items'][0]);
        $this->assertSame(99, $stored[1]['data']['items'][0]['percent']);
        $this->assertSame(['stats', 'stats', 'tabs', 'cta'], array_column($stored, 'type'));
        $this->assertTrue($stored[3]['data']['call']);

        $sections = $this->getJson('/api/v1/pages/built-page')->assertOk()->json('data.sections');
        $this->assertStringEndsWith('storage/media/tab.jpg', $sections[2]['data']['items'][0]['image']);
        $this->assertSame('A tab picture', $sections[2]['data']['items'][0]['image_alt']);
        $this->assertArrayNotHasKey('image_path', $sections[2]['data']['items'][0]);
        $this->assertArrayNotHasKey('image', $sections[2]['data']['items'][1]);
    }

    /**
     * `validated()` rebuilds the list rule by rule, so a section whose only
     * fields sit under a wildcard came back after the sections behind it, and
     * a save moved it down the page. Pinned with a features section holding
     * nothing but its points, ahead of one with a plain heading.
     */
    public function test_sections_keep_the_order_they_were_sent_in(): void
    {
        $this->create([
            self::section('features', ['items' => [['title' => 'Only points']]]),
            self::section('rich_text', ['heading' => 'After', 'body' => '<p>x</p>']),
            self::section('steps', ['layout' => 'vertical', 'items' => [['title' => 'A'], ['title' => 'B']]]),
            self::section('cta', ['heading' => 'Last']),
        ])->assertCreated();

        $this->assertSame(
            ['features', 'rich_text', 'steps', 'cta'],
            array_column(Page::query()->where('slug', 'built-page')->first()->blocks, 'type'),
        );
    }

    public function test_the_comparison_timeline_before_after_and_testimonials_are_stored_and_presented(): void
    {
        $this->media('media/before.jpg', 'image/jpeg', 'The rack before');
        $this->media('media/after.jpg', 'image/jpeg', 'The rack after');
        $this->media('media/face.jpg', 'image/jpeg', 'A customer');

        $this->create([
            self::section('comparison', [
                'plans' => [['name' => 'Basic', 'note' => '₹9,000'], ['name' => 'Pro'], ['name' => 'Plus']],
                'highlight' => '1',
                // A blank cell stays in its column as null; a stray key is dropped.
                'rows' => [['label' => 'On-site visits', 'cells' => ['yes', ' ', 'Two a month'], 'colour' => 'red']],
            ]),
            self::section('timeline', ['items' => [['date' => '2010', 'title' => 'Founded'], ['date' => '2026', 'title' => 'Today', 'body' => 'Twelve engineers']]]),
            self::section('before_after', ['before_path' => 'media/before.jpg', 'after_path' => 'media/after.jpg', 'start' => '40']),
            self::section('testimonials', ['items' => [
                ['quote' => 'Quick.', 'name' => 'Asha', 'photo_path' => 'media/face.jpg'],
                ['quote' => 'Tidy.', 'name' => 'Ravi'],
            ]]),
        ])->assertCreated();

        $stored = Page::query()->where('slug', 'built-page')->first()->blocks;
        $this->assertSame(['comparison', 'timeline', 'before_after', 'testimonials'], array_column($stored, 'type'));
        $this->assertSame(['yes', null, 'Two a month'], $stored[0]['data']['rows'][0]['cells']);
        $this->assertArrayNotHasKey('colour', $stored[0]['data']['rows'][0]);
        $this->assertSame(1, $stored[0]['data']['highlight']);
        $this->assertSame(40, $stored[2]['data']['start']);

        $sections = $this->getJson('/api/v1/pages/built-page')->assertOk()->json('data.sections');
        $this->assertStringEndsWith('storage/media/before.jpg', $sections[2]['data']['before']);
        $this->assertSame('The rack after', $sections[2]['data']['after_alt']);
        $this->assertArrayNotHasKey('before_path', $sections[2]['data']);
        $this->assertSame('A customer', $sections[3]['data']['items'][0]['photo_alt']);
        $this->assertArrayNotHasKey('photo', $sections[3]['data']['items'][1]);
    }

    public function test_team_downloads_countdown_columns_and_map_are_stored_and_presented(): void
    {
        $this->media('media/brochure.pdf', 'application/pdf');
        Media::query()->where('path', 'media/brochure.pdf')->update(['size' => 245760, 'filename' => 'AMC brochure.pdf']);
        TeamMember::create(['name' => 'Asha Rao', 'designation' => 'Engineer', 'department' => 'Support', 'status' => 'published', 'sort_order' => 1]);
        TeamMember::create(['name' => 'Ravi Sen', 'designation' => 'Sales', 'department' => 'Sales', 'status' => 'published', 'sort_order' => 2]);

        $this->create([
            self::section('team', ['heading' => 'Our engineers', 'department' => 'Support', 'group' => '0']),
            self::section('downloads', ['items' => [
                ['title' => 'AMC brochure', 'file_path' => 'media/brochure.pdf', 'note' => 'Four pages'],
            ]]),
            self::section('countdown', ['heading' => 'Offer ends', 'ends_at' => '2030-01-01T10:00', 'done_text' => 'The offer has ended.']),
            self::section('columns', ['columns' => [
                ['heading' => 'Offices', 'body' => '<p>Desks</p><script>alert(1)</script>'],
                ['heading' => 'Factories', 'body' => '<p>Rugged <img src=x onerror="x()"></p>'],
            ]]),
            self::section('map', ['url' => 'https://www.google.com/maps/embed?pb=!1m18', 'address' => 'Salt Lake, Kolkata']),
        ])->assertCreated();

        $stored = Page::query()->where('slug', 'built-page')->first()->blocks;
        $this->assertSame(['team', 'downloads', 'countdown', 'columns', 'map'], array_column($stored, 'type'));
        $this->assertFalse($stored[0]['data']['group']);
        // Both columns' bodies are cleaned, a second list deep.
        $this->assertStringNotContainsString('<script', $stored[3]['data']['columns'][0]['body']);
        $this->assertStringNotContainsString('onerror', $stored[3]['data']['columns'][1]['body']);

        $sections = $this->getJson('/api/v1/pages/built-page')->assertOk()->json('data.sections');
        $this->assertSame(['Asha Rao'], array_column($sections[0]['data']['members'], 'name'), 'one department only');
        $file = $sections[1]['data']['items'][0];
        $this->assertSame(['AMC brochure', 'Four pages', 245760, 'pdf'], [$file['title'], $file['note'], $file['size'], $file['extension']]);
        $this->assertStringEndsWith('storage/media/brochure.pdf', $file['url']);
        $this->assertArrayNotHasKey('file_path', $file);
        // An instant with its offset, so every browser counts to the same moment.
        $this->assertSame('2030-01-01T10:00:00+05:30', $sections[2]['data']['ends_at']);
        $this->assertSame('Salt Lake, Kolkata', $sections[4]['data']['address']);
    }

    public function test_a_theme_section_is_stored_by_id_and_its_hero_must_open_the_page(): void
    {
        $this->create([
            self::section('theme_section', ['section' => 'hero']),
            self::section('theme_section', ['section' => 'solutions', 'stray' => 'dropped']),
            self::section('rich_text', ['heading' => 'Ours', 'body' => '<p>Words.</p>']),
        ])->assertCreated();

        $sections = $this->getJson('/api/v1/pages/built-page')->json('data.sections');
        $this->assertSame(['theme_section', 'theme_section', 'rich_text'], array_column($sections, 'type'));
        $this->assertSame(['section' => 'solutions'], $sections[1]['data']);

        // Anywhere but first, the theme's hero would be a second page title.
        $this->create([
            self::section('rich_text', ['heading' => 'First', 'body' => '<p>x</p>']),
            self::section('theme_section', ['section' => 'hero']),
        ], ['title' => 'Late hero'])->assertStatus(422)->assertJsonValidationErrors('blocks.1.data.section');

        $this->create([self::section('theme_section', ['section' => 'Not An Id'])], ['title' => 'Bad id'])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.section');
    }

    public function test_the_homepage_is_a_published_builder_page_or_the_theme(): void
    {
        $this->seed(SettingsSeeder::class);
        $admin = $this->user(RoleEnum::Admin);
        $built = $this->create([self::section('theme_section', ['section' => 'hero'])], ['title' => 'Home page'])->json('data.id');
        $draft = $this->create([self::section('divider', [])], ['title' => 'Draft one', 'status' => 'draft'])->json('data.id');
        $plain = $this->create([], ['title' => 'Plain', 'template' => 'default', 'body' => '<p>x</p>'])->json('data.id');
        $save = fn ($value) => $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/settings', ['settings' => [['key' => 'homepage_page_id', 'value' => $value]]]);

        $save((string) $draft)->assertStatus(422)->assertJsonValidationErrors('settings.0.value');
        $save((string) $plain)->assertStatus(422);

        // The picker offers the theme's homepage and the published builder pages only.
        $row = collect($this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/settings')->json('data.homepage'))->firstWhere('key', 'homepage_page_id');
        $this->assertSame(['', (string) $built], array_column($row['options'], 'value'));

        $save((string) $built)->assertOk();
        Setting::flushCache();
        $public = $this->getJson('/api/v1/settings')->json('data');
        $this->assertSame('home-page', $public['homepage_page_slug']);
        $this->assertArrayNotHasKey('homepage_page_id', $public);

        // Unpublished, the slug goes and `/` falls back to the theme's homepage.
        Page::query()->whereKey($built)->update(['status' => 'draft']);
        Setting::flushCache();
        $this->assertArrayNotHasKey('homepage_page_slug', $this->getJson('/api/v1/settings')->json('data'));

        $save('')->assertOk();
    }

    public function test_an_empty_team_or_a_vanished_download_drops_the_section(): void
    {
        $this->media('media/gone.pdf', 'application/pdf');
        $this->create([
            self::section('team', ['department' => 'Nobody']),
            self::section('downloads', ['items' => [['title' => 'Gone', 'file_path' => 'media/gone.pdf']]]),
            self::section('divider', []),
        ])->assertCreated();
        Media::query()->where('path', 'media/gone.pdf')->delete();

        $this->assertSame(['divider'], array_column($this->getJson('/api/v1/pages/built-page')->json('data.sections'), 'type'));
    }

    public function test_before_and_after_pictures_and_testimonial_photos_must_be_library_pictures(): void
    {
        $this->media('media/real.jpg', 'image/jpeg', 'Real');

        $this->create([
            self::section('before_after', ['before_path' => 'media/real.jpg', 'after_path' => 'media/nowhere.jpg']),
            self::section('testimonials', ['items' => [
                ['quote' => 'a', 'name' => 'A', 'photo_path' => 'media/nowhere.jpg'],
                ['quote' => 'b', 'name' => 'B'],
            ]]),
        ])->assertStatus(422)->assertJsonValidationErrors(['blocks.0.data.after_path', 'blocks.1.data.items.0.photo_path']);
    }

    public function test_a_page_body_is_laid_out_as_sections_and_nothing_is_written(): void
    {
        $pages = Page::query()->count();

        $sections = $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/sections-from-body', [
            'body' => '<p>Intro</p><script>alert(1)</script><h2>Cabling</h2><p>Cat6A.</p><h2>Wi-Fi</h2><p>Surveys.</p>',
        ])->assertOk()->json('data.sections');

        $this->assertSame(['rich_text', 'rich_text', 'rich_text'], array_column($sections, 'type'));
        $this->assertSame('Cabling', $sections[1]['data']['heading']);
        $this->assertStringNotContainsString('script', json_encode($sections), 'cleaned as a saved body is');
        $this->assertSame($pages, Page::query()->count());

        // What comes back is saveable as it stands.
        $this->create($sections)->assertCreated();

        $this->actingAs($this->user(), 'sanctum')->postJson('/api/v1/admin/pages/sections-from-body', ['body' => ''])
            ->assertStatus(422)->assertJsonValidationErrors('body');
        $this->actingAs($this->user(RoleEnum::SupportEngineer), 'sanctum')->postJson('/api/v1/admin/pages/sections-from-body', ['body' => '<p>x</p>'])
            ->assertForbidden();
    }

    public function test_a_tab_picture_must_be_a_library_picture(): void
    {
        $this->create([self::section('tabs', ['items' => [
            ['label' => 'One', 'body' => 'a', 'image_path' => 'media/nowhere.jpg'],
            ['label' => 'Two', 'body' => 'b'],
        ]])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.items.0.image_path');
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

    public function test_a_style_is_a_set_of_choices_stored_only_where_it_differs(): void
    {
        foreach ([
            ['pad_top' => '40px'],
            ['width' => 'full-bleed'],
            ['anchor' => 'Pricing Table'],
            ['show_on' => []],
            ['show_on' => ['watch']],
        ] as $bad) {
            $this->create([self::section('divider', [], ['style' => $bad])])->assertStatus(422);
        }

        $this->create([
            self::section('divider', [], ['style' => ['anchor' => 'pricing']]),
            self::section('divider', [], ['style' => ['anchor' => 'pricing']]),
        ])->assertStatus(422)->assertJsonValidationErrors('blocks.1.style.anchor');

        $this->create([
            self::section('divider', [], ['style' => [
                'pad_top' => 'xl', 'pad_bottom' => 'default', 'width' => 'narrow', 'align' => 'center',
                'heading' => 'l', 'anchor' => 'pricing', 'show_on' => ['desktop', 'phone'],
            ]]),
            // Every value the section's own: nothing is stored.
            self::section('divider', [], ['style' => ['pad_top' => 'default', 'show_on' => ['phone', 'tablet', 'desktop']]]),
        ])->assertCreated()
            ->assertJsonPath('data.blocks.0.style', [
                'pad_top' => 'xl', 'width' => 'narrow', 'align' => 'center', 'heading' => 'l',
                'anchor' => 'pricing', 'show_on' => ['phone', 'desktop'],
            ])
            ->assertJsonPath('data.blocks.1.style', null);

        $this->getJson('/api/v1/pages/built-page')->assertOk()
            ->assertJsonPath('data.sections.0.style.anchor', 'pricing')
            ->assertJsonPath('data.sections.1.style', null);
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
