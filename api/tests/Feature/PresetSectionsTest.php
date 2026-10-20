<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Media;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The builder's "From a preset" section and the Testimonials section's
 * preset source (docs/content-presets.md).
 */
class PresetSectionsTest extends TestCase
{
    use RefreshDatabase;

    private function staff(): User
    {
        $user = User::firstOrCreate(['email' => 'cm-sections@example.test'], ['name' => 'Ed', 'password' => 'password-for-tests', 'is_active' => true]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id]);

        return $user;
    }

    /** @param array{type: string, data: array<string, mixed>} $section */
    private function page(array $section)
    {
        return $this->actingAs($this->staff(), 'sanctum')->postJson('/api/v1/admin/pages', [
            'title' => 'About', 'slug' => 'about-us', 'status' => 'published', 'template' => 'builder',
            'blocks' => [['id' => (string) Str::uuid(), 'type' => $section['type'], 'data' => $section['data']]],
        ]);
    }

    public function test_a_preset_list_needs_an_installed_preset(): void
    {
        $this->page(['type' => 'preset_list', 'data' => ['preset' => 'awards']])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.preset');
    }

    public function test_a_preset_list_presents_published_entries_and_drops_when_empty(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/awards')->assertCreated();
        $this->page(['type' => 'preset_list', 'data' => ['preset' => 'awards', 'limit' => 3]])->assertCreated();
        $this->getJson('/api/v1/pages/about-us')->assertOk()->assertJsonCount(0, 'data.sections');

        $as->postJson('/api/v1/admin/content-types/awards/entries', [
            'title' => 'Partner of the year', 'status' => 'published',
            'custom_fields' => ['awarding_body' => 'Cisco', 'year' => 2026],
        ])->assertCreated();

        $this->getJson('/api/v1/pages/about-us')->assertOk()
            ->assertJsonPath('data.sections.0.type', 'preset_list')
            ->assertJsonPath('data.sections.0.data.index_path', '/awards')
            ->assertJsonPath('data.sections.0.data.items.0.title', 'Partner of the year')
            ->assertJsonPath('data.sections.0.data.items.0.custom_data.awarding_body', 'Cisco');
    }

    public function test_an_investors_list_names_its_document_types(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/investors')->assertCreated();
        $pdf = Media::create(['filename' => 'a.pdf', 'path' => 'media/a.pdf', 'mime' => 'application/pdf', 'size' => 10, 'disk' => 'public']);
        $as->postJson('/api/v1/admin/content-types/investors/entries', [
            'title' => 'Q2', 'status' => 'published',
            'custom_fields' => ['document_type' => 'annual_report', 'financial_year' => '2026-27', 'document' => $pdf->path],
        ])->assertCreated();
        $this->page(['type' => 'preset_list', 'data' => ['preset' => 'investors']])->assertCreated();

        $this->getJson('/api/v1/pages/about-us')->assertOk()
            ->assertJsonPath('data.sections.0.data.document_types.1.label', 'Annual report');
    }

    public function test_the_builder_options_list_installed_presets(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->getJson('/api/v1/admin/pages/builder')->assertOk()
            ->assertJsonPath('data.presets', [])->assertJsonPath('data.testimonials_installed', false);

        $as->postJson('/api/v1/admin/content-types/presets/investors')->assertCreated();
        $as->postJson('/api/v1/admin/content-types/presets/testimonials')->assertCreated();
        $as->getJson('/api/v1/admin/pages/builder')->assertOk()
            ->assertJsonPath('data.presets.0.value', 'investors')
            ->assertJsonPath('data.presets.0.document_types.0.value', 'financial_results')
            ->assertJsonPath('data.testimonials_installed', true);
    }

    public function test_testimonials_from_the_preset_have_the_typed_shape(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/testimonials')->assertCreated();
        foreach (['A. Sen', 'B. Roy'] as $name) {
            $as->postJson('/api/v1/admin/content-types/testimonials/entries', [
                'title' => $name, 'status' => 'published', 'custom_fields' => ['quote' => "Quote from {$name}", 'role' => 'CIO'],
            ])->assertCreated();
        }
        $this->page(['type' => 'testimonials', 'data' => ['source' => 'preset', 'limit' => 4]])->assertCreated();

        $data = $this->getJson('/api/v1/pages/about-us')->assertOk()->json('data.sections.0.data');
        $this->assertCount(2, $data['items']);
        // The type's own order: manual, then by name.
        $this->assertSame('A. Sen', $data['items'][0]['name']);
        $this->assertSame('Quote from A. Sen', $data['items'][0]['quote']);
        $this->assertSame('CIO', $data['items'][0]['role']);
        $this->assertArrayNotHasKey('source', $data);
    }

    public function test_testimonials_from_the_preset_drop_under_two(): void
    {
        $as = $this->actingAs($this->staff(), 'sanctum');
        $as->postJson('/api/v1/admin/content-types/presets/testimonials')->assertCreated();
        $as->postJson('/api/v1/admin/content-types/testimonials/entries', [
            'title' => 'A. Sen', 'status' => 'published', 'custom_fields' => ['quote' => 'Only one.'],
        ])->assertCreated();
        $this->page(['type' => 'testimonials', 'data' => ['source' => 'preset']])->assertCreated();

        $this->getJson('/api/v1/pages/about-us')->assertOk()->assertJsonCount(0, 'data.sections');
    }

    public function test_typed_testimonials_are_unchanged(): void
    {
        $this->page(['type' => 'testimonials', 'data' => ['items' => [
            ['quote' => 'One', 'name' => 'A'], ['quote' => 'Two', 'name' => 'B'],
        ]]])->assertCreated();

        $data = $this->getJson('/api/v1/pages/about-us')->json('data.sections.0.data');
        $this->assertArrayNotHasKey('source', $data);
        $this->assertSame('One', $data['items'][0]['quote']);
    }
}
