<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\User;
use App\Support\Upgrade\Steps\SeedStarterTemplates;
use App\Support\Upgrade\UpgradeSteps;
use Database\Seeders\InstallSeeder;
use Database\Seeders\StarterTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The page-template library (0.162.0, docs/page-builder.md "The library"):
 * a category on a template, the filter, and the five starter templates —
 * valid by a save's own rules, seeded once, never overwritten.
 */
class SavedSectionLibraryTest extends TestCase
{
    use RefreshDatabase;

    private function editor(): User
    {
        $user = User::firstOrCreate(['email' => 'templates@example.test'], [
            'name' => 'Editor', 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => RoleEnum::ContentManager->value], ['name' => 'Content manager'])->id]);

        return $user;
    }

    /** @param array<string, mixed> $extra */
    private function save(string $kind, string $name, array $extra = [])
    {
        return $this->actingAs($this->editor(), 'sanctum')->postJson('/api/v1/admin/saved-sections', [
            'kind' => $kind, 'name' => $name,
            'blocks' => [['id' => (string) Str::uuid(), 'type' => 'divider', 'hidden' => false, 'background' => null, 'data' => []]],
            ...$extra,
        ]);
    }

    public function test_a_template_files_under_a_category_and_one_outside_the_list_is_refused(): void
    {
        $this->save('template', 'Landing', ['category' => 'landing'])->assertCreated()
            ->assertJsonPath('data.category', 'landing')->assertJsonPath('data.category_label', 'Landing page');
        $this->save('template', 'Bad', ['category' => 'astrology'])->assertStatus(422)->assertJsonValidationErrors('category');
        $this->save('template', 'None')->assertCreated()->assertJsonPath('data.category', null);
    }

    public function test_a_section_ignores_a_category_and_a_template_can_be_refiled(): void
    {
        $this->save('section', 'Divider', ['category' => 'about'])->assertCreated()->assertJsonPath('data.category', null);

        $id = $this->save('template', 'Refile', ['category' => 'about'])->json('data.id');
        $this->actingAs($this->editor(), 'sanctum')->patchJson("/api/v1/admin/saved-sections/{$id}", ['category' => 'event'])
            ->assertOk()->assertJsonPath('data.category', 'event');
        $this->actingAs($this->editor(), 'sanctum')->patchJson("/api/v1/admin/saved-sections/{$id}", ['category' => null])
            ->assertOk()->assertJsonPath('data.category', null);
        $this->actingAs($this->editor(), 'sanctum')->patchJson("/api/v1/admin/saved-sections/{$id}", ['category' => 'astrology'])
            ->assertStatus(422)->assertJsonValidationErrors('category');
    }

    public function test_the_index_filters_by_category_and_the_builder_lists_them(): void
    {
        $this->save('template', 'A', ['category' => 'about']);
        $this->save('template', 'B', ['category' => 'event']);

        $names = $this->actingAs($this->editor(), 'sanctum')->getJson('/api/v1/admin/saved-sections?category=event')
            ->assertOk()->assertJsonPath('meta.categories.0.value', 'landing')->json('data.*.name');
        $this->assertSame(['B'], $names);

        $library = $this->actingAs($this->editor(), 'sanctum')->getJson('/api/v1/admin/pages/builder')->assertOk()->json('data.library');
        $this->assertSame(array_keys(SavedSection::CATEGORIES), array_column($library['categories'], 'value'));
        $this->assertSame(['about', 'event'], array_column($library['templates'], 'category'));
        $this->assertSame(['About', 'Event'], array_column($library['templates'], 'category_label'));
    }

    public function test_the_starters_are_seeded_once_and_each_passes_a_saves_rules(): void
    {
        $this->seed(StarterTemplateSeeder::class);
        $this->seed(StarterTemplateSeeder::class);

        $starters = SavedSection::query()->where('kind', 'template')->where('name', 'like', 'Starter:%')->get();
        $this->assertCount(5, $starters);
        $this->assertEqualsCanonicalizing(['landing', 'about', 'services', 'contact', 'event'], $starters->pluck('category')->all());

        foreach ($starters as $starter) {
            // The stored blocks go back through the endpoint exactly as a save would send them.
            $this->save('template', "Copy of {$starter->name}", ['blocks' => $starter->blocks, 'category' => $starter->category])
                ->assertCreated();
            $this->assertGreaterThanOrEqual(4, count($starter->blocks), $starter->name);
        }
    }

    public function test_an_edited_starter_is_not_overwritten_on_a_reseed(): void
    {
        $this->seed(StarterTemplateSeeder::class);
        $starter = SavedSection::query()->where('name', 'Starter: about page')->firstOrFail();
        $starter->update(['description' => 'Our own words.', 'category' => 'other']);

        $this->seed(StarterTemplateSeeder::class);

        $this->assertSame('Our own words.', $starter->fresh()->description);
        $this->assertSame('other', $starter->fresh()->category);
        $this->assertSame(5, SavedSection::query()->where('name', 'like', 'Starter:%')->count());
    }

    public function test_the_installer_seeds_them_and_an_update_step_adds_them(): void
    {
        $this->assertContains(SeedStarterTemplates::class, UpgradeSteps::STEPS);

        $this->seed(InstallSeeder::class);
        $this->assertSame(5, SavedSection::query()->where('name', 'like', 'Starter:%')->count());

        SavedSection::query()->delete();
        UpgradeSteps::run(app(SeedStarterTemplates::class));
        $this->assertSame(5, SavedSection::query()->where('name', 'like', 'Starter:%')->count());
        $this->assertDatabaseHas('system_upgrade_steps', ['step' => '2026-10-11-seed-starter-templates']);
    }
}
