<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\CaseStudy;
use App\Models\Industry;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\Service;
use App\Models\Solution;
use App\Models\User;
use App\Support\PageSections\RecordSections;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Builder sections on records other than pages (0.129.0,
 * `docs/page-builder.md` "Sections on other records"): a solution, a
 * service, an industry and a case study may each lay out their **body area**
 * as sections. The list is the page builder's, validated by its rules; the
 * record chooses between it and its written body with `body_layout`, and
 * neither is cleared by choosing the other.
 */
class RecordSectionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Each record type: its admin path, its public path, its model, the key
     * its written body is stored under, and what a create needs.
     *
     * @return array<string, array{0: string, 1: string, 2: class-string, 3: string, 4: array<string, mixed>}>
     */
    public static function records(): array
    {
        return [
            'solution' => ['solutions', 'solutions', Solution::class, 'overview', ['title' => 'Managed Wi-Fi', 'status' => 'published']],
            'service' => ['services', 'services', Service::class, 'body', ['title' => 'Managed Wi-Fi', 'status' => 'published']],
            'industry' => ['industries', 'industries', Industry::class, 'body', ['name' => 'Managed Wi-Fi']],
            'case study' => ['case-studies', 'case-studies', CaseStudy::class, 'body', ['title' => 'Managed Wi-Fi', 'status' => 'published']],
        ];
    }

    private function editor(): User
    {
        $user = User::firstOrCreate(['email' => 'sections-editor@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $role = RoleEnum::ContentManager;
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function section(string $type, array $data, array $extra = []): array
    {
        return ['id' => (string) Str::uuid(), 'type' => $type, 'hidden' => false, 'background' => null, 'data' => $data, ...$extra];
    }

    /** @param  array<string, mixed>  $payload */
    private function store(string $admin, array $payload)
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson("/api/v1/admin/{$admin}", $payload);
    }

    /** @param  array<string, mixed>  $base */
    #[DataProvider('records')]
    public function test_a_record_stores_its_sections_and_its_page_reads_them_in_place_of_the_body(string $admin, string $public, string $model, string $body, array $base): void
    {
        $created = $this->store($admin, [
            ...$base,
            $body => '<p>The written body.</p>',
            'body_layout' => 'sections',
            'blocks' => [
                self::section('rich_text', ['heading' => 'How it works', 'body' => '<p>Laid out.</p>', 'stray' => 'dropped']),
                self::section('checklist', ['heading' => 'Included', 'items' => [['text' => 'A survey'], ['text' => 'A report']]], ['hidden' => true]),
            ],
        ])->assertCreated()
            ->assertJsonPath('data.body_layout', 'sections')
            ->assertJsonCount(2, 'data.blocks')
            ->assertJsonPath('data.blocks.0.data.heading', 'How it works');

        // Declared keys only reach the column, as on a page.
        $record = $model::query()->findOrFail($created->json('data.id'));
        $this->assertArrayNotHasKey('stray', $record->blocks[0]['data']);

        // The public page: the visible sections, presented — and the body
        // still sent, so switching back loses nothing.
        $this->getJson("/api/v1/{$public}/{$created->json('data.slug')}")->assertOk()
            ->assertJsonCount(1, 'data.sections')
            ->assertJsonPath('data.sections.0.type', 'rich_text')
            ->assertJsonPath('data.sections.0.data.heading', 'How it works')
            ->assertJsonPath("data.{$body}", '<p>The written body.</p>');

        // A list row carries neither the list nor the presented sections.
        $row = collect($this->getJson("/api/v1/{$public}")->assertOk()->json('data'))->firstWhere('id', $created->json('data.id'));
        $this->assertIsArray($row);
        $this->assertArrayNotHasKey('sections', $row);
        $this->assertArrayNotHasKey('blocks', $row);
    }

    /** @param  array<string, mixed>  $base */
    #[DataProvider('records')]
    public function test_the_written_body_is_what_the_page_draws_until_sections_are_chosen(string $admin, string $public, string $model, string $body, array $base): void
    {
        $blocks = [self::section('rich_text', ['heading' => 'Kept for later', 'body' => '<p>Not shown yet.</p>'])];

        // Nothing said about the layout: the record is as it always was.
        $created = $this->store($admin, [...$base, 'blocks' => $blocks])->assertCreated()->assertJsonPath('data.body_layout', 'body');
        $id = $created->json('data.id');
        $slug = $created->json('data.slug');

        $this->assertArrayNotHasKey('sections', $this->getJson("/api/v1/{$public}/{$slug}")->assertOk()->json('data'));

        // Choosing sections shows them; choosing the body again hides them
        // and clears nothing; a patch that names neither leaves both alone.
        $this->patchJson("/api/v1/admin/{$admin}/{$id}", ['body_layout' => 'sections'])->assertOk()->assertJsonCount(1, 'data.blocks');
        $this->getJson("/api/v1/{$public}/{$slug}")->assertOk()->assertJsonPath('data.sections.0.data.heading', 'Kept for later');

        $this->patchJson("/api/v1/admin/{$admin}/{$id}", ['body_layout' => 'body'])->assertOk()->assertJsonCount(1, 'data.blocks');
        $this->assertArrayNotHasKey('sections', $this->getJson("/api/v1/{$public}/{$slug}")->assertOk()->json('data'));

        $this->patchJson("/api/v1/admin/{$admin}/{$id}", ['summary' => 'Only this'])->assertOk()
            ->assertJsonPath('data.body_layout', 'body')->assertJsonCount(1, 'data.blocks');

        // Sections chosen with none laid out is still the written body.
        $this->patchJson("/api/v1/admin/{$admin}/{$id}", ['body_layout' => 'sections', 'blocks' => []])->assertOk()->assertJsonCount(0, 'data.blocks');
        $this->assertArrayNotHasKey('sections', $this->getJson("/api/v1/{$public}/{$slug}")->assertOk()->json('data'));

        $this->patchJson("/api/v1/admin/{$admin}/{$id}", ['body_layout' => 'columns'])->assertStatus(422)->assertJsonValidationErrors('body_layout');
    }

    /** @param  array<string, mixed>  $base */
    #[DataProvider('records')]
    public function test_a_section_is_checked_by_the_page_builders_rules_and_its_rich_text_cleaned(string $admin, string $public, string $model, string $body, array $base): void
    {
        // Typed questions need their questions, exactly as on a page.
        $this->store($admin, [...$base, 'blocks' => [self::section('faq', ['source' => 'custom'])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.items');

        $created = $this->store($admin, [...$base, 'blocks' => [
            self::section('rich_text', ['body' => '<p>Safe</p><script>alert(1)</script><img src=x onerror="x()">']),
            self::section('columns', ['columns' => [['heading' => 'One', 'body' => '<p>A</p><script>x()</script>'], ['heading' => 'Two', 'body' => '<p>B</p>']]]),
        ]])->assertCreated();

        $stored = $model::query()->findOrFail($created->json('data.id'))->blocks;
        $this->assertStringContainsString('<p>Safe</p>', $stored[0]['data']['body']);
        $this->assertStringNotContainsString('<script', $stored[0]['data']['body']);
        $this->assertStringNotContainsString('onerror', $stored[0]['data']['body']);
        $this->assertStringNotContainsString('<script', $stored[1]['data']['columns'][0]['body']);
    }

    public function test_a_body_area_cannot_hold_a_hero_a_theme_section_or_the_pages_own_faqs(): void
    {
        $base = ['title' => 'Managed Wi-Fi', 'status' => 'published'];

        $this->store('solutions', [...$base, 'blocks' => [self::section('hero', ['heading' => 'A second title', 'layout' => 'centered'])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.type');

        $this->store('solutions', [...$base, 'blocks' => [
            self::section('rich_text', ['body' => '<p>Fine.</p>']),
            self::section('theme_section', ['section' => 'solutions']),
        ]])->assertStatus(422)->assertJsonValidationErrors('blocks.1.type')->assertJsonMissingValidationErrors('blocks.0.type');

        $this->store('solutions', [...$base, 'blocks' => [self::section('faq', ['source' => 'page'])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.source');

        // The same hero is a page's to use — the refusal is the record's alone.
        $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'A page', 'template' => 'builder', 'status' => 'published',
            'blocks' => [self::section('hero', ['heading' => 'A page title', 'layout' => 'centered'])],
        ])->assertCreated();
    }

    public function test_a_linked_library_section_is_held_to_the_same_limits_on_write_and_on_read(): void
    {
        $library = fn (string $name, array $block) => SavedSection::create(['kind' => SavedSection::KIND_SECTION, 'name' => $name, 'blocks' => [$block]]);
        $hero = $library('A hero', self::section('hero', ['heading' => 'Library hero', 'layout' => 'centered']));
        $text = $library('Closing text', self::section('rich_text', ['heading' => 'From the library', 'body' => '<p>Ring the desk.</p>']));

        $base = ['title' => 'Managed Wi-Fi', 'status' => 'published', 'body_layout' => 'sections'];

        $this->store('solutions', [...$base, 'blocks' => [self::section('saved', ['saved_id' => $hero->id])]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.saved_id');

        $created = $this->store('solutions', [...$base, 'blocks' => [self::section('saved', ['saved_id' => $text->id])]])->assertCreated();
        $this->getJson('/api/v1/solutions/'.$created->json('data.slug'))->assertOk()
            ->assertJsonPath('data.sections.0.data.heading', 'From the library');

        // Edited into a hero after it was placed: the save never saw it, so
        // the read is what leaves it out.
        $text->update(['blocks' => [self::section('hero', ['heading' => 'Now a hero', 'layout' => 'centered'])]]);
        $this->getJson('/api/v1/solutions/'.$created->json('data.slug'))->assertOk()->assertJsonCount(0, 'data.sections');

        // And the library will not delete a section a record still places.
        $this->actingAs($this->editor(), 'sanctum')->deleteJson("/api/v1/admin/saved-sections/{$text->id}")
            ->assertStatus(422)
            ->assertJsonPath('message', 'This section is still placed, linked, on 1 solution. Make a copy of it there first.')
            ->assertJsonPath('linked_from.0.kind', 'solution')
            ->assertJsonPath('linked_from.0.title', 'Managed Wi-Fi');
    }

    public function test_questions_typed_into_a_section_join_the_records_one_faq_page(): void
    {
        $faq = self::section('faq', ['source' => 'custom', 'items' => [
            ['question' => 'How long does a survey take?', 'answer' => 'A day.'],
            ['question' => 'Is the report ours to keep?', 'answer' => 'Yes.'],
        ]]);

        $created = $this->store('solutions', [
            'title' => 'Managed Wi-Fi', 'status' => 'published', 'body_layout' => 'sections', 'blocks' => [$faq],
            'faqs' => [['question' => 'Do you cover weekends?', 'answer' => '<p>Yes.</p>']],
        ])->assertCreated();
        $slug = $created->json('data.slug');

        $graph = (string) json_encode($this->getJson("/api/v1/solutions/{$slug}")->assertOk()->json('data.faq_schema'));
        $this->assertStringContainsString('FAQPage', $graph);
        $this->assertStringContainsString('How long does a survey take?', $graph);
        $this->assertStringContainsString('Do you cover weekends?', $graph);

        // Back on the written body, the sections' questions are not on the
        // page, so they are not in its graph: one FAQ is under the gate.
        $this->patchJson('/api/v1/admin/solutions/'.$created->json('data.id'), ['body_layout' => 'body'])->assertOk();
        $this->assertArrayNotHasKey('faq_schema', $this->getJson("/api/v1/solutions/{$slug}")->assertOk()->json('data'));

        // A case study has no FAQs of its own; a section's questions are its graph.
        $study = $this->store('case-studies', ['title' => 'A rollout', 'status' => 'published', 'body_layout' => 'sections', 'blocks' => [$faq]])->assertCreated();
        $this->assertStringContainsString('Is the report ours to keep?', (string) json_encode(
            $this->getJson('/api/v1/case-studies/'.$study->json('data.slug'))->assertOk()->json('data.faq_schema'),
        ));
    }

    public function test_a_record_listed_inside_another_records_read_carries_no_sections(): void
    {
        $solution = $this->store('solutions', [
            'title' => 'Managed Wi-Fi', 'status' => 'published', 'body_layout' => 'sections',
            'blocks' => [self::section('rich_text', ['heading' => 'Only on its own page', 'body' => '<p>x</p>'])],
        ])->assertCreated();

        $industry = $this->store('industries', ['name' => 'Schools', 'solution_ids' => [$solution->json('data.id')]])->assertCreated();

        $nested = $this->getJson('/api/v1/industries/'.$industry->json('data.slug'))->assertOk()->json('data.solutions.0');
        $this->assertSame('Managed Wi-Fi', $nested['title']);
        $this->assertArrayNotHasKey('sections', $nested);
    }

    public function test_the_builder_options_say_what_a_record_may_not_hold(): void
    {
        $this->actingAs($this->editor(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()
            ->assertJsonPath('data.record_sections.excluded_types', RecordSections::excluded())
            ->assertJsonPath('data.record_sections.layouts.0.value', 'body')
            ->assertJsonPath('data.record_sections.layouts.1.value', 'sections');

        $this->assertSame(['hero', 'theme_section'], RecordSections::excluded());
    }
}
