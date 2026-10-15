<?php

namespace Tests\Feature;

use App\Enums\Role as RoleEnum;
use App\Models\Activity;
use App\Models\Page;
use App\Models\Role;
use App\Models\SavedSection;
use App\Models\Solution;
use App\Models\User;
use App\Support\PageSections\SectionRules;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The custom code section (0.158.0, `docs/page-builder.md` "Custom code"):
 * code stored exactly as pasted, runs in a sandboxed frame by default, and
 * runs on the page itself only when an administrator chose that.
 */
class CustomCodeSectionTest extends TestCase
{
    use RefreshDatabase;

    private const CODE = '<div id="w">Hi</div><script>document.getElementById("w").textContent = "ran";</script><style>#w{color:red}</style>';

    private function user(RoleEnum $role): User
    {
        $user = User::firstOrCreate(['email' => "code-{$role->value}@example.test"], [
            'name' => ucfirst($role->value), 'password' => 'password-for-tests', 'is_active' => true,
        ]);
        $user->roles()->syncWithoutDetaching([Role::firstOrCreate(['slug' => $role->value], ['name' => $role->label()])->id]);

        return $user;
    }

    /** @param  array<string, mixed>  $data @return array<string, mixed> */
    private static function code(array $data = [], ?string $id = null): array
    {
        return [
            'id' => $id ?? (string) Str::uuid(), 'type' => 'custom_code', 'hidden' => false, 'background' => null,
            'data' => [...['label' => 'Booking widget', 'html' => self::CODE], ...$data],
        ];
    }

    private function as(RoleEnum $role): self
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($this->user($role), 'sanctum');
    }

    private function create(RoleEnum $role, array $blocks, array $extra = [])
    {
        return $this->as($role)->postJson('/api/v1/admin/pages', [
            'title' => 'Code page', 'template' => 'builder', 'status' => 'published', 'blocks' => $blocks, ...$extra,
        ]);
    }

    public function test_the_code_is_stored_and_sent_exactly_as_pasted(): void
    {
        $this->create(RoleEnum::ContentManager, [self::code(['height' => 'm'])])->assertCreated()
            ->assertJsonPath('data.blocks.0.data.html', self::CODE)
            ->assertJsonPath('data.blocks.0.data.height', 'm')
            ->assertJsonMissingPath('data.blocks.0.data.mode');

        $page = Page::query()->firstOrFail();
        $this->assertSame(self::CODE, $page->blocks[0]['data']['html']);

        $this->getJson('/api/v1/pages/code-page')->assertOk()
            ->assertJsonPath('data.sections.0.type', 'custom_code')
            ->assertJsonPath('data.sections.0.data.html', self::CODE)
            ->assertJsonPath('data.sections.0.data.label', 'Booking widget');
    }

    public function test_html_is_in_no_sanitiser_path_and_the_defaults_are_not_stored(): void
    {
        // Raw by design: a sanitiser path here would strip the script it exists to carry.
        $this->assertNotContains('blocks.*.data.html', SectionRules::RICH_TEXT);

        $this->create(RoleEnum::ContentManager, [self::code(['mode' => 'frame', 'height' => 'auto'])])->assertCreated()
            ->assertJsonMissingPath('data.blocks.0.data.mode')
            ->assertJsonMissingPath('data.blocks.0.data.height');
    }

    public function test_a_label_and_code_are_required_and_the_code_is_capped(): void
    {
        $this->create(RoleEnum::ContentManager, [self::code(['label' => ''])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.label');
        $this->create(RoleEnum::ContentManager, [self::code(['html' => ''])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.html');
        $this->create(RoleEnum::ContentManager, [self::code(['label' => str_repeat('a', 81)])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.label');
        $this->create(RoleEnum::ContentManager, [self::code(['html' => str_repeat('a', 50001)])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.html');
        $this->create(RoleEnum::ContentManager, [self::code(['height' => 'huge'])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.height');
        $this->create(RoleEnum::ContentManager, [self::code(['mode' => 'inline'])])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode');
        $this->create(RoleEnum::ContentManager, [self::code(['html' => str_repeat('a', 50000)])])->assertCreated();
    }

    public function test_a_content_manager_may_use_a_frame_but_not_the_page_itself(): void
    {
        $this->create(RoleEnum::ContentManager, [self::code()])->assertCreated();

        $errors = $this->create(RoleEnum::ContentManager, [self::code(['mode' => 'page'])], ['title' => 'Other'])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode')->json('errors');
        $this->assertSame('Only an administrator can let code run on the page itself.', $errors['blocks.0.data.mode'][0]);
        $this->assertSame(1, Page::query()->count());
    }

    public function test_an_administrator_may_let_it_run_on_the_page(): void
    {
        $this->create(RoleEnum::Admin, [self::code(['mode' => 'page'])])->assertCreated()
            ->assertJsonPath('data.blocks.0.data.mode', 'page');

        $this->getJson('/api/v1/pages/code-page')->assertOk()->assertJsonPath('data.sections.0.data.mode', 'page');
    }

    public function test_the_builder_options_say_who_may_run_code_on_the_page(): void
    {
        // The editor reads this from GET /admin/pages/builder; the first cut sent it on the pages index instead.
        $this->as(RoleEnum::Admin)->getJson('/api/v1/admin/pages/builder')->assertOk()->assertJsonPath('data.custom_code.page_mode', true);
        $this->app['auth']->forgetGuards();
        $this->as(RoleEnum::ContentManager)->getJson('/api/v1/admin/pages/builder')->assertOk()->assertJsonPath('data.custom_code.page_mode', false);
    }

    public function test_a_content_manager_keeps_an_administrators_page_mode_block_unchanged_and_cannot_change_it(): void
    {
        $block = self::code(['mode' => 'page']);
        $id = $this->create(RoleEnum::Admin, [$block])->assertCreated()->json('data.id');

        // Re-saved untouched alongside a new section: allowed.
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", [
            'title' => 'Renamed', 'blocks' => [$block, ['id' => (string) Str::uuid(), 'type' => 'divider', 'hidden' => false, 'background' => null, 'data' => []]],
        ])->assertOk()->assertJsonPath('data.blocks.0.data.mode', 'page');

        // Different code under the same id: refused.
        $changed = self::code(['mode' => 'page', 'html' => '<script>alert(1)</script>'], $block['id']);
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['blocks' => [$changed]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode');

        // The same code under a new id (a copy): refused, it was never authorised.
        $copy = self::code(['mode' => 'page']);
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['blocks' => [$block, $copy]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.1.data.mode');

        // Down to a frame is the content manager's to do; back up is not.
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['blocks' => [self::code([], $block['id'])]])->assertOk();
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['blocks' => [$block]])
            ->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode');
    }

    public function test_a_record_body_area_and_the_library_take_a_frame_and_hold_page_mode_to_administrators(): void
    {
        $solution = $this->as(RoleEnum::ContentManager)->postJson('/api/v1/admin/solutions', [
            'title' => 'Wi-Fi', 'status' => 'published', 'body_layout' => 'sections', 'blocks' => [self::code()],
        ])->assertCreated();

        $this->getJson('/api/v1/solutions/'.$solution->json('data.slug'))->assertOk()
            ->assertJsonPath('data.sections.0.type', 'custom_code')
            ->assertJsonPath('data.sections.0.data.html', self::CODE);

        $this->as(RoleEnum::ContentManager)->postJson('/api/v1/admin/solutions', [
            'title' => 'Wi-Fi 2', 'status' => 'published', 'blocks' => [self::code(['mode' => 'page'])],
        ])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode');
        $this->assertSame(1, Solution::query()->count());

        $this->as(RoleEnum::ContentManager)->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Widget', 'blocks' => [self::code()],
        ])->assertCreated();

        $this->as(RoleEnum::ContentManager)->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Widget 2', 'blocks' => [self::code(['mode' => 'page'])],
        ])->assertStatus(422)->assertJsonValidationErrors('blocks.0.data.mode');

        $this->as(RoleEnum::Admin)->postJson('/api/v1/admin/saved-sections', [
            'kind' => 'section', 'name' => 'Widget 3', 'blocks' => [self::code(['mode' => 'page'])],
        ])->assertCreated();
        $this->assertSame(2, SavedSection::query()->count());
    }

    public function test_the_unsaved_preview_accepts_it_and_saves_nothing(): void
    {
        $this->as(RoleEnum::ContentManager)->postJson('/api/v1/admin/pages/preview', ['blocks' => [self::code(['mode' => 'page'])]])
            ->assertOk()->assertJsonPath('data.sections.0.type', 'custom_code');
        $this->assertSame(0, Page::query()->count());
    }

    public function test_a_save_that_adds_or_changes_code_is_recorded_and_one_that_does_not_is_not(): void
    {
        $block = self::code();
        $id = $this->create(RoleEnum::ContentManager, [$block])->assertCreated()->json('data.id');
        Activity::query()->delete();

        // An ordinary edit of a page is not recorded...
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['title' => 'Same code', 'blocks' => [$block]])->assertOk();
        $this->assertSame(0, Activity::query()->count());

        // ...until the code changes.
        $this->as(RoleEnum::ContentManager)->patchJson("/api/v1/admin/pages/{$id}", ['blocks' => [self::code(['html' => '<p>new</p>'], $block['id'])]])->assertOk();
        $entry = Activity::query()->firstOrFail();
        $this->assertSame('update', $entry->action);
        $this->assertTrue($entry->context['custom_code']);
    }
}
